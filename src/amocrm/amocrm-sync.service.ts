import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  AMO_PAGE_LIMIT,
  AmoAuthError,
  AmoBlockedError,
  AmocrmClient,
  AmoParams,
} from './amocrm.client';
import {
  AMO_FULL_RECONCILE_MS,
  AMO_HISTORY_DAYS,
  AMO_NOTE_ENTITIES,
  AMO_SYNC_INTERVAL_MS,
} from './amocrm.constants';
import { AmoCall } from './models/amo-call.model';
import { AmoLead } from './models/amo-lead.model';
import { AmoPipeline } from './models/amo-pipeline.model';
import { AmoStatus } from './models/amo-status.model';
import { AmoSyncState } from './models/amo-sync-state.model';
import { AmoUser } from './models/amo-user.model';

// Bitta "oyna"da nechta sahifa o'qiymiz. Undan keyin filtrni oxirgi
// updated_at'ga surib, 1-sahifadan qayta boshlaymiz — juda chuqur sahifalashdan qochish uchun.
const MAX_PAGES_PER_WINDOW = 40;
// Inkremental sinxronizatsiyada chegaradagi yozuvlarni yo'qotmaslik uchun ustma-ustlik
const CURSOR_OVERLAP_SEC = 60;
const BOOT_DELAY_MS = 30_000;

interface StepResult {
  items: number;
  cursor?: number;
}

const toDate = (unix?: number | null) => (unix ? new Date(unix * 1000) : null);
const nowUnix = () => Math.floor(Date.now() / 1000);
const historyCutoff = () => nowUnix() - AMO_HISTORY_DAYS * 24 * 60 * 60;

