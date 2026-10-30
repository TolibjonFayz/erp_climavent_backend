import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, WhereOptions } from 'sequelize';
import { User } from 'src/users/models/user.model';
import { ActivityLog } from './activity-log.model';
import {
  ActivityChange,
  ActivityContext,
  MAX_CHANGES,
  activityStore,
  clean,
  isSecretKey,
  pickLabel,
} from './activity-context';
import { QueryActivityDto } from './dto/query-activity.dto';

export type ClientInfo = { userAgent?: string; ip?: string; origin?: string };

type RecordInput = {
  user_id?: number | null;
  action: string;
  module?: string | null;
  entity_type?: string | null;
  entity_id?: string | number | null;
  entity_label?: string | null;
  ok?: boolean;
  status?: number | null;
  error?: string | null;
  payload?: unknown;
  client?: ClientInfo;
};

// Bu jadvallar jurnalga tushmaydi: jurnalning o'zi, sessiyalar (login/logout alohida yoziladi),
// eski admin audit jadvali (u so'rov sifatida yoziladi)
const IGNORED_TABLES = new Set(['activity_logs', 'user_sessions', 'audit_logs', 'device_tokens']);
// Bu so'rovlar jurnalga yozilmaydi: kirish/chiqish servislarda yoziladi, terminal agenti va
// push tokeni ro'yxatdan o'tishi — foydalanuvchi amali emas
const SKIP_PATH = /^(users\/(login|logout|refresh)|attendance\/hik|devices)(\/|$)/;
const TOUCH_EVERY_MS = 60_000;
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TIMESTAMP_FIELDS = new Set(['createdAt', 'updatedAt']);

const tableOf = (model: any): string => {
  const t = model?.getTableName?.() ?? model?.tableName;
  return String(typeof t === 'object' ? t?.tableName : t || '?');
};

@Injectable()
export class ActivityService implements OnModuleInit {
  private readonly logger = new Logger('Activity');
  private readonly lastTouch = new Map<number, number>();

  constructor(
    @InjectModel(ActivityLog) private readonly logs: typeof ActivityLog,
    @InjectModel(User) private readonly users: typeof User,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  async onModuleInit() {
    await this.sequelize.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ',
    );
    this.registerHooks();
  }

