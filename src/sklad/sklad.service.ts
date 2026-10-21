import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import {
  AddSourceDto,
  CreateItemDto,
  CreateMovementDto,
  UpdateItemDto,
} from './dto/sklad.dto';
import { SkladContractLine } from './models/sklad-contract-line.model';
import { SkladItem } from './models/sklad-item.model';
import { MovementType, SkladMovement } from './models/sklad-movement.model';
import { SkladSetting } from './models/sklad-setting.model';
import { SkladSource } from './models/sklad-source.model';
import {
  lastDayOf,
  nameKey,
  parseContractsSheet,
  parseMonthSheet,
  parseSheetLink,
  SheetFormatError,
  SYS_NOTE,
} from './sheet-parser';

export interface AuthPayload {
  user_id: number;
  is_admin: boolean;
}

export type SkladMode = 'mirror' | 'live';

// Jihozvent ombori jadvali (Остатки на складе 2026)
const DEFAULT_SHEET_ID =
  process.env.SKLAD_SHEET_ID || '1FAsfpVsnVIGVGJmeycvuQLDwLj98ugsi6YP9nBU3Q80';
const DEFAULT_SOURCES: Array<{ kind: 'month' | 'contracts'; gid: string; title: string }> = [
  { kind: 'month', gid: '1519947381', title: 'Сентябрь 2026' },
  { kind: 'month', gid: '41866279', title: 'Октябрь2026' },
  { kind: 'contracts', gid: '2105367490', title: 'договора на складе' },
];

// Guruh -> mahsulot kodi prefiksi (VEN-0001)
const GROUP_PREFIX: Array<[RegExp, string]> = [
  [/вент/i, 'VEN'],
  [/клапан/i, 'KLP'],
  [/решет/i, 'RSH'],
  [/фильтр/i, 'FLT'],
  [/шумо/i, 'SHM'],
  [/чил/i, 'CHL'],
  [/пвн|пво/i, 'PVN'],
  [/импорт/i, 'IMP'],
];
const prefixOf = (group?: string | null) =>
  GROUP_PREFIX.find(([re]) => re.test(group || ''))?.[1] ?? 'OTH';

// Kiritgan xodim o'z yozuvini shu muddat ichida o'chira oladi (KP bilan bir xil)
const EDIT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const BATCH = 1000;

// Qoldiqqa ta'siri: snapshot qoldiqni o'rnatadi, qolganlari qo'shiladi/ayriladi
const SIGN: Record<Exclude<MovementType, 'snapshot'>, number> = {
  in: 1,
  out: -1,
  reserve: -1,
  release: 1,
  adjust: 1,
};

interface RawMove {
  item_id: number;
  type: MovementType;
  qty: number;
  move_date: string;
}

