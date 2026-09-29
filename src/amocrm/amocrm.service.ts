import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AmocrmClient } from './amocrm.client';
import { AmocrmSyncService } from './amocrm-sync.service';
import {
  AMO_CALL_STATUSES,
  AMO_STATUS_LOST,
  AMO_STATUS_WON,
} from './amocrm.constants';
import { StatsQueryDto } from './dto/stats-query.dto';
import { AmoPipeline } from './models/amo-pipeline.model';
import { AmoStatus } from './models/amo-status.model';
import { AmoSyncState } from './models/amo-sync-state.model';
import { AmoUser } from './models/amo-user.model';

// Kompaniya vaqt zonasi — "bugun", "shu oy" chegaralari shu bo'yicha
const TZ = 'Asia/Tashkent';
const TZ_OFFSET = '+05:00';

const pad = (n: number) => String(n).padStart(2, '0');

function todayInTashkent(): string {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

@Injectable()
export class AmocrmService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly client: AmocrmClient,
    private readonly sync: AmocrmSyncService,
    @InjectModel(AmoUser) private readonly userRepo: typeof AmoUser,
    @InjectModel(AmoPipeline) private readonly pipelineRepo: typeof AmoPipeline,
    @InjectModel(AmoStatus) private readonly statusRepo: typeof AmoStatus,
    @InjectModel(AmoSyncState) private readonly stateRepo: typeof AmoSyncState,
  ) {}

  async getStats(query: StatsQueryDto) {
    const today = todayInTashkent();
    const fromDay = query.from || `${today.slice(0, 8)}01`;
    const toDay = query.to || today;
    const from = new Date(`${fromDay}T00:00:00${TZ_OFFSET}`);
    // "to" kuni ham kiradi
    const to = new Date(
      new Date(`${toDay}T00:00:00${TZ_OFFSET}`).getTime() + 24 * 60 * 60 * 1000,
    );
    const userId = query.responsible_user_id
      ? Number(query.responsible_user_id)
      : null;
    const pipelineId = query.pipeline_id ? Number(query.pipeline_id) : null;

    const [calls, leads, users, sync] = await Promise.all([
      this.callStats(from, to, userId),
      this.leadStats(from, to, userId, pipelineId),
      this.userRepo.findAll({
        attributes: ['id', 'name', 'is_active'],
        order: [['name', 'ASC']],
      }),
      this.getSyncStatus(),
    ]);

    return { period: { from: fromDay, to: toDay }, calls, leads, users, sync };
  }

  // ─── Qo'ng'iroqlar ──────────────────────────────────────

  private async callStats(from: Date, to: Date, userId: number | null) {
    const replacements: Record<string, unknown> = { from, to, tz: TZ };
    const userFilter = userId ? 'AND responsible_user_id = :userId' : '';
    if (userId) replacements.userId = userId;

    // Bitta qo'ng'iroq bir nechta obyektga (kontakt + sdelka) yozilgan bo'lishi
    // mumkin — uniq bo'yicha bittasini qoldiramiz.
    const dedup = `
      WITH c AS (
        SELECT DISTINCT ON (COALESCE(uniq, entity_type || ':' || id))
          call_status, direction, duration, responsible_user_id, amo_created_at
        FROM amo_calls
        WHERE amo_created_at >= :from AND amo_created_at < :to ${userFilter}
        ORDER BY COALESCE(uniq, entity_type || ':' || id), amo_created_at
      )`;

    const [grouped, daily] = await Promise.all([
      this.sequelize.query<{
        responsible_user_id: number | null;
        call_status: number | null;
        direction: string;
        count: number;
        duration: number;
      }>(
        `${dedup}
        SELECT responsible_user_id, call_status, direction,
               COUNT(*)::int AS count, COALESCE(SUM(duration), 0)::int AS duration
        FROM c GROUP BY responsible_user_id, call_status, direction`,
        { replacements, type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{ day: string; total: number; answered: number }>(
        `${dedup}
        SELECT to_char(amo_created_at AT TIME ZONE :tz, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE call_status = 4)::int AS answered
        FROM c GROUP BY day ORDER BY day`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

    const byStatus = new Map<number, number>();
    const byUser = new Map<
      number,
      {
        total: number;
        answered: number;
        incoming: number;
        outgoing: number;
        duration: number;
        by_status: Record<number, number>;
      }
    >();
    let total = 0;
    let incoming = 0;
    let outgoing = 0;
    let duration = 0;
    let unknown = 0;

    for (const row of grouped) {
      total += row.count;
      duration += row.duration;
      if (row.direction === 'in') incoming += row.count;
      else outgoing += row.count;
      if (row.call_status) {
        byStatus.set(
          row.call_status,
          (byStatus.get(row.call_status) || 0) + row.count,
        );
      } else {
        unknown += row.count;
      }

      const uid = row.responsible_user_id || 0;
      const u = byUser.get(uid) || {
        total: 0,
        answered: 0,
        incoming: 0,
        outgoing: 0,
        duration: 0,
        by_status: {},
      };
      u.total += row.count;
      u.duration += row.duration;
      if (row.direction === 'in') u.incoming += row.count;
      else u.outgoing += row.count;
      if (row.call_status === 4) u.answered += row.count;
      const key = row.call_status || 0;
      u.by_status[key] = (u.by_status[key] || 0) + row.count;
      byUser.set(uid, u);
    }

    const by_status = Object.entries(AMO_CALL_STATUSES).map(([code, key]) => ({
      status: Number(code),
      key,
      count: byStatus.get(Number(code)) || 0,
    }));
    if (unknown) by_status.push({ status: 0, key: 'unknown', count: unknown });

    return {
      total,
      incoming,
      outgoing,
      answered: byStatus.get(4) || 0,
      duration,
      by_status,
      by_user: [...byUser.entries()]
        .map(([user_id, v]) => ({ user_id: user_id || null, ...v }))
        .sort((a, b) => b.total - a.total),
      daily,
    };
  }

  // ─── Sdelkalar (voronkalar bo'yicha) ────────────────────

  private async leadStats(
    from: Date,
    to: Date,
    userId: number | null,
    pipelineId: number | null,
  ) {
    const replacements: Record<string, unknown> = { from, to };
    let extra = '';
    if (userId) {
      extra += ' AND responsible_user_id = :userId';
      replacements.userId = userId;
    }
    if (pipelineId) {
      extra += ' AND pipeline_id = :pipelineId';
      replacements.pipelineId = pipelineId;
    }

    const [rows, pipelines, statuses] = await Promise.all([
      this.sequelize.query<{
        pipeline_id: number;
        status_id: number;
        count: number;
        sum: string;
      }>(
        `SELECT pipeline_id, status_id, COUNT(*)::int AS count, COALESCE(SUM(price), 0) AS sum
         FROM amo_leads
         WHERE is_deleted = false AND amo_created_at >= :from AND amo_created_at < :to ${extra}
         GROUP BY pipeline_id, status_id`,
        { replacements, type: QueryTypes.SELECT },
      ),
      this.pipelineRepo.findAll({ order: [['sort', 'ASC']] }),
      this.statusRepo.findAll({ order: [['sort', 'ASC']] }),
    ]);

    const counts = new Map(
      rows.map((r) => [
        `${r.pipeline_id}:${r.status_id}`,
        { count: r.count, sum: Number(r.sum) },
      ]),
    );

    const result = pipelines
      .filter((p) => !pipelineId || p.id === pipelineId)
      .map((p) => {
        const st = statuses
          .filter((s) => s.pipeline_id === p.id)
          .map((s) => {
            const c = counts.get(`${p.id}:${s.id}`) || { count: 0, sum: 0 };
            return {
              id: s.id,
              name: s.name,
              color: s.color,
              sort: s.sort,
              ...c,
            };
          });
        const total = st.reduce((a, s) => a + s.count, 0);
        const sum = st.reduce((a, s) => a + s.sum, 0);
        return {
          id: p.id,
          name: p.name,
          is_main: p.is_main,
          is_archive: p.is_archive,
          total,
          sum,
          statuses: st,
        };
      })
      // Arxivlangan va bo'sh voronkalarni ko'rsatmaymiz
      .filter((p) => !p.is_archive || p.total > 0);

    const sumOf = (statusId: number) =>
      rows
        .filter((r) => r.status_id === statusId)
        .reduce(
          (a, r) => ({ count: a.count + r.count, sum: a.sum + Number(r.sum) }),
          { count: 0, sum: 0 },
        );

    return {
      total: rows.reduce((a, r) => a + r.count, 0),
      sum: rows.reduce((a, r) => a + Number(r.sum), 0),
      won: sumOf(AMO_STATUS_WON),
      lost: sumOf(AMO_STATUS_LOST),
      pipelines: result,
    };
  }

  // ─── Sinxronizatsiya holati ─────────────────────────────

  async getSyncStatus() {
    const states = await this.stateRepo.findAll({ order: [['entity', 'ASC']] });
    const lastOk = states
      .filter((s) => s.last_status === 'ok' && s.last_run_at)
      .map((s) => new Date(s.last_run_at as Date).getTime());
    return {
      configured: this.client.isConfigured,
      running: this.sync.isRunning,
      last_sync_at: lastOk.length ? new Date(Math.max(...lastOk)) : null,
      has_error: states.some((s) => s.last_status === 'error'),
      states: states.map((s) => ({
        entity: s.entity,
        last_run_at: s.last_run_at,
        last_status: s.last_status,
        last_error: s.last_error,
        items_synced: s.items_synced,
      })),
    };
  }

  runSync(full = false) {
    return this.sync.trigger(full);
  }
}
