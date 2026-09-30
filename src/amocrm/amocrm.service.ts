import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AmocrmClient } from './amocrm.client';
import { AmocrmSyncService } from './amocrm-sync.service';
import {
  AMO_INTERNAL_MAX_DIGITS,
  AMO_NOT_CLIENT_TAG_RE,
  AMO_NOT_OURS_RE,
  AMO_STATUS_LOST,
  AMO_STATUS_WON,
  AMO_SUSPICIOUS_DAYS,
  AMO_SUSPICIOUS_MIN_CALLS,
} from './amocrm.constants';
import {
  CallKind,
  CallScope,
  CallsListQueryDto,
  ExcludePhoneDto,
  LeadsListQueryDto,
  StatsQueryDto,
  SuspiciousQueryDto,
} from './dto/stats-query.dto';
import { AmoExcludedPhone } from './models/amo-excluded-phone.model';
import { AmoLossReason } from './models/amo-loss-reason.model';
import { AmoPipeline } from './models/amo-pipeline.model';
import { AmoStatus } from './models/amo-status.model';
import { AmoSyncState } from './models/amo-sync-state.model';
import { AmoUser } from './models/amo-user.model';

// Kompaniya vaqt zonasi — "bugun", "shu oy" chegaralari shu bo'yicha
const TZ = 'Asia/Tashkent';
const TZ_OFFSET = '+05:00';
const DAY_MS = 24 * 60 * 60 * 1000;
const TALKED = 4; // amoCRM call_status: "Разговор состоялся"

const pad = (n: number) => String(n).padStart(2, '0');