export interface PeriodRow {
  opening: number;
  in: number;
  out: number;
  reserve: number;
  release: number;
  adjust: number;
  closing: number;
  last_move_date: string | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const currentPeriod = () => todayStr().slice(0, 7);

// Foydalanuvchiga ko'rinadigan xato: `code` (+ `params`) bo'yicha frontend tanlangan tilga
// tarjima qiladi; `message` — o'zbekcha zaxira matn (Swagger, loglar, eski mijozlar uchun)
type HttpExceptionClass = new (body: Record<string, unknown>) => Error;
function skError(
  Exception: HttpExceptionClass,
  code: string,
  message: string,
  params?: Record<string, unknown>,
) {
  return new Exception({ message, code, ...(params ? { params } : {}) });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

@Injectable()
export class SkladService {
  private readonly logger = new Logger(SkladService.name);

  constructor(
    @InjectModel(SkladItem) private readonly itemRepo: typeof SkladItem,
    @InjectModel(SkladMovement) private readonly moveRepo: typeof SkladMovement,
    @InjectModel(SkladContractLine)
    private readonly contractRepo: typeof SkladContractLine,
    @InjectModel(SkladSource) private readonly sourceRepo: typeof SkladSource,
    @InjectModel(SkladSetting) private readonly settingRepo: typeof SkladSetting,
    @InjectModel(User) private readonly userRepo: typeof User,
    private readonly sequelize: Sequelize,
  ) {}

  // AdminGuard o'rniga: u ruxsat yo'qligida 401 qaytaradi, frontend esa har 401'da
  // tizimdan chiqarib yuboradi. Bu yerda 403 qaytadi va admin holati bazadan olinadi.
  async assertAdmin(payload: AuthPayload) {
    const user = await this.userRepo.findByPk(payload.user_id, { attributes: ['id', 'is_admin'] });
    if (!user?.is_admin) throw skError(ForbiddenException, 'SK_ADMIN_ONLY', 'Bu amal faqat admin uchun');
  }

  // ─── Sozlamalar ─────────────────────────────────────────────────────
  // mirror — ERP Google Sheets'ni aks ettiradi (qo'lda kiritish o'chiq),
  // live — ERP asosiy manba (sinxron o'chiq). Ikkalasi bir vaqtda yoqilsa
  // harakatlar ikki marta sanaladi, shuning uchun rejim bitta.
  async getMode(): Promise<SkladMode> {
    const row = await this.settingRepo.findByPk('mode');
    return row?.value === 'live' ? 'live' : 'mirror';
  }

  async getSettings() {
    return { mode: await this.getMode(), sheet_id: DEFAULT_SHEET_ID };
  }

  async setMode(mode: SkladMode) {
    await this.settingRepo.upsert({ key: 'mode', value: mode });
    return this.getSettings();
  }

  // ─── Qoldiq hisoblash ───────────────────────────────────────────────
  // Har mahsulot bo'yicha harakatlarni sana tartibida yuradi. Bir kunda avval
  // snapshot (kun boshidagi qoldiq), keyin boshqa harakatlar.
  // Davr boshidagi (yoki undan oldingi) snapshot ochilish qoldig'ini belgilaydi;
  // davr ichidagi snapshot (inventarizatsiya) farqi `adjust` ga qo'shiladi.
  private async computePeriod(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<Map<number, PeriodRow>> {
    const moves = await this.sequelize.query<RawMove>(
      `SELECT item_id, type, qty, move_date::text AS move_date
         FROM sklad_movements
        WHERE move_date <= :end ${itemId ? 'AND item_id = :itemId' : ''}
        ORDER BY item_id, move_date, (type <> 'snapshot'), id`,
      { replacements: { end, itemId }, type: QueryTypes.SELECT },
    );
    const result = new Map<number, PeriodRow>();
    let cur: PeriodRow | null = null;
    let curId = -1;
    let bal = 0;
    let openingSet = false;
    const flush = () => {
      if (!cur) return;
      if (!openingSet) cur.opening = r3(bal);
      cur.closing = r3(bal);
      result.set(curId, cur);
    };
    for (const m of moves) {
      if (m.item_id !== curId) {
        flush();
        curId = m.item_id;
        cur = { opening: 0, in: 0, out: 0, reserve: 0, release: 0, adjust: 0, closing: 0, last_move_date: null };
        bal = 0;
        openingSet = false;
      }
      const qty = Number(m.qty);
      const beforeStart =
        m.move_date < start || (m.type === 'snapshot' && m.move_date === start);
      if (beforeStart) {
        bal = m.type === 'snapshot' ? qty : bal + SIGN[m.type] * qty;
        continue;
      }
      if (!openingSet) {
        cur!.opening = r3(bal);
        openingSet = true;
      }
      if (m.type === 'snapshot') {
        cur!.adjust += qty - bal;
        bal = qty;
      } else {
        cur![m.type] += qty;
        bal += SIGN[m.type] * qty;
      }
      cur!.last_move_date = m.move_date;
    }
    flush();
    for (const row of result.values()) {
      for (const k of ['in', 'out', 'reserve', 'release', 'adjust'] as const) row[k] = r3(row[k]);
    }
    return result;
  }

  async currentBalance(itemId: number): Promise<number> {
    const map = await this.computePeriod('9999-12-31', '9999-12-31', itemId);
    return map.get(itemId)?.closing ?? 0;
  }

  private periodRange(period?: string) {
    const p = period && /^\d{4}-\d{2}$/.test(period) ? period : currentPeriod();
    return { period: p, start: `${p}-01`, end: lastDayOf(p) };
  }

  async periods(): Promise<string[]> {
    const rows = await this.sequelize.query<{ p: string }>(
      `SELECT DISTINCT to_char(move_date, 'YYYY-MM') AS p FROM sklad_movements ORDER BY p DESC`,
      { type: QueryTypes.SELECT },
    );
    const list = rows.map((r) => r.p);
    if (!list.includes(currentPeriod())) list.unshift(currentPeriod());
    return list.sort().reverse();
  }

  // Oylik hisobot: har mahsulot bo'yicha boshi/kirim/chiqim/rezerv/oxiri
  async report(period?: string) {
    const range = this.periodRange(period);
    const [items, balances, mode, periods, sources] = await Promise.all([
      this.itemRepo.findAll({ order: [['sort_order', 'ASC NULLS LAST'], ['id', 'ASC']] }),
      this.computePeriod(range.start, range.end),
      this.getMode(),
      this.periods(),
      this.sourceRepo.findAll({ attributes: ['period', 'last_synced_at'], where: { kind: 'month' } }),
    ]);
    const empty: PeriodRow = { opening: 0, in: 0, out: 0, reserve: 0, release: 0, adjust: 0, closing: 0, last_move_date: null };
    const rows = items.map((it) => ({
      ...it.get({ plain: true }),
      ...(balances.get(it.id) ?? empty),
    }));
    const lastSync = sources
      .map((s) => s.last_synced_at)
      .filter(Boolean)
      .sort((a, b) => +new Date(b as Date) - +new Date(a as Date))[0];
    return { ...range, mode, periods, last_synced_at: lastSync ?? null, items: rows };
  }

  // ─── Harakatlar jurnali ─────────────────────────────────────────────
  async movements(q: {
    period?: string;
    from?: string;
    to?: string;
    item_id?: number;
    type?: string;
    dogovor?: string;
    limit?: number;
  }) {
    const where: WhereOptions = {};
    const range = q.from || q.to ? null : this.periodRange(q.period);
    (where as any).move_date = range
      ? { [Op.between]: [range.start, range.end] }
      : {
          ...(q.from ? { [Op.gte]: q.from } : {}),
          ...(q.to ? { [Op.lte]: q.to } : {}),
        };
    if (q.item_id) (where as any).item_id = q.item_id;
    if (q.type) (where as any).type = q.type;
    else (where as any).type = { [Op.ne]: 'snapshot' };
    if (q.dogovor) (where as any).dogovor_number = q.dogovor;
    return this.moveRepo.findAll({
      where,
      include: [
        { model: SkladItem, attributes: ['id', 'code', 'name', 'group_name', 'unit'] },
        { model: User, as: 'creator', attributes: ['id', 'firstname', 'lastname'] },
      ],
      order: [['move_date', 'DESC'], ['id', 'DESC']],
      limit: Math.min(Number(q.limit) || 5000, 20000),
    });
  }

  async itemDetail(id: number) {
    const item = await this.itemRepo.findByPk(id);
    if (!item) throw skError(NotFoundException, 'SK_ITEM_NOT_FOUND', 'Mahsulot topilmadi');
    const [moves, balance, contracts] = await Promise.all([
      this.moveRepo.findAll({
        where: { item_id: id },
        include: [{ model: User, as: 'creator', attributes: ['id', 'firstname', 'lastname'] }],
        order: [['move_date', 'DESC'], ['id', 'DESC']],
        limit: 500,
      }),
      this.currentBalance(id),
      this.contractRepo.findAll({ where: { item_id: id }, order: [['row_no', 'ASC']] }),
    ]);
    return { item, balance, movements: moves, contracts };
  }

  async createMovement(dto: CreateMovementDto, payload: AuthPayload) {
    if ((await this.getMode()) !== 'live') {
      throw skError(
        BadRequestException,
        'SK_MIRROR_MODE',
        "Ombor hozir Google Sheets rejimida — harakatlar jadvaldan olinadi. Admin 'ERP asosiy' rejimini yoqgach kiritish ochiladi.",
      );
    }
    const item = await this.itemRepo.findByPk(dto.item_id);
    if (!item) throw skError(NotFoundException, 'SK_ITEM_NOT_FOUND', 'Mahsulot topilmadi');
    const qty = Number(dto.qty);
    if (!Number.isFinite(qty) || qty === 0) {
      throw skError(BadRequestException, 'SK_QTY_ZERO', "Miqdor 0 bo'lmasligi kerak");
    }
    if (dto.type !== 'adjust' && qty < 0) {
      throw skError(BadRequestException, 'SK_QTY_NEGATIVE', "Miqdor musbat bo'lishi kerak");
    }
    if (dto.type === 'adjust' && !dto.comment?.trim()) {
      throw skError(BadRequestException, 'SK_ADJUST_REASON', 'Tuzatish uchun sabab (izoh) yozing');
    }
    if (dto.type === 'out' || dto.type === 'reserve') {
      const bal = await this.currentBalance(item.id);
      if (qty > bal && !(dto.force && payload.is_admin)) {
        throw skError(
          BadRequestException,
          'SK_NOT_ENOUGH',
          `Omborda faqat ${bal} ${item.unit} bor — ${qty} chiqarib bo'lmaydi`,
          { balance: bal, qty, unit: item.unit },
        );
      }
    }
    const created = await this.moveRepo.create({
      item_id: item.id,
      type: dto.type,
      qty,
      move_date: dto.move_date?.slice(0, 10) || todayStr(),
      dogovor_number: dto.dogovor_number?.trim() || null,
      counterparty: dto.counterparty?.trim() || null,
      doc_number: dto.doc_number?.trim() || null,
      trace_id: dto.trace_id?.trim() || null,
      comment: dto.comment?.trim() || null,
      source: 'erp',
      created_by: payload.user_id,
    });
    return { movement: created, balance: await this.currentBalance(item.id) };
  }

  async removeMovement(id: number, payload: AuthPayload) {
    const m = await this.moveRepo.findByPk(id);
    if (!m) throw skError(NotFoundException, 'SK_MOVE_NOT_FOUND', 'Yozuv topilmadi');
    if (m.source !== 'erp') {
      throw skError(
        ForbiddenException,
        'SK_SHEET_MOVE_LOCKED',
        "Jadvaldan kelgan yozuvni o'chirib bo'lmaydi — Google Sheets'da tuzating",
      );
    }
    if (!payload.is_admin) {
      if (Number(m.created_by) !== Number(payload.user_id)) {
        throw skError(ForbiddenException, 'SK_NOT_OWNER', "Faqat kiritgan xodim yoki admin o'chira oladi");
      }
      if (Date.now() - new Date(m.get('createdAt') as Date).getTime() > EDIT_WINDOW_MS) {
        throw skError(ForbiddenException, 'SK_EDIT_WINDOW', "2 kundan oshgan yozuvni faqat admin o'chira oladi");
      }
    }
    await m.destroy();
    return { message: "O'chirildi" };
  }

  // ─── Mahsulotlar ────────────────────────────────────────────────────
  private async nextCodes(): Promise<Map<string, number>> {
    const rows = await this.sequelize.query<{ prefix: string; n: number }>(
      `SELECT split_part(code, '-', 1) AS prefix, MAX(split_part(code, '-', 2)::int) AS n
         FROM sklad_items WHERE code ~ '^[A-Z]+-[0-9]+$' GROUP BY 1`,
      { type: QueryTypes.SELECT },
    );
    return new Map(rows.map((r) => [r.prefix, Number(r.n)]));
  }

  private takeCode(seq: Map<string, number>, group?: string | null) {
    const prefix = prefixOf(group);
    const n = (seq.get(prefix) ?? 0) + 1;
    seq.set(prefix, n);
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }

  async createItem(dto: CreateItemDto) {
    const key = nameKey(dto.name);
    if (await this.itemRepo.findOne({ where: { name_key: key } })) {
      throw skError(BadRequestException, 'SK_ITEM_EXISTS', 'Bunday nomli mahsulot allaqachon bor');
    }
    const seq = await this.nextCodes();
    return this.itemRepo.create({
      code: this.takeCode(seq, dto.group_name),
      name: dto.name.replace(/\s+/g, ' ').trim(),
      name_key: key,
      group_name: dto.group_name?.trim() || null,
      unit: dto.unit?.trim() || 'dona',
      sap_code: dto.sap_code?.trim() || null,
      min_qty: dto.min_qty ?? null,
    });
  }

  async updateItem(id: number, dto: UpdateItemDto) {
    const item = await this.itemRepo.findByPk(id);
    if (!item) throw skError(NotFoundException, 'SK_ITEM_NOT_FOUND', 'Mahsulot topilmadi');
    const patch: Record<string, unknown> = { ...dto };
    if (dto.name) {
      patch.name = dto.name.replace(/\s+/g, ' ').trim();
      patch.name_key = nameKey(dto.name);
    }
    await item.update(patch as any);
    return item;
  }

  async contracts() {
    return this.contractRepo.findAll({
      include: [{ model: SkladItem, attributes: ['id', 'code', 'name', 'unit'] }],
      order: [['row_no', 'ASC NULLS LAST'], ['id', 'ASC']],
    });
  }

  // ─── Google Sheets manbalari va sinxron ────────────────────────────
  async sources() {
    if ((await this.sourceRepo.count()) === 0) {
      await this.sourceRepo.bulkCreate(
        DEFAULT_SOURCES.map((s) => ({ ...s, sheet_id: DEFAULT_SHEET_ID })),
      );
    }
    return this.sourceRepo.findAll({ order: [['kind', 'DESC'], ['period', 'ASC NULLS LAST'], ['id', 'ASC']] });
  }

  async addSource(dto: AddSourceDto) {
    const { sheetId, gid } = parseSheetLink(dto.link);
    if (!gid) throw skError(BadRequestException, 'SK_LINK_NO_GID', 'Havolada varaq raqami (gid=...) topilmadi');
    const sheet_id = sheetId || DEFAULT_SHEET_ID;
    const exists = await this.sourceRepo.findOne({ where: { sheet_id, gid } });
    if (exists) return exists;
    return this.sourceRepo.create({ kind: dto.kind, sheet_id, gid, title: dto.title?.trim() || null });
  }

  async removeSource(id: number) {
    const s = await this.sourceRepo.findByPk(id);
    if (!s) throw skError(NotFoundException, 'SK_SOURCE_NOT_FOUND', 'Manba topilmadi');
    await s.destroy();
    return { message: "O'chirildi (import qilingan ma'lumotlar saqlanib qoladi)" };
  }

  private async fetchCsv(sheetId: string, gid: string): Promise<string> {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    if (!res.ok || /^\s*<!doctype html/i.test(text)) {
      throw skError(
        BadRequestException,
        'SK_SHEET_UNREADABLE',
        `Google Sheets varag'ini o'qib bo'lmadi (HTTP ${res.status}). Jadval "havolasi borlar ko'ra oladi" qilib ochilganini tekshiring.`,
        { status: res.status },
      );
    }
    return text;
  }

  async sync(sourceId: number | undefined, payload: AuthPayload) {
    if ((await this.getMode()) === 'live') {
      throw skError(
        BadRequestException,
        'SK_LIVE_MODE',
        "ERP asosiy rejimda — Google Sheets sinxroni o'chirilgan (harakatlar ikki marta sanalmasin).",
      );
    }
    const all = await this.sources();
    const list = sourceId ? all.filter((s) => s.id === sourceId) : all;
    if (!list.length) throw skError(NotFoundException, 'SK_SOURCE_NOT_FOUND', 'Manba topilmadi');
    // Avval oylik varaqlar (mahsulotlar yaratiladi), keyin shartnomalar (nom bo'yicha bog'lanadi)
    list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'month' ? -1 : 1));
    const results: any[] = [];
    for (const src of list) {
      const started = Date.now();
      let result: any;
      try {
        const csv = await this.fetchCsv(src.sheet_id, src.gid);
        result =
          src.kind === 'month'
            ? await this.importMonth(csv, src, payload.user_id)
            : await this.importContracts(csv);
        result.ok = true;
      } catch (e: any) {
        this.logger.warn(`Sklad sync ${src.id} failed: ${e?.message}`);
        // Kod (SheetFormatError yoki skError) bo'lsa — frontend tarjima qiladi
        const body = e?.getResponse?.() ?? {};
        result = {
          ok: false,
          code: e instanceof SheetFormatError ? e.code : body.code || 'SK_SYNC_FAILED',
          params: (e instanceof SheetFormatError ? e.params : body.params) || null,
          error: body.message || e?.message || 'Xatolik',
        };
      }
      result.ms = Date.now() - started;
      await src.update({ last_synced_at: new Date(), last_result: result });
      results.push({ source_id: src.id, title: src.title, kind: src.kind, ...result });
    }
    return { results };
  }

  private async importMonth(csv: string, src: SkladSource, userId: number) {
    const parsed = parseMonthSheet(csv);
    const { period } = parsed;
    const seq = await this.nextCodes();

    return this.sequelize.transaction(async (transaction) => {
      const existing = await this.itemRepo.findAll({ attributes: ['id', 'name_key'], transaction });
      const idByKey = new Map(existing.map((i) => [i.name_key, i.id]));
      // Tartib, nom va guruh faqat eng oxirgi oy varag'idan olinadi (eski oyni qayta
      // sinxronlash joriy tartibni buzmasin). Varaqdagi № har guruhda qaytadan
      // boshlanishi mumkin, shuning uchun tartib = varaqdagi qator o'rni.
      const [{ latest }] = await this.sequelize.query<{ latest: string | null }>(
        `SELECT MAX(source_period) AS latest FROM sklad_movements
          WHERE source = 'sheet' AND source_period <> :period`,
        { replacements: { period }, type: QueryTypes.SELECT, transaction },
      );
      const isLatest = !latest || period >= latest;

      // Mahsulotlar: nom bo'yicha topiladi, yo'q bo'lsa yaratiladi; guruh/tartib yangilanadi
      let created = 0;
      const seen = new Set<string>();
      const upserts: any[] = [];
      parsed.rows.forEach((row, pos) => {
        const key = nameKey(row.name);
        if (seen.has(key)) return;
        seen.add(key);
        const id = idByKey.get(key);
        if (!id) created++;
        upserts.push(
          id
            ? isLatest
              ? { id, name: row.name, group_name: row.group_name, sub_group: row.sub_group, sort_order: pos + 1 }
              : { id }
            : {
                code: this.takeCode(seq, row.group_name),
                name: row.name,
                name_key: key,
                group_name: row.group_name,
                sub_group: row.sub_group,
                sort_order: (isLatest ? 0 : 500000) + pos + 1,
              },
        );
      });
      const newOnes = upserts.filter((u) => !u.id);
      for (const b of chunk(newOnes, BATCH)) {
        const rows = await this.itemRepo.bulkCreate(b, { transaction, returning: ['id', 'name_key'] });
        rows.forEach((r) => idByKey.set(r.name_key, r.id));
      }
      // Mavjudlarini bitta UPDATE bilan (bulkCreate+updateOnDuplicate NOT NULL `code` ga uriladi)
      for (const b of chunk(upserts.filter((u) => u.id), BATCH)) {
        await this.sequelize.query(
          `UPDATE sklad_items i
              SET name = COALESCE(v.name, i.name), group_name = COALESCE(v.group_name, i.group_name),
                  sub_group = COALESCE(v.sub_group, i.sub_group),
                  sort_order = COALESCE(v.sort_order, i.sort_order), "updatedAt" = now()
             FROM json_to_recordset(:rows) AS v(id int, name text, group_name text, sub_group text, sort_order int)
            WHERE i.id = v.id`,
          { replacements: { rows: JSON.stringify(b) }, transaction },
        );
      }

      // Shu oyning jadvaldan kelgan harakatlari to'liq almashtiriladi
      const removed = await this.moveRepo.destroy({
        where: { source: 'sheet', source_period: period },
        transaction,
      });
      const moves: any[] = [];
      const done = new Set<string>();
      for (const row of parsed.rows) {
        const key = nameKey(row.name);
        if (done.has(key)) continue;
        done.add(key);
        const item_id = idByKey.get(key)!;
        const base = { item_id, source: 'sheet', source_period: period, created_by: userId };
        moves.push({ ...base, type: 'snapshot', qty: row.opening, move_date: `${period}-01`, comment: SYS_NOTE.opening });
        for (const m of row.moves) {
          moves.push({ ...base, type: m.type, qty: m.qty, move_date: m.date, comment: m.comment ?? null });
        }
      }
      // Bu oy varag'ida yo'q mahsulotlar — jadvaldagidek oy boshidan 0 (nomi o'zgargan
      // yoki ro'yxatdan olib tashlangan qator eski qoldiqni olib yurmasin)
      let missing = 0;
      const missingIds: number[] = [];
      for (const [key, item_id] of idByKey) {
        if (done.has(key)) continue;
        missing++;
        missingIds.push(item_id);
        moves.push({
          item_id,
          type: 'snapshot',
          qty: 0,
          move_date: `${period}-01`,
          comment: SYS_NOTE.missing,
          source: 'sheet',
          source_period: period,
          created_by: userId,
        });
      }
      for (const b of chunk(moves, BATCH)) {
        await this.moveRepo.bulkCreate(b, { transaction });
      }
      // Oxirgi varaqda yo'q mahsulotlar ro'yxat oxiriga tushadi
      if (isLatest && missingIds.length) {
        await this.sequelize.query(
          `UPDATE sklad_items SET sort_order = 1000000 + id WHERE id IN (:ids)`,
          { replacements: { ids: missingIds }, transaction },
        );
      }
      await src.update({ period }, { transaction });
      return {
        period,
        items: parsed.rows.length,
        items_created: created,
        items_missing: missing,
        movements: moves.length,
        movements_replaced: removed,
        warnings: parsed.warnings.slice(0, 50),
        warnings_total: parsed.warnings.length,
      };
    });
  }

  private async importContracts(csv: string) {
    const lines = parseContractsSheet(csv);
    const items = await this.itemRepo.findAll({ attributes: ['id', 'name_key'] });
    const idByKey = new Map(items.map((i) => [i.name_key, i.id]));
    let linked = 0;
    const rows = lines.map((l) => {
      const item_id = idByKey.get(nameKey(l.item_name)) ?? null;
      if (item_id) linked++;
      return { ...l, item_id };
    });
    await this.sequelize.transaction(async (transaction) => {
      await this.contractRepo.destroy({ where: {}, transaction });
      for (const b of chunk(rows, BATCH)) await this.contractRepo.bulkCreate(b, { transaction });
    });
    return {
      lines: rows.length,
      linked_items: linked,
      contracts: new Set(rows.map((r) => r.dogovor_number).filter(Boolean)).size,
    };
  }
}