  // ─── Bazadagi har bir o'zgarishni joriy so'rovga bog'lash ─────────────
  private registerHooks() {
    const push = (change: ActivityChange) => {
      const ctx = activityStore.getStore();
      if (!ctx || IGNORED_TABLES.has(change.table)) return;
      if (ctx.changes.length >= MAX_CHANGES) ctx.dropped++;
      else ctx.changes.push(change);
    };
    const plain = (instance: any) => {
      const data = clean(instance.get({ plain: true })) as Record<string, unknown>;
      for (const f of TIMESTAMP_FIELDS) delete data[f];
      return data;
    };
    const idOf = (instance: any) => {
      const pk = instance.constructor?.primaryKeyAttribute || 'id';
      return (instance.get(pk) as number | string) ?? null;
    };
    const h = this.sequelize;

    h.addHook('afterCreate', 'activity', (instance: any) => {
      const data = plain(instance);
      push({ table: tableOf(instance.constructor), op: 'create', id: idOf(instance), label: pickLabel(data), data });
    });

    h.addHook('afterUpdate', 'activity', (instance: any) => {
      const changed = (instance.changed() || []) as string[];
      const fields: Record<string, unknown> = {};
      for (const f of changed) {
        if (TIMESTAMP_FIELDS.has(f)) continue;
        const before = instance.previous(f);
        const after = instance.get(f);
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        fields[f] = isSecretKey(f) ? ['***', '***'] : [clean(before), clean(after)];
      }
      if (!Object.keys(fields).length) return;
      push({
        table: tableOf(instance.constructor),
        op: 'update',
        id: idOf(instance),
        label: pickLabel(instance.get({ plain: true })),
        fields,
      });
    });

    h.addHook('afterDestroy', 'activity', (instance: any) => {
      const data = plain(instance);
      push({ table: tableOf(instance.constructor), op: 'delete', id: idOf(instance), label: pickLabel(data), data });
    });

    h.addHook('afterBulkCreate', 'activity', (instances: any[], options: any) => {
      if (options?.individualHooks || !instances?.length) return;
      const table = tableOf(instances[0].constructor);
      // Bitta qator — oddiy create kabi to'liq; ko'p qator (import) — faqat soni
      if (instances.length === 1) {
        const data = plain(instances[0]);
        push({ table, op: 'create', id: idOf(instances[0]), label: pickLabel(data), data });
      } else {
        push({ table, op: 'bulk_create', count: instances.length });
      }
    });

    // Model.update / Model.destroy (servislarning ko'pchiligi shunday yozadi): eski qiymatlarni
    // bilish uchun o'zgarishdan oldin tegadigan qatorlarni o'qib qo'yamiz (ko'pi bilan 20 ta)
    const SNAPSHOT_LIMIT = 20;
    const snapshot = async (options: any) => {
      if (options?.individualHooks || !options?.model) return;
      if (!activityStore.getStore() || IGNORED_TABLES.has(tableOf(options.model))) return;
      try {
        options.__activityBefore = await options.model.unscoped().findAll({
          where: options.where,
          transaction: options.transaction,
          limit: SNAPSHOT_LIMIT + 1,
          raw: true,
          hooks: false,
        });
      } catch {
        options.__activityBefore = null;
      }
    };
    h.addHook('beforeBulkUpdate', 'activity', snapshot);
    h.addHook('beforeBulkDestroy', 'activity', snapshot);

    const pkOf = (options: any) => options.model?.primaryKeyAttribute || 'id';

    h.addHook('afterBulkUpdate', 'activity', (options: any) => {
      if (options?.individualHooks) return;
      const table = tableOf(options.model);
      const attrs = Object.entries(options?.attributes || {}).filter(([k]) => !TIMESTAMP_FIELDS.has(k));
      if (!attrs.length) return;
      const before: any[] | null = options.__activityBefore;
      if (before && before.length <= SNAPSHOT_LIMIT) {
        for (const row of before) {
          const fields: Record<string, unknown> = {};
          for (const [k, v] of attrs) {
            const old = row[k];
            if (JSON.stringify(clean(old)) === JSON.stringify(clean(v))) continue;
            fields[k] = isSecretKey(k) ? ['***', '***'] : [clean(old), clean(v)];
          }
          if (!Object.keys(fields).length) continue;
          push({ table, op: 'update', id: row[pkOf(options)] ?? null, label: pickLabel({ ...row, ...options.attributes }), fields });
        }
        return;
      }
      const fields = Object.fromEntries(attrs.map(([k, v]) => [k, isSecretKey(k) ? '***' : clean(v)]));
      push({ table, op: 'bulk_update', fields, where: clean(options.where), count: before?.length });
    });

    h.addHook('afterBulkDestroy', 'activity', (options: any) => {
      if (options?.individualHooks) return;
      const table = tableOf(options.model);
      const before: any[] | null = options.__activityBefore;
      if (before && before.length <= SNAPSHOT_LIMIT) {
        for (const row of before) {
          const data = clean(row) as Record<string, unknown>;
          for (const f of TIMESTAMP_FIELDS) delete data[f];
          push({ table, op: 'delete', id: row[pkOf(options)] ?? null, label: pickLabel(row), data });
        }
        return;
      }
      push({ table, op: 'bulk_delete', where: clean(options.where), count: before?.length });
    });

    h.addHook('afterUpsert', 'activity', (result: any, options: any) => {
      const instance = Array.isArray(result) ? result[0] : result;
      const data = instance?.get ? plain(instance) : undefined;
      push({
        table: tableOf(options?.model || instance?.constructor),
        op: 'upsert',
        id: instance?.get ? idOf(instance) : null,
        label: pickLabel(data),
        data,
      });
    });
  }