function todayInTashkent(): string {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parsePeriod(query: StatsQueryDto) {
  const today = todayInTashkent();
  const fromDay = query.from || `${today.slice(0, 8)}01`;
  const toDay = query.to || today;
  return {
    fromDay,
    toDay,
    from: new Date(`${fromDay}T00:00:00${TZ_OFFSET}`),
    // "to" kuni ham kiradi
    to: new Date(new Date(`${toDay}T00:00:00${TZ_OFFSET}`).getTime() + DAY_MS),
    userId: query.responsible_user_id
      ? Number(query.responsible_user_id)
      : null,
    pipelineId: query.pipeline_id ? Number(query.pipeline_id) : null,
    // Standart — faqat mijozlar bilan bo'lgan qo'ng'iroqlar
    scope: (query.scope || 'clients') as CallScope,
  };
}

// Raqamning oxirgi 9 raqami — amo_calls.phone_key bilan bir xil
const phoneKey = (phone: string) =>
  String(phone || '')
    .replace(/[^0-9]/g, '')
    .slice(-9);

// Qo'ng'iroq guruhlarining SQL sharti (amo_calls ustida)
const KIND_SQL: Record<CallKind, string> = {
  all: '',
  answered: `AND call_status = ${TALKED}`,
  in: `AND direction = 'in'`,
  in_answered: `AND direction = 'in' AND call_status = ${TALKED}`,
  in_missed: `AND direction = 'in' AND COALESCE(call_status, 0) <> ${TALKED}`,
  out: `AND direction = 'out'`,
  out_answered: `AND direction = 'out' AND call_status = ${TALKED}`,
  out_no_answer: `AND direction = 'out' AND COALESCE(call_status, 0) <> ${TALKED}`,
};

// Mijoz bo'lmagan raqamlar va sababi (har raqamga bitta — ustuvorlik bo'yicha):
//  manual   — admin/boss "Mijoz emas" deb belgilagan
//  staff    — ERP xodimining telefon raqami
//  amo_tag  — amoCRM'da kontaktga "Не клиент", "Сотрудник" kabi teg qo'yilgan
//  not_ours — raqamning barcha lidlari "Не наш клиент" sababi bilan yopilgan
//  internal — qisqa ichki raqam (dedupCte ichida aniqlanadi)
const EXCLUDED_CTE = `
  excl AS (
    SELECT phone_key, 'manual' AS reason, 1 AS prio FROM amo_excluded_phones
    UNION ALL
    SELECT right(regexp_replace(phone_number, '[^0-9]', '', 'g'), 9), 'staff', 2
    FROM users
    WHERE length(regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g')) >= 9
    UNION ALL
    SELECT DISTINCT x.phone_key, 'amo_tag', 3
    FROM amo_calls x
    JOIN amo_contacts ct ON x.entity_type = 'contacts' AND ct.id = x.entity_id
    WHERE x.phone_key IS NOT NULL AND ct.tags::text ~* '${AMO_NOT_CLIENT_TAG_RE}'
    UNION ALL
    SELECT x.phone_key, 'not_ours', 4
    FROM amo_calls x
    JOIN amo_lead_contacts lc ON x.entity_type = 'contacts' AND lc.contact_id = x.entity_id
    JOIN amo_leads l ON l.id = lc.lead_id AND NOT l.is_deleted
    LEFT JOIN amo_loss_reasons r ON r.id = l.loss_reason_id
    WHERE x.phone_key IS NOT NULL
    GROUP BY x.phone_key
    HAVING bool_and(
      l.status_id = ${AMO_STATUS_LOST} AND COALESCE(r.name, '') ~* '${AMO_NOT_OURS_RE}'
    )
  ),
  ex AS (
    SELECT DISTINCT ON (phone_key) phone_key, reason
    FROM excl WHERE phone_key IS NOT NULL
    ORDER BY phone_key, prio
  )`;

// Bitta qo'ng'iroq bir nechta obyektga (kontakt + sdelka) yozilgan bo'lishi
// mumkin — uniq bo'yicha bittasini qoldiramiz. Keyin scope bo'yicha:
// clients — mijoz emaslar chiqariladi, excluded — faqat ular, all — hammasi.
function dedupCte(where: string, scope: CallScope) {
  const scopeSql =
    scope === 'clients'
      ? 'WHERE excl_reason IS NULL'
      : scope === 'excluded'
        ? 'WHERE excl_reason IS NOT NULL'
        : '';
  return `
    WITH ${EXCLUDED_CTE},
    c0 AS (
      SELECT DISTINCT ON (COALESCE(a.uniq, a.entity_type || ':' || a.id))
        a.id, a.entity_type, a.entity_id, a.direction, a.call_status, a.duration,
        a.phone, a.phone_key, a.source, a.responsible_user_id, a.amo_created_at,
        CASE
          WHEN a.phone_key IS NOT NULL AND length(a.phone_key) <= ${AMO_INTERNAL_MAX_DIGITS}
            THEN 'internal'
          ELSE ex.reason
        END AS excl_reason
      FROM amo_calls a
      LEFT JOIN ex ON ex.phone_key = a.phone_key
      WHERE a.amo_created_at >= :from AND a.amo_created_at < :to ${where}
      ORDER BY COALESCE(a.uniq, a.entity_type || ':' || a.id), a.amo_created_at
    ),
    c AS (SELECT * FROM c0 ${scopeSql})`;
}

// O'tkazib yuborilgan qo'ng'iroqdan KEYIN shu raqam bilan aloqa bo'lganmi:
// biz qo'ng'iroq qildik (chiquvchi) yoki mijoz qayta qo'ng'iroq qilib gaplashdi.
function callbackLateral(keyExpr: string, atExpr: string) {
  return `
    LEFT JOIN LATERAL (
      SELECT x.amo_created_at AS callback_at, x.direction AS callback_direction,
             x.call_status AS callback_status
      FROM amo_calls x
      WHERE x.phone_key = ${keyExpr} AND x.amo_created_at > ${atExpr}
        AND (x.direction = 'out' OR x.call_status = ${TALKED})
      ORDER BY x.amo_created_at
      LIMIT 1
    ) cb ON true`;
}

// Raqamning amoCRM'da biror lidi bormi (kontakt orqali)
const HAS_LEAD_SQL = (keyExpr: string) => `
  EXISTS (
    SELECT 1 FROM amo_calls y
    JOIN amo_lead_contacts lc ON y.entity_type = 'contacts' AND lc.contact_id = y.entity_id
    WHERE y.phone_key = ${keyExpr}
  )`;

export interface UserCallStats {
  user_id: number | null;
  total: number;
  talked: number;
  duration: number;
  in_total: number;
  in_answered: number;
  in_missed: number;
  out_total: number;
  out_answered: number;
  out_no_answer: number;
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
    @InjectModel(AmoLossReason)
    private readonly lossReasonRepo: typeof AmoLossReason,
    @InjectModel(AmoExcludedPhone)
    private readonly excludedRepo: typeof AmoExcludedPhone,
    @InjectModel(AmoSyncState) private readonly stateRepo: typeof AmoSyncState,
  ) {}

  private get amoUrl() {
    return String(process.env.AMO_BASE_URL || '').replace(/\/+$/, '');
  }

  async getStats(query: StatsQueryDto) {
    const p = parsePeriod(query);
    const [calls, leads, users, sync] = await Promise.all([
      this.callStats(p.from, p.to, p.userId, p.scope),
      this.leadStats(p.from, p.to, p.userId, p.pipelineId),
      this.userRepo.findAll({
        attributes: ['id', 'name', 'is_active'],
        order: [['name', 'ASC']],
      }),
      this.getSyncStatus(),
    ]);

    return {
      period: { from: p.fromDay, to: p.toDay },
      scope: p.scope,
      amo_url: this.amoUrl,
      calls,
      leads,
      users,
      sync,
    };
  }

  // ─── Qo'ng'iroqlar ──────────────────────────────────────

  private async callStats(
    from: Date,
    to: Date,
    userId: number | null,
    scope: CallScope,
  ) {
    const replacements: Record<string, unknown> = { from, to, tz: TZ };
    const userSql = userId ? 'AND responsible_user_id = :userId' : '';
    if (userId) replacements.userId = userId;
    const opts = { replacements, type: QueryTypes.SELECT as const };

    const [grouped, daily, missed, excluded, bySource] = await Promise.all([
      this.sequelize.query<{
        responsible_user_id: number | null;
        call_status: number | null;
        direction: string;
        count: number;
        duration: number;
      }>(
        `${dedupCte(userSql, scope)}
        SELECT responsible_user_id, call_status, direction,
               COUNT(*)::int AS count, COALESCE(SUM(duration), 0)::int AS duration
        FROM c GROUP BY responsible_user_id, call_status, direction`,
        opts,
      ),
      this.sequelize.query<{
        day: string;
        total: number;
        talked: number;
        in_missed: number;
      }>(
        `${dedupCte(userSql, scope)}
        SELECT to_char(amo_created_at AT TIME ZONE :tz, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE call_status = ${TALKED})::int AS talked,
               COUNT(*) FILTER (
                 WHERE direction = 'in' AND COALESCE(call_status, 0) <> ${TALKED}
               )::int AS in_missed
        FROM c GROUP BY day ORDER BY day`,
        opts,
      ),
      // O'tkazib yuborilgan kiruvchilar: nechta turli raqam va ulardan
      // nechtasiga keyin umuman aloqa bo'lmagan
      this.sequelize.query<{ numbers: number; not_called_back: number }>(
        `${dedupCte(`${userSql} ${KIND_SQL.in_missed}`, scope)},
        g AS (
          SELECT phone_key, MAX(amo_created_at) AS last_at
          FROM c WHERE phone_key IS NOT NULL GROUP BY phone_key
        )
        SELECT COUNT(*)::int AS numbers,
               COUNT(*) FILTER (WHERE cb.callback_at IS NULL)::int AS not_called_back
        FROM g ${callbackLateral('g.phone_key', 'g.last_at')}`,
        opts,
      ),
      // Mijoz emas deb chiqarib tashlanganlar — sabab bo'yicha
      this.sequelize.query<{ reason: string; calls: number; numbers: number }>(
        `${dedupCte(userSql, 'excluded')}
        SELECT excl_reason AS reason, COUNT(*)::int AS calls,
               COUNT(DISTINCT phone_key)::int AS numbers
        FROM c GROUP BY excl_reason ORDER BY calls DESC`,
        opts,
      ),
      // Telefoniya platformalari (Moi Zvonki, Sipuni) bo'yicha
      this.sequelize.query<{
        source: string;
        total: number;
        clients: number;
        excluded: number;
        talked: number;
        in_missed: number;
      }>(
        `${dedupCte(userSql, 'all')}
        SELECT COALESCE(source, '') AS source,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE excl_reason IS NULL)::int AS clients,
               COUNT(*) FILTER (WHERE excl_reason IS NOT NULL)::int AS excluded,
               COUNT(*) FILTER (
                 WHERE excl_reason IS NULL AND call_status = ${TALKED}
               )::int AS talked,
               COUNT(*) FILTER (
                 WHERE excl_reason IS NULL AND direction = 'in'
                   AND COALESCE(call_status, 0) <> ${TALKED}
               )::int AS in_missed
        FROM c GROUP BY 1 ORDER BY total DESC`,
        opts,
      ),
    ]);

    const inStatus = new Map<number, number>();
    const outStatus = new Map<number, number>();
    const byUser = new Map<number, UserCallStats>();
    let total = 0;
    let talked = 0;
    let duration = 0;

    for (const row of grouped) {
      const isIn = row.direction === 'in';
      const isTalk = row.call_status === TALKED;
      const statusKey = row.call_status || 0;
      const target = isIn ? inStatus : outStatus;
      target.set(statusKey, (target.get(statusKey) || 0) + row.count);
      total += row.count;
      duration += row.duration;
      if (isTalk) talked += row.count;

      const uid = row.responsible_user_id || 0;
      const u =
        byUser.get(uid) ||
        ({
          user_id: uid || null,
          total: 0,
          talked: 0,
          duration: 0,
          in_total: 0,
          in_answered: 0,
          in_missed: 0,
          out_total: 0,
          out_answered: 0,
          out_no_answer: 0,
        } as UserCallStats);
      u.total += row.count;
      u.duration += row.duration;
      if (isTalk) u.talked += row.count;
      if (isIn) {
        u.in_total += row.count;
        if (isTalk) u.in_answered += row.count;
        else u.in_missed += row.count;
      } else {
        u.out_total += row.count;
        if (isTalk) u.out_answered += row.count;
        else u.out_no_answer += row.count;
      }
      byUser.set(uid, u);
    }

    const sumMap = (m: Map<number, number>) =>
      [...m.values()].reduce((a, b) => a + b, 0);
    const toList = (m: Map<number, number>) =>
      [...m.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

    const inTotal = sumMap(inStatus);
    const inAnswered = inStatus.get(TALKED) || 0;
    const outTotal = sumMap(outStatus);
    const outAnswered = outStatus.get(TALKED) || 0;

    return {
      total,
      talked,
      duration,
      incoming: {
        total: inTotal,
        answered: inAnswered,
        missed: inTotal - inAnswered,
        missed_numbers: missed[0]?.numbers || 0,
        not_called_back: missed[0]?.not_called_back || 0,
        by_status: toList(inStatus),
      },
      outgoing: {
        total: outTotal,
        answered: outAnswered,
        no_answer: outTotal - outAnswered,
        by_status: toList(outStatus),
      },
      by_user: [...byUser.values()].sort((a, b) => b.total - a.total),
      daily,
      excluded: {
        calls: excluded.reduce((a, r) => a + r.calls, 0),
        numbers: excluded.reduce((a, r) => a + r.numbers, 0),
        by_reason: excluded,
      },
      by_source: bySource,
    };
  }

  // Qo'ng'iroqlar ro'yxati (raqamlar bilan) — statistikadagi har bir son
  // ustiga bosilganda shu yerdan olinadi
  async listCalls(query: CallsListQueryDto) {
    const p = parsePeriod(query);
    const kind = query.kind || 'all';
    const limit = query.limit || 50;
    const offset = ((query.page || 1) - 1) * limit;
    const replacements: Record<string, unknown> = {
      from: p.from,
      to: p.to,
      limit,
      offset,
    };

    let where = KIND_SQL[kind];
    if (p.userId) {
      where += ' AND responsible_user_id = :userId';
      replacements.userId = p.userId;
    }
    if (query.status !== undefined && query.status !== null) {
      if (Number(query.status) === 0) where += ' AND call_status IS NULL';
      else {
        where += ' AND call_status = :status';
        replacements.status = Number(query.status);
      }
    }
    if (query.source !== undefined) {
      if (query.source === '') where += ' AND source IS NULL';
      else {
        where += ' AND source = :source';
        replacements.source = query.source;
      }
    }
    if (query.reason) {
      replacements.reason = query.reason;
    }
    const reasonFilter = query.reason ? 'AND c.excl_reason = :reason' : '';

    // Qayta aloqa faqat o'tkazib yuborilgan kiruvchilar uchun mazmunli
    const withCallback = kind === 'in_missed';
    const onlyNotCalledBack = withCallback && query.not_called_back === 'true';
    const extraWhere = [
      reasonFilter,
      onlyNotCalledBack ? 'AND cb.callback_at IS NULL' : '',
    ].join(' ');
    const cbCols = withCallback
      ? 'cb.callback_at, cb.callback_direction, cb.callback_status'
      : 'NULL AS callback_at';

    if (query.group === 'phone') {
      const rows = await this.sequelize.query<any>(
        `${dedupCte(where, p.scope)},
        g AS (
          SELECT COALESCE(c.phone_key, 'id:' || c.id) AS gkey,
                 MAX(c.phone_key) AS phone_key,
                 (array_agg(c.phone ORDER BY c.amo_created_at DESC))[1] AS phone,
                 COUNT(*)::int AS calls,
                 COALESCE(SUM(c.duration), 0)::int AS duration,
                 MIN(c.amo_created_at) AS first_at,
                 MAX(c.amo_created_at) AS last_at,
                 (array_agg(c.responsible_user_id ORDER BY c.amo_created_at DESC))[1] AS responsible_user_id,
                 (array_agg(c.entity_type ORDER BY c.amo_created_at DESC))[1] AS entity_type,
                 (array_agg(c.entity_id ORDER BY c.amo_created_at DESC))[1] AS entity_id,
                 (array_agg(ct.name ORDER BY c.amo_created_at DESC)
                    FILTER (WHERE ct.name IS NOT NULL))[1] AS contact_name,
                 MAX(c.excl_reason) AS excl_reason
          FROM c
          LEFT JOIN amo_contacts ct ON c.entity_type = 'contacts' AND ct.id = c.entity_id
          GROUP BY 1
        )
        SELECT g.*, ${cbCols},
               COUNT(*) OVER()::int AS total_count,
               SUM(g.calls) OVER()::int AS total_calls
        FROM g ${withCallback ? callbackLateral('g.phone_key', 'g.last_at') : ''}
        WHERE true ${extraWhere.replace(/c\.excl_reason/g, 'g.excl_reason')}
        ORDER BY g.last_at DESC
        LIMIT :limit OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      );
      return this.pageResult(rows, 'phone');
    }

    const rows = await this.sequelize.query<any>(
      `${dedupCte(where, p.scope)}
      SELECT c.*, ct.name AS contact_name, ${cbCols},
             COUNT(*) OVER()::int AS total_count
      FROM c
      LEFT JOIN amo_contacts ct ON c.entity_type = 'contacts' AND ct.id = c.entity_id
      ${withCallback ? callbackLateral('c.phone_key', 'c.amo_created_at') : ''}
      WHERE true ${extraWhere}
      ORDER BY c.amo_created_at DESC
      LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );
    return this.pageResult(rows, 'call');
  }

  private pageResult(rows: any[], mode: 'call' | 'phone' | 'lead') {
    return {
      mode,
      total: rows[0]?.total_count || 0,
      // Raqam bo'yicha guruhlanganda — shu raqamlardagi qo'ng'iroqlar soni
      ...(mode === 'phone' && { total_calls: rows[0]?.total_calls || 0 }),
      items: rows.map(({ total_count, total_calls, ...r }) => r),
    };
  }

  // ─── "Mijoz emas" raqamlar ──────────────────────────────

  // Hamkasb/tanishga o'xshagan raqamlar: oxirgi N kunda juda ko'p qo'ng'iroq.
  // Avtomatik chiqarilmaydi — admin ko'rib, "Mijoz emas" deb belgilaydi.
  async suspicious(query: SuspiciousQueryDto) {
    const days = query.days || AMO_SUSPICIOUS_DAYS;
    const minCalls = query.min_calls || AMO_SUSPICIOUS_MIN_CALLS;
    return this.sequelize.query<any>(
      `WITH ${EXCLUDED_CTE},
      n AS (
        SELECT a.phone_key,
               (array_agg(a.phone ORDER BY a.amo_created_at DESC))[1] AS phone,
               COUNT(*)::int AS calls,
               COUNT(*) FILTER (WHERE a.call_status = ${TALKED})::int AS talked,
               COALESCE(SUM(a.duration), 0)::int AS duration,
               MAX(a.amo_created_at) AS last_at,
               mode() WITHIN GROUP (ORDER BY a.responsible_user_id) AS responsible_user_id,
               array_remove(array_agg(DISTINCT ct.name), NULL) AS contact_names,
               (array_agg(a.entity_id ORDER BY a.amo_created_at DESC)
                  FILTER (WHERE a.entity_type = 'contacts'))[1] AS contact_id
        FROM amo_calls a
        LEFT JOIN ex ON ex.phone_key = a.phone_key
        LEFT JOIN amo_contacts ct ON a.entity_type = 'contacts' AND ct.id = a.entity_id
        WHERE a.amo_created_at >= now() - (:days || ' days')::interval
          AND a.phone_key IS NOT NULL
          AND length(a.phone_key) > ${AMO_INTERNAL_MAX_DIGITS}
          AND ex.phone_key IS NULL
        GROUP BY a.phone_key
        HAVING COUNT(*) >= :minCalls
      )
      SELECT n.*, ${HAS_LEAD_SQL('n.phone_key')} AS has_lead
      FROM n
      ORDER BY has_lead ASC, n.calls DESC
      LIMIT 200`,
      {
        replacements: { days: String(days), minCalls },
        type: QueryTypes.SELECT,
      },
    );
  }

  async listExcluded() {
    return this.sequelize.query<any>(
      `SELECT e.phone_key, e.phone, e.reason, e.note, e."createdAt" AS created_at,
              TRIM(CONCAT(u.firstname, ' ', u.lastname)) AS created_by_name,
              (SELECT COUNT(*) FROM amo_calls x WHERE x.phone_key = e.phone_key)::int AS calls,
              (SELECT ct.name FROM amo_calls x
                 JOIN amo_contacts ct ON x.entity_type = 'contacts' AND ct.id = x.entity_id
               WHERE x.phone_key = e.phone_key AND ct.name IS NOT NULL
               ORDER BY x.amo_created_at DESC LIMIT 1) AS contact_name
       FROM amo_excluded_phones e
       LEFT JOIN users u ON u.id = e.created_by
       ORDER BY e."createdAt" DESC`,
      { type: QueryTypes.SELECT },
    );
  }

  async excludePhone(dto: ExcludePhoneDto, userId: number | null) {
    const digits = String(dto.phone).replace(/[^0-9]/g, '');
    if (digits.length <= AMO_INTERNAL_MAX_DIGITS) {
      throw new BadRequestException(
        'Raqam juda qisqa. Qisqa ichki raqamlar avtomatik chiqariladi.',
      );
    }
    const key = phoneKey(digits);
    await this.excludedRepo.upsert({
      phone_key: key,
      phone: String(dto.phone).trim().slice(0, 64),
      reason: dto.reason,
      note: dto.note?.trim() || null,
      created_by: userId,
    });
    return { phone_key: key };
  }

  async restorePhone(key: string) {
    const deleted = await this.excludedRepo.destroy({
      where: { phone_key: phoneKey(key) },
    });
    return { deleted };
  }

  // ─── Sdelkalar (voronkalar bo'yicha) ────────────────────

  private leadWhere(
    from: Date,
    to: Date,
    userId: number | null,
    pipelineId: number | null,
  ) {
    const replacements: Record<string, unknown> = { from, to };
    let sql =
      'is_deleted = false AND amo_created_at >= :from AND amo_created_at < :to';
    if (userId) {
      sql += ' AND responsible_user_id = :userId';
      replacements.userId = userId;
    }
    if (pipelineId) {
      sql += ' AND pipeline_id = :pipelineId';
      replacements.pipelineId = pipelineId;
    }
    return { sql, replacements };
  }

  private async leadStats(
    from: Date,
    to: Date,
    userId: number | null,
    pipelineId: number | null,
  ) {
    const w = this.leadWhere(from, to, userId, pipelineId);

    const [rows, lossRows, pipelines, statuses, reasons] = await Promise.all([
      this.sequelize.query<{
        pipeline_id: number;
        status_id: number;
        count: number;
        sum: string;
      }>(
        `SELECT pipeline_id, status_id, COUNT(*)::int AS count, COALESCE(SUM(price), 0) AS sum
         FROM amo_leads WHERE ${w.sql}
         GROUP BY pipeline_id, status_id`,
        { replacements: w.replacements, type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{
        loss_reason_id: number | null;
        count: number;
        sum: string;
      }>(
        `SELECT loss_reason_id, COUNT(*)::int AS count, COALESCE(SUM(price), 0) AS sum
         FROM amo_leads WHERE ${w.sql} AND status_id = ${AMO_STATUS_LOST}
         GROUP BY loss_reason_id`,
        { replacements: w.replacements, type: QueryTypes.SELECT },
      ),
      this.pipelineRepo.findAll({ order: [['sort', 'ASC']] }),
      this.statusRepo.findAll({ order: [['sort', 'ASC']] }),
      this.lossReasonRepo.findAll({ order: [['sort', 'ASC']] }),
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

    const notOursRe = new RegExp(AMO_NOT_OURS_RE, 'i');
    const reasonNames = new Map(reasons.map((r) => [r.id, r.name]));
    const loss_reasons = lossRows
      .map((r) => {
        const name = r.loss_reason_id
          ? reasonNames.get(r.loss_reason_id) || null
          : null;
        return {
          id: r.loss_reason_id || 0,
          name,
          // "Bizniki emas" ma'nosidagi sabab
          is_not_ours: Boolean(name && notOursRe.test(name)),
          count: r.count,
          sum: Number(r.sum),
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      total: rows.reduce((a, r) => a + r.count, 0),
      sum: rows.reduce((a, r) => a + Number(r.sum), 0),
      won: sumOf(AMO_STATUS_WON),
      lost: sumOf(AMO_STATUS_LOST),
      loss_reasons,
      pipelines: result,
    };
  }

  async listLeads(query: LeadsListQueryDto) {
    const p = parsePeriod(query);
    const limit = query.limit || 50;
    const offset = ((query.page || 1) - 1) * limit;
    const w = this.leadWhere(p.from, p.to, p.userId, p.pipelineId);
    let sql = w.sql;
    const replacements: Record<string, unknown> = {
      ...w.replacements,
      limit,
      offset,
    };
    if (query.status_id) {
      sql += ' AND status_id = :statusId';
      replacements.statusId = Number(query.status_id);
    }
    if (query.loss_reason_id !== undefined && query.loss_reason_id !== null) {
      if (Number(query.loss_reason_id) === 0)
        sql += ' AND loss_reason_id IS NULL';
      else {
        sql += ' AND loss_reason_id = :lossReasonId';
        replacements.lossReasonId = Number(query.loss_reason_id);
      }
    }

    const rows = await this.sequelize.query<any>(
      `SELECT id, name, price, pipeline_id, status_id, loss_reason_id, tags,
              responsible_user_id, amo_created_at, amo_closed_at,
              COUNT(*) OVER()::int AS total_count
       FROM amo_leads WHERE ${sql}
       ORDER BY amo_created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );
    return this.pageResult(rows, 'lead');
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