// amoCRM → bizning baza. Faqat o'qish: amoCRM'ga hech narsa yozilmaydi.
// Har 10 daqiqada o'zgarganlar tortiladi, kuniga bir marta sdelkalar to'liq
// o'tiladi (amoCRM'da o'chirilganlarini aniqlash uchun).
@Injectable()
export class AmocrmSyncService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('AmocrmSync');
  private running = false;
  private bootTimer?: NodeJS.Timeout;
  private intervalTimer?: NodeJS.Timeout;

  constructor(
    private readonly client: AmocrmClient,
    @InjectModel(AmoUser) private readonly userRepo: typeof AmoUser,
    @InjectModel(AmoPipeline) private readonly pipelineRepo: typeof AmoPipeline,
    @InjectModel(AmoStatus) private readonly statusRepo: typeof AmoStatus,
    @InjectModel(AmoLead) private readonly leadRepo: typeof AmoLead,
    @InjectModel(AmoCall) private readonly callRepo: typeof AmoCall,
    @InjectModel(AmoSyncState) private readonly stateRepo: typeof AmoSyncState,
  ) {}

  get isRunning() {
    return this.running;
  }

  onApplicationBootstrap() {
    if (process.env.AMO_SYNC_ENABLED === 'false') {
      this.logger.log(
        "AMO_SYNC_ENABLED=false — avtomatik sinxronizatsiya o'chirilgan",
      );
      return;
    }
    if (!this.client.isConfigured) {
      this.logger.warn(
        "AMO_BASE_URL yoki AMO_TOKEN yo'q — amoCRM sinxronizatsiyasi o'chirilgan",
      );
      return;
    }
    this.bootTimer = setTimeout(() => this.runScheduled(), BOOT_DELAY_MS);
    this.intervalTimer = setInterval(
      () => this.runScheduled(),
      AMO_SYNC_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    clearTimeout(this.bootTimer);
    clearInterval(this.intervalTimer);
  }

  private async runScheduled() {
    try {
      await this.syncAll();
    } catch (err) {
      this.logger.error(`Sinxronizatsiya to'xtadi: ${(err as Error).message}`);
    }
  }

  // Qo'lda chaqirish uchun: darhol qaytadi, ish fonda davom etadi
  trigger(forceFull = false): { started: boolean; reason?: string } {
    if (!this.client.isConfigured) {
      return { started: false, reason: 'not_configured' };
    }
    if (this.running) {
      return { started: false, reason: 'already_running' };
    }
    this.syncAll({ forceFull }).catch((err) =>
      this.logger.error(`Sinxronizatsiya to'xtadi: ${err.message}`),
    );
    return { started: true };
  }

  async syncAll({ forceFull = false } = {}) {
    if (this.running || !this.client.isConfigured) return;
    this.running = true;
    const started = Date.now();
    try {
      await this.step('users', () => this.syncUsers());
      await this.step('pipelines', () => this.syncPipelines());
      if (forceFull || (await this.isFullReconcileDue())) {
        await this.step('leads_full', () => this.fullLeadsPass());
      } else {
        await this.step('leads', () => this.incrementalLeads());
      }
      for (const entity of AMO_NOTE_ENTITIES) {
        await this.step(`calls_${entity}`, () => this.syncCalls(entity));
      }
      this.logger.log(
        `Sinxronizatsiya tugadi (${Math.round((Date.now() - started) / 1000)}s)`,
      );
    } finally {
      this.running = false;
    }
  }

  // ─── Qadamlar ───────────────────────────────────────────

  private async step(entity: string, fn: () => Promise<StepResult>) {
    const runAt = new Date();
    try {
      const { items, cursor } = await fn();
      await this.saveState(entity, {
        last_run_at: runAt,
        last_status: 'ok',
        last_error: null,
        items_synced: items,
        ...(cursor !== undefined && { cursor_ts: cursor }),
      });
    } catch (err) {
      const message = (err as Error).message || String(err);
      this.logger.error(`${entity}: ${message}`);
      await this.saveState(entity, {
        last_run_at: runAt,
        last_status: 'error',
        last_error: message.slice(0, 2000),
      });
      // Token yoki blok muammosida qolgan qadamlarni ham to'xtatamiz
      if (err instanceof AmoAuthError || err instanceof AmoBlockedError)
        throw err;
    }
  }

  private async syncUsers(): Promise<StepResult> {
    let items = 0;
    for (let page = 1; ; page++) {
      const data = await this.client.get('users', {
        limit: AMO_PAGE_LIMIT,
        page,
      });
      const users = data?._embedded?.users ?? [];
      if (users.length) {
        await this.userRepo.bulkCreate(
          users.map((u: any) => ({
            id: u.id,
            name: u.name || `#${u.id}`,
            email: u.email ?? null,
            is_active: u.rights?.is_active !== false,
          })),
          { updateOnDuplicate: ['name', 'email', 'is_active', 'updatedAt'] },
        );
        items += users.length;
      }
      if (users.length < AMO_PAGE_LIMIT) break;
    }
    return { items };
  }

  private async syncPipelines(): Promise<StepResult> {
    const data = await this.client.get('leads/pipelines');
    const pipelines = data?._embedded?.pipelines ?? [];
    if (!pipelines.length) return { items: 0 };

    await this.pipelineRepo.bulkCreate(
      pipelines.map((p: any) => ({
        id: p.id,
        name: p.name,
        sort: p.sort,
        is_main: Boolean(p.is_main),
        is_archive: Boolean(p.is_archive),
      })),
      {
        updateOnDuplicate: [
          'name',
          'sort',
          'is_main',
          'is_archive',
          'updatedAt',
        ],
      },
    );

    const statuses = pipelines.flatMap((p: any) =>
      (p._embedded?.statuses ?? []).map((s: any) => ({
        id: s.id,
        pipeline_id: p.id,
        name: s.name,
        color: s.color ?? null,
        sort: s.sort,
        type: s.type ?? 0,
      })),
    );
    if (statuses.length) {
      await this.statusRepo.bulkCreate(statuses, {
        updateOnDuplicate: ['name', 'color', 'sort', 'type', 'updatedAt'],
      });
    }
    return { items: pipelines.length };
  }

  private async incrementalLeads(): Promise<StepResult> {
    const cursor = await this.getCursor('leads');
    const from = cursor ? cursor - CURSOR_OVERLAP_SEC : historyCutoff();
    const { items, maxUpdated } = await this.walk(
      'leads',
      'leads',
      {},
      from,
      (rows) => this.saveLeads(rows, new Date()),
    );
    return { items, cursor: Math.max(maxUpdated, cursor ?? 0) };
  }

  // Oxirgi 1 yildagi barcha sdelkalarni qayta o'tadi. Bu o'tishda ko'rinmagan
  // (synced_at eski qolgan) sdelkalar amoCRM'da o'chirilgan deb belgilanadi.
  private async fullLeadsPass(): Promise<StepResult> {
    const passStart = new Date();
    const cutoff = historyCutoff();
    const { items, maxUpdated } = await this.walk(
      'leads',
      'leads',
      {},
      cutoff,
      (rows) => this.saveLeads(rows, new Date()),
    );

    const [deleted] = await this.leadRepo.update(
      { is_deleted: true },
      {
        where: {
          is_deleted: false,
          synced_at: { [Op.lt]: passStart },
          amo_updated_at: { [Op.gte]: toDate(cutoff) as Date },
        },
      },
    );
    if (deleted)
      this.logger.log(
        `${deleted} ta sdelka amoCRM'da o'chirilgan deb belgilandi`,
      );

    // Inkremental sinxronizatsiya shu nuqtadan davom etadi
    const cursor = await this.getCursor('leads');
    await this.saveState('leads', {
      cursor_ts: Math.max(maxUpdated, cursor ?? 0),
    });
    return { items };
  }

  private async saveLeads(leads: any[], syncedAt: Date) {
    await this.leadRepo.bulkCreate(
      leads.map((l) => ({
        id: l.id,
        name: l.name ? String(l.name).slice(0, 512) : null,
        price: l.price ?? 0,
        pipeline_id: l.pipeline_id,
        status_id: l.status_id,
        responsible_user_id: l.responsible_user_id ?? null,
        amo_created_at: toDate(l.created_at) as Date,
        amo_updated_at: toDate(l.updated_at) as Date,
        amo_closed_at: toDate(l.closed_at),
        is_deleted: false,
        synced_at: syncedAt,
      })),
      {
        updateOnDuplicate: [
          'name',
          'price',
          'pipeline_id',
          'status_id',
          'responsible_user_id',
          'amo_created_at',
          'amo_updated_at',
          'amo_closed_at',
          'is_deleted',
          'synced_at',
          'updatedAt',
        ],
      },
    );
  }

  // Qo'ng'iroqlar — call_in / call_out izohlari
  private async syncCalls(entity: string): Promise<StepResult> {
    const stateKey = `calls_${entity}`;
    const cursor = await this.getCursor(stateKey);
    const from = cursor ? cursor - CURSOR_OVERLAP_SEC : historyCutoff();
    const params: AmoParams = {
      'filter[note_type][0]': 'call_in',
      'filter[note_type][1]': 'call_out',
    };
    const { items, maxUpdated } = await this.walk(
      `${entity}/notes`,
      'notes',
      params,
      from,
      (notes) => this.saveCalls(entity, notes),
    );
    return { items, cursor: Math.max(maxUpdated, cursor ?? 0) };
  }

  private async saveCalls(entity: string, notes: any[]) {
    const rows = notes
      .filter((n) => n.note_type === 'call_in' || n.note_type === 'call_out')
      .map((n) => {
        const p = n.params ?? {};
        const status = Number(p.call_status);
        return {
          id: n.id,
          entity_type: entity,
          entity_id: n.entity_id,
          direction: n.note_type === 'call_in' ? 'in' : 'out',
          uniq: p.uniq ? String(p.uniq).slice(0, 255) : null,
          call_status: Number.isInteger(status) && status > 0 ? status : null,
          call_result: p.call_result
            ? String(p.call_result).slice(0, 512)
            : null,
          duration: Number(p.duration) || 0,
          phone: p.phone ? String(p.phone).slice(0, 64) : null,
          responsible_user_id: n.responsible_user_id || n.created_by || null,
          amo_created_at: toDate(n.created_at) as Date,
          amo_updated_at: toDate(n.updated_at) as Date,
        };
      });
    if (!rows.length) return;
    await this.callRepo.bulkCreate(rows, {
      updateOnDuplicate: [
        'entity_id',
        'direction',
        'uniq',
        'call_status',
        'call_result',
        'duration',
        'phone',
        'responsible_user_id',
        'amo_created_at',
        'amo_updated_at',
        'updatedAt',
      ],
    });
  }

  // ─── Yordamchilar ───────────────────────────────────────

  // updated_at bo'yicha o'sish tartibida sahifalab o'qiydi. Har MAX_PAGES_PER_WINDOW
  // sahifadan keyin filtrni oxirgi ko'rilgan updated_at'ga surib qayta boshlaydi.
  private async walk(
    path: string,
    embeddedKey: string,
    baseParams: AmoParams,
    from: number,
    onPage: (items: any[]) => Promise<void>,
  ): Promise<{ items: number; maxUpdated: number }> {
    let windowFrom = from;
    let maxUpdated = from;
    let total = 0;

    for (;;) {
      let reachedEnd = false;
      for (let page = 1; page <= MAX_PAGES_PER_WINDOW; page++) {
        const data = await this.client.get(path, {
          ...baseParams,
          'filter[updated_at][from]': windowFrom,
          'order[updated_at]': 'asc',
          limit: AMO_PAGE_LIMIT,
          page,
        });
        const items: any[] = data?._embedded?.[embeddedKey] ?? [];
        if (items.length) {
          await onPage(items);
          total += items.length;
          for (const it of items) {
            if (it.updated_at > maxUpdated) maxUpdated = it.updated_at;
          }
        }
        if (items.length < AMO_PAGE_LIMIT) {
          reachedEnd = true;
          break;
        }
      }
      if (reachedEnd) return { items: total, maxUpdated };
      if (maxUpdated <= windowFrom) {
        // 10 000 dan ortiq yozuv bir soniyada o'zgargan — amalda bo'lmaydi
        throw new Error(
          `${path}: sahifalashda oldinga siljib bo'lmadi (updated_at=${windowFrom})`,
        );
      }
      windowFrom = maxUpdated;
    }
  }

  private async isFullReconcileDue(): Promise<boolean> {
    const state = await this.stateRepo.findByPk('leads_full');
    if (!state?.last_run_at || state.last_status !== 'ok') return true;
    return (
      Date.now() - new Date(state.last_run_at).getTime() > AMO_FULL_RECONCILE_MS
    );
  }

  private async getCursor(entity: string): Promise<number | null> {
    const state = await this.stateRepo.findByPk(entity);
    // BIGINT Postgres'dan satr bo'lib keladi
    return state?.cursor_ts ? Number(state.cursor_ts) : null;
  }

  private async saveState(entity: string, values: Partial<AmoSyncState>) {
    const existing = await this.stateRepo.findByPk(entity);
    if (existing) {
      await existing.update(values);
    } else {
      await this.stateRepo.create({ entity, ...values } as any);
    }
  }
}
