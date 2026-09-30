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
import { AmoContact } from './models/amo-contact.model';
import { AmoLeadContact } from './models/amo-lead-contact.model';
import { AmoLead } from './models/amo-lead.model';
import { AmoLossReason } from './models/amo-loss-reason.model';
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
    @InjectModel(AmoLossReason)
    private readonly lossReasonRepo: typeof AmoLossReason,
    @InjectModel(AmoLead) private readonly leadRepo: typeof AmoLead,
    @InjectModel(AmoCall) private readonly callRepo: typeof AmoCall,
    @InjectModel(AmoContact) private readonly contactRepo: typeof AmoContact,
    @InjectModel(AmoLeadContact)
    private readonly leadContactRepo: typeof AmoLeadContact,
    @InjectModel(AmoSyncState) private readonly stateRepo: typeof AmoSyncState,
  ) {}

  get isRunning() {
    return this.running;
  }

  async onApplicationBootstrap() {
    await this.ensureSchema();
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

  // sequelize sync mavjud jadvalga yangi ustun qo'shmaydi — shuning uchun
  // keyin qo'shilgan ustunlar shu yerda (idempotent) qo'shiladi.
  private async ensureSchema() {
    const db = this.leadRepo.sequelize!;
    try {
      const [cols] = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'amo_leads' AND column_name = 'loss_reason_id'`,
      );
      const hadLossReason = (cols as unknown[]).length > 0;
      const [srcCols] = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'amo_calls' AND column_name = 'source'`,
      );
      const hadSource = (srcCols as unknown[]).length > 0;

      await db.query(`
        ALTER TABLE amo_leads
          ADD COLUMN IF NOT EXISTS loss_reason_id INTEGER,
          ADD COLUMN IF NOT EXISTS tags JSONB;
        ALTER TABLE amo_calls
          ADD COLUMN IF NOT EXISTS source VARCHAR(64);
        ALTER TABLE amo_calls
          ADD COLUMN IF NOT EXISTS phone_key VARCHAR(16)
          GENERATED ALWAYS AS (
            NULLIF(right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9), '')
          ) STORED;
        CREATE INDEX IF NOT EXISTS amo_calls_phone_key_idx
          ON amo_calls (phone_key, amo_created_at);
      `);

      // Yangi ustunlar to'lishi uchun keyingi sinxronizatsiya to'liq o'tsin
      if (!hadLossReason) {
        await this.stateRepo.destroy({ where: { entity: 'leads_full' } });
        this.logger.log(
          "amo_leads'ga yangi ustunlar qo'shildi — to'liq qayta o'tiladi",
        );
      }
      // Eski qo'ng'iroqlarning manbasi (source) to'lishi uchun qayta tortamiz
      if (!hadSource) {
        await this.stateRepo.destroy({
          where: { entity: AMO_NOTE_ENTITIES.map((e) => `calls_${e}`) },
        });
        this.logger.log(
          "amo_calls'ga source qo'shildi — qo'ng'iroqlar qayta tortiladi",
        );
      }
      // Lid ↔ kontakt bog'lanishlari hali yo'q bo'lsa — lidlar to'liq qayta o'tilsin
      const [[links]] = (await db.query(
        `SELECT (SELECT COUNT(*) FROM amo_lead_contacts)::int AS links,
                (SELECT COUNT(*) FROM amo_leads)::int AS leads`,
      )) as any;
      if (links.links === 0 && links.leads > 0) {
        await this.stateRepo.destroy({ where: { entity: 'leads_full' } });
        this.logger.log(
          "Lid ↔ kontakt bog'lanishlari to'ldiriladi — to'liq qayta o'tiladi",
        );
      }
    } catch (err) {
      this.logger.error(`ensureSchema: ${(err as Error).message}`);
    }
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
      await this.step('loss_reasons', () => this.syncLossReasons());
      if (forceFull || (await this.isFullReconcileDue())) {
        await this.step('leads_full', () => this.fullLeadsPass());
      } else {
        await this.step('leads', () => this.incrementalLeads());
      }
      for (const entity of AMO_NOTE_ENTITIES) {
        await this.step(`calls_${entity}`, () => this.syncCalls(entity));
      }
      await this.step('contacts', () => this.syncContacts());
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

  private async syncLossReasons(): Promise<StepResult> {
    const data = await this.client.get('leads/loss_reasons');
    const reasons = data?._embedded?.loss_reasons ?? [];
    if (reasons.length) {
      await this.lossReasonRepo.bulkCreate(
        reasons.map((r: any) => ({ id: r.id, name: r.name, sort: r.sort })),
        { updateOnDuplicate: ['name', 'sort', 'updatedAt'] },
      );
    }
    return { items: reasons.length };
  }

  private async incrementalLeads(): Promise<StepResult> {
    const cursor = await this.getCursor('leads');
    const from = cursor ? cursor - CURSOR_OVERLAP_SEC : historyCutoff();
    const { items, maxUpdated } = await this.walk(
      'leads',
      'leads',
      { with: 'contacts' },
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
      { with: 'contacts' },
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
    await this.saveLeadContacts(leads);
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
        loss_reason_id: l.loss_reason_id || null,
        tags: (l._embedded?.tags ?? []).map((t: any) => String(t.name)),
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
          'loss_reason_id',
          'tags',
          'is_deleted',
          'synced_at',
          'updatedAt',
        ],
      },
    );
  }

  // Lid ↔ kontakt bog'lanishlari: lidning ro'yxati har safar to'liq almashtiriladi
  private async saveLeadContacts(leads: any[]) {
    const ids = leads.map((l) => l.id);
    const links = leads.flatMap((l) =>
      (l._embedded?.contacts ?? []).map((c: any) => ({
        lead_id: l.id,
        contact_id: c.id,
      })),
    );
    await this.leadContactRepo.destroy({ where: { lead_id: ids } });
    if (links.length) {
      await this.leadContactRepo.bulkCreate(links, { ignoreDuplicates: true });
    }
  }

  // Kontaktlar: o'zgarganlari (updated_at bo'yicha) + qo'ng'iroqlarda uchragan,
  // lekin bazada yo'q kontaktlar id bo'yicha so'raladi
  private async syncContacts(): Promise<StepResult> {
    const cursor = await this.getCursor('contacts');
    const from = cursor ? cursor - CURSOR_OVERLAP_SEC : historyCutoff();
    const { items, maxUpdated } = await this.walk(
      'contacts',
      'contacts',
      {},
      from,
      (rows) => this.saveContacts(rows),
    );

    const db = this.contactRepo.sequelize!;
    const [missingRows] = await db.query(
      `SELECT DISTINCT c.entity_id AS id FROM amo_calls c
       LEFT JOIN amo_contacts ct ON ct.id = c.entity_id
       WHERE c.entity_type = 'contacts' AND ct.id IS NULL
       LIMIT 5000`,
    );
    const missing = (missingRows as { id: string }[]).map((r) => Number(r.id));
    let fetched = 0;
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      const params: AmoParams = { limit: AMO_PAGE_LIMIT };
      chunk.forEach((id, idx) => (params[`filter[id][${idx}]`] = id));
      const data = await this.client.get('contacts', params);
      const found: any[] = data?._embedded?.contacts ?? [];
      await this.saveContacts(found);
      fetched += found.length;
      // Topilmaganlari amoCRM'da o'chirilgan — qayta so'ramaslik uchun belgilaymiz
      const foundIds = new Set(found.map((c) => Number(c.id)));
      const gone = chunk.filter((id) => !foundIds.has(id));
      if (gone.length) {
        await this.contactRepo.bulkCreate(
          gone.map((id) => ({ id, is_deleted: true })),
          { ignoreDuplicates: true },
        );
      }
    }
    return {
      items: items + fetched,
      cursor: Math.max(maxUpdated, cursor ?? 0),
    };
  }

  private async saveContacts(contacts: any[]) {
    if (!contacts.length) return;
    await this.contactRepo.bulkCreate(
      contacts.map((c) => ({
        id: c.id,
        name: c.name ? String(c.name).slice(0, 512) : null,
        responsible_user_id: c.responsible_user_id ?? null,
        tags: (c._embedded?.tags ?? []).map((t: any) => String(t.name)),
        amo_updated_at: toDate(c.updated_at),
        is_deleted: false,
      })),
      {
        updateOnDuplicate: [
          'name',
          'responsible_user_id',
          'tags',
          'amo_updated_at',
          'is_deleted',
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
          source: p.source ? String(p.source).slice(0, 64) : null,
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
        'source',
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