  // ─── Yozish ──────────────────────────────────────────────────────────
  platformOf(client: ClientInfo = {}): string {
    const ua = client.userAgent || '';
    const origin = client.origin || '';
    if (/^capacitor:\/\//.test(origin) || /\bwv\b|Capacitor/i.test(ua)) return 'mobile';
    return 'web';
  }

  // Jurnalga yozish hech qachon asosiy amalni buzmasligi kerak — xato faqat log'ga
  async record(input: RecordInput) {
    try {
      const client = input.client || {};
      await this.logs.create(
        {
          user_id: input.user_id ?? null,
          action: input.action,
          module: input.module ?? null,
          entity_type: input.entity_type ?? null,
          entity_id: input.entity_id != null ? String(input.entity_id).slice(0, 64) : null,
          entity_label: input.entity_label?.slice(0, 255) ?? null,
          ok: input.ok ?? true,
          status: input.status ?? null,
          error: input.error ?? null,
          payload: input.payload ?? null,
          ip: client.ip?.slice(0, 64) || null,
          user_agent: client.userAgent?.slice(0, 255) || null,
          platform: this.platformOf(client),
        },
        { hooks: false },
      );
    } catch (e) {
      this.logger.warn(`jurnalga yozilmadi: ${(e as Error).message}`);
    }
  }

  // Oxirgi faollik vaqti — har so'rovda emas, daqiqasiga ko'pi bilan bir marta
  touch(userId: number) {
    const now = Date.now();
    if (now - (this.lastTouch.get(userId) || 0) < TOUCH_EVERY_MS) return;
    this.lastTouch.set(userId, now);
    this.users
      .update({ last_seen_at: new Date(now) } as any, { where: { id: userId }, hooks: false })
      .catch(() => this.lastTouch.delete(userId));
  }

  async recordRequest(
    req: any,
    res: any,
    ctx: ActivityContext,
    userId: number | null,
    durationMs: number,
  ) {
    const method = String(req.method || '').toUpperCase();
    const path = String(req.originalUrl || req.url || '')
      .split('?')[0]
      .replace(/^\/?api\//, '')
      .replace(/\/+$/, '');
    if (!userId || SKIP_PATH.test(path)) return;
    // O'qish so'rovlari faqat bazani o'zgartirgan bo'lsa yoziladi
    if (READ_METHODS.has(method) && !ctx.changes.length) return;

    const module = path.split('/')[0] || null;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const status = Number(res.statusCode) || null;
    const ok = !!status && status < 400;

    // Eski admin audit chaqiruvi (ko'rish, eksport) — o'z ma'nosi bilan yoziladi
    if (path === 'audit-logs/create') {
      return this.recordRaw({
        userId,
        req,
        status,
        ok,
        durationMs,
        action: String(body.action || 'action').slice(0, 32),
        module: 'admin',
        entity_type: body.target_id ? 'users' : null,
        entity_id: body.target_id ?? null,
        entity_label: body.message ? String(body.message) : null,
        error: ctx.error,
        payload: clean(body),
        changes: null,
      });
    }

    const main = ctx.changes.find((c) => !c.op.startsWith('bulk')) || ctx.changes[0];
    const pathId = path.split('/').reverse().find((s) => /^\d+$/.test(s));
    const payload: Record<string, unknown> = {};
    if (Object.keys(body).length) payload.body = clean(body);
    if (req.query && Object.keys(req.query).length) payload.query = clean(req.query);
    const files = [req.file, ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat())]
      .filter(Boolean)
      .map((f: any) => ({ name: f.originalname, size: f.size, type: f.mimetype }));
    if (files.length) payload.files = files;

    const changes: unknown[] = [...ctx.changes];
    if (ctx.dropped) changes.push({ more: ctx.dropped });

    return this.recordRaw({
      userId,
      req,
      status,
      ok,
      durationMs,
      action: this.actionOf(method, path, ctx.changes),
      module,
      entity_type: main?.table ?? module,
      entity_id: main?.id ?? ctx.resultId ?? pathId ?? null,
      entity_label: main?.label ?? null,
      error: ok ? null : ctx.error,
      payload: Object.keys(payload).length ? payload : null,
      changes: changes.length ? changes : null,
    });
  }

  private actionOf(method: string, path: string, changes: ActivityChange[]): string {
    const p = path.toLowerCase();
    if (/import/.test(p)) return 'import';
    if (/export|excel/.test(p)) return 'export';
    if (/password/.test(p)) return 'password';
    if (method === 'DELETE' || /(^|\/)(delete|remove)/.test(p)) return 'delete';
    if (method === 'PATCH' || method === 'PUT' || /(^|\/)(update|edit)/.test(p)) return 'update';
    if (/(^|\/)(create|register)/.test(p)) return 'create';
    const first = changes.find((c) => !c.op.startsWith('bulk')) || changes[0];
    if (first) {
      if (first.op === 'create' || first.op === 'bulk_create') return 'create';
      if (first.op === 'delete' || first.op === 'bulk_delete') return 'delete';
      return 'update';
    }
    return method === 'POST' ? 'create' : 'action';
  }

  private async recordRaw(r: {
    userId: number;
    req: any;
    status: number | null;
    ok: boolean;
    durationMs: number;
    action: string;
    module: string | null;
    entity_type: string | null;
    entity_id: string | number | null;
    entity_label: string | null;
    error?: string | null;
    payload: unknown;
    changes: unknown;
  }) {
    const client = clientOf(r.req);
    try {
      await this.logs.create(
        {
          user_id: r.userId,
          action: r.action,
          module: r.module,
          method: String(r.req.method || '').slice(0, 8),
          path: String(r.req.originalUrl || '').split('?')[0].slice(0, 255),
          status: r.status,
          ok: r.ok,
          entity_type: r.entity_type?.slice(0, 64) ?? null,
          entity_id: r.entity_id != null ? String(r.entity_id).slice(0, 64) : null,
          entity_label: r.entity_label?.slice(0, 255) ?? null,
          error: r.error ? String(r.error).slice(0, 1000) : null,
          payload: r.payload,
          changes: r.changes,
          ip: client.ip?.slice(0, 64) || null,
          user_agent: client.userAgent?.slice(0, 255) || null,
          platform: this.platformOf(client),
          duration_ms: Math.round(r.durationMs),
        },
        { hooks: false },
      );
    } catch (e) {
      this.logger.warn(`jurnalga yozilmadi (${r.req?.method} ${r.req?.originalUrl}): ${(e as Error).message}`);
    }
  }

  // ─── O'qish (admin) ──────────────────────────────────────────────────
  async list(q: QueryActivityDto) {
    const where: any = {};
    if (q.user_id) where.user_id = Number(q.user_id);
    if (q.module) where.module = q.module;
    if (q.action) where.action = { [Op.in]: String(q.action).split(',').filter(Boolean) };
    if (q.ok === 'false') where.ok = false;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt[Op.gte] = new Date(q.from);
      if (q.to) where.createdAt[Op.lt] = new Date(new Date(q.to).getTime() + 86_400_000);
    }
    if (q.search?.trim()) {
      const like = `%${q.search.trim()}%`;
      where[Op.or] = [
        { entity_label: { [Op.iLike]: like } },
        { path: { [Op.iLike]: like } },
        { error: { [Op.iLike]: like } },
        { ip: { [Op.iLike]: like } },
        Sequelize.where(Sequelize.cast(Sequelize.col('ActivityLog.changes'), 'text'), { [Op.iLike]: like }),
        Sequelize.where(Sequelize.cast(Sequelize.col('ActivityLog.payload'), 'text'), { [Op.iLike]: like }),
      ];
    }
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const { count, rows } = await this.logs.findAndCountAll({
      where: where as WhereOptions,
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstname', 'lastname', 'username'], required: false },
      ],
      order: [['id', 'DESC']],
      limit,
      offset,
    });
    return { total: count, data: rows };
  }

  async userSummary(userId: number) {
    const user = await this.users.findByPk(userId, { attributes: ['id', 'last_seen_at'] });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    const [lastLogin, total, todayCount, byAction] = await Promise.all([
      this.logs.findOne({
        where: { user_id: userId, action: 'login' },
        order: [['id', 'DESC']],
        attributes: ['createdAt', 'ip', 'platform', 'user_agent'],
      }),
      this.logs.count({ where: { user_id: userId } }),
      this.logs.count({ where: { user_id: userId, createdAt: { [Op.gte]: today } } }),
      this.logs.findAll({
        where: { user_id: userId, createdAt: { [Op.gte]: monthAgo } },
        attributes: ['action', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['action'],
        raw: true,
      }),
    ]);
    return {
      last_seen_at: (user as any)?.last_seen_at ?? null,
      last_login: lastLogin,
      total,
      today: todayCount,
      last_30_days: Object.fromEntries(
        (byAction as any[]).map((r) => [r.action, Number(r.count)]),
      ),
    };
  }
}

export const clientOf = (req: any): ClientInfo => ({
  userAgent: String(req?.headers?.['user-agent'] || ''),
  ip: String(req?.ip || ''),
  origin: String(req?.headers?.origin || ''),
});
