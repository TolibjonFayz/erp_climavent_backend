import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomBytes, timingSafeEqual } from 'crypto';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { SheetFormatError } from 'src/sklad/sheet-parser';
import {
  CreateNoteDto,
  CreateOrderDto,
  CreatePaymentDto,
  UpdateOrderDto,
  UpdatePaymentDto,
} from './dto/otgruzka.dto';
import { OtgruzkaLine } from './models/otgruzka-line.model';
import { OtgruzkaNote } from './models/otgruzka-note.model';
import { OtgruzkaOrder, OtgruzkaOrderAtr } from './models/otgruzka-order.model';
import { OtgruzkaPayment } from './models/otgruzka-payment.model';
import { OtgruzkaSetting } from './models/otgruzka-setting.model';
import {
  companyKey,
  isOfficial,
  parseLinesSheet,
  parseMainSheet,
  ParsedOrderRow,
  seriesOf,
} from './otgruzka-parser';

export interface AuthPayload {
  user_id: number;
  is_admin: boolean;
}

export type OtgruzkaMode = 'mirror' | 'live';

// "Отгрузка Трекер" jadvali (egasi — Ilyosov M.). Havola orqali ochiq: CSV auth'siz o'qiladi.
const SHEET_ID = process.env.OTGRUZKA_SHEET_ID || '1AFAdkDB7vMSGKd7l5-x8mZl5EPK387otHQSyuFWPjYs';
const MAIN_GID = process.env.OTGRUZKA_MAIN_GID || '1422524437'; // Главная
const LINES_GID = process.env.OTGRUZKA_LINES_GID || '0'; // Лист1
const SYNC_INTERVAL_MS = Number(process.env.OTGRUZKA_SYNC_INTERVAL_MS) || 5 * 60 * 1000;
const BOOT_DELAY_MS = 30 * 1000;
// Jadval tahrirlanganda Apps Script signal yuboradi — ketma-ket tahrirlar bitta sinxronga yig'iladi
const HOOK_DEBOUNCE_MS = 8 * 1000;
// ERP jadvalga yozgandan keyin shu vaqt ichida sinxron bu qatorni jadvaldan qayta yozmaydi
// (CSV eksporti bir necha soniya eski bo'lishi mumkin — ERP'dagi o'zgarish qaytib ketmasin)
const WRITE_GUARD_MS = Number(process.env.OTGRUZKA_WRITE_GUARD_MS) || 2 * 60 * 1000;
// Faqat lokal sinov uchun: CSV'ni Google o'rniga boshqa manzildan o'qish ("{gid}" o'rniga varaq raqami)
const CSV_URL_TEMPLATE = process.env.OTGRUZKA_CSV_URL_TEMPLATE || '';

// ERP holati → jadvaldagi "Статус товаров" matni (parser finalStatusOf bilan qaytib o'qiladi)
const FINAL_TEXT: Record<string, string> = {
  refused: 'отказ отклиента',
  returned: 'возврат',
  stopped: 'стоп',
  stock: 'запас',
};
// Yakuniy holat bo'lmasa jadval formulasi chiqaradigan matn
const formulaStatus = (shipped: number) => (shipped >= 1 ? 'Готово' : shipped > 0 ? 'Частично отгружен' : 'Ожидание');
const sheetFlag = (v: boolean | null | undefined) => (v === true ? 1 : v === false ? 0 : '-');
const digitsOrText = (v: string | null | undefined) => (v && /^\d+$/.test(v) ? Number(v) : v ?? '');

// ERP maydoni → jadval ustuni (Apps Script'dagi kalitlar bilan bir xil)
const SHEET_FIELDS: Record<string, [string, (v: any) => any]> = {
  dogovor_number: ['number', digitsOrText],
  dogovor_date: ['date', (v) => v ?? null],
  client_name: ['company', (v) => v ?? ''],
  client_inn: ['inn', digitsOrText],
  client_contact: ['contact', (v) => v ?? ''],
  client_phone: ['phone', (v) => v ?? ''],
  manager_name: ['manager', (v) => v ?? ''],
  contract_sum: ['sum', (v) => Number(v) || 0],
  paid_sum: ['paid', (v) => Number(v) || 0],
  ready_pct: ['ready', (v) => Number(v) || 0],
  shipped_pct: ['shipped', (v) => Number(v) || 0],
  didox_contract: ['didox_contract', sheetFlag],
  didox_poa: ['didox_poa', sheetFlag],
  invoice_numbers: ['invoice', (v) => v ?? ''],
  sgp_date: ['sgp', (v) => v ?? null],
  note_main: ['note_main', (v) => v ?? ''],
  final_status: ['status', (v) => (v ? FINAL_TEXT[v] : null)],
};

// Signallar chegaralari (kun)
const READY_WAIT_DAYS = 7;
const PAID_WAIT_DAYS = 14;
const EDIT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const EPS = 1; // so'm — yaxlitlash farqi

// Sinxronda o'zgarishi tarixga yoziladigan maydonlar
const TRACKED: Array<keyof OtgruzkaOrderAtr> = [
  'contract_sum',
  'ready_pct',
  'shipped_pct',
  'didox_contract',
  'didox_poa',
  'invoice_numbers',
  'sheet_status',
  'manager_name',
  'sgp_date',
  'final_status',
];

type HttpExceptionClass = new (body: Record<string, unknown>) => Error;
// Foydalanuvchiga ko'rinadigan xato: `code` bo'yicha frontend tarjima qiladi
function otError(Ex: HttpExceptionClass, code: string, message: string, params?: Record<string, unknown>) {
  return new Ex({ message, code, ...(params ? { params } : {}) });
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysSince = (d: Date | string | null | undefined) => {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null;
};
const same = (a: unknown, b: unknown) => {
  if (typeof a === 'number' || typeof b === 'number') return Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 1e-6;
  return (a ?? null) === (b ?? null);
};
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Hisoblanadigan holatlar ─────────────────────────────────────────
export function payStatusOf(o: Pick<OtgruzkaOrder, 'contract_sum' | 'paid_sum'>) {
  if (!(o.contract_sum > 0)) return o.paid_sum > 0 ? 'paid' : 'none';
  if (o.paid_sum >= o.contract_sum - EPS) return 'paid';
  return o.paid_sum > EPS ? 'partial' : 'unpaid';
}

export function stageOf(o: Pick<OtgruzkaOrder, 'final_status' | 'shipped_pct' | 'ready_pct' | 'contract_sum' | 'paid_sum'>) {
  if (o.final_status) return o.final_status;
  if (o.shipped_pct >= 1) return payStatusOf(o) === 'paid' || payStatusOf(o) === 'none' ? 'done' : 'shipped';
  if (o.shipped_pct > 0) return 'partial';
  if (o.ready_pct >= 1) return 'ready';
  return 'waiting';
}

export function alertsOf(o: OtgruzkaOrder) {
  const out: string[] = [];
  if (o.final_status) return out;
  const pay = payStatusOf(o);
  if (o.shipped_pct > 0 && (pay === 'unpaid' || pay === 'partial')) out.push('shipped_unpaid');
  const paidAge = daysSince(o.paid_at ?? o.dogovor_date);
  if (pay === 'paid' && o.shipped_pct < 1 && paidAge !== null && paidAge > PAID_WAIT_DAYS) out.push('paid_not_shipped');
  const readyAge = daysSince(o.ready_at ?? o.dogovor_date);
  if (o.ready_pct >= 1 && o.shipped_pct < 1 && readyAge !== null && readyAge > READY_WAIT_DAYS) out.push('ready_waiting');
  if (isOfficial(o.series) && o.shipped_pct > 0 && (o.didox_contract === false || o.didox_poa === false)) {
    out.push('didox_missing');
  }
  if (o.next_action_date && o.next_action_date < todayStr()) out.push('overdue');
  if (!(o.contract_sum > 0)) out.push('zero_sum');
  return out;
}

@Injectable()
export class OtgruzkaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OtgruzkaService.name);
  private syncing: Promise<any> | null = null;
  private bootTimer?: NodeJS.Timeout;
  private intervalTimer?: NodeJS.Timeout;
  private hookTimer?: NodeJS.Timeout;
  // Jadvalga yozish va jadvaldan o'qish navbat bilan (biri ikkinchisining ustiga tushmasin)
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectModel(OtgruzkaOrder) private readonly orderRepo: typeof OtgruzkaOrder,
    @InjectModel(OtgruzkaPayment) private readonly paymentRepo: typeof OtgruzkaPayment,
    @InjectModel(OtgruzkaNote) private readonly noteRepo: typeof OtgruzkaNote,
    @InjectModel(OtgruzkaLine) private readonly lineRepo: typeof OtgruzkaLine,
    @InjectModel(OtgruzkaSetting) private readonly settingRepo: typeof OtgruzkaSetting,
    @InjectModel(Dogovor) private readonly dogovorRepo: typeof Dogovor,
    @InjectModel(User) private readonly userRepo: typeof User,
    private readonly sequelize: Sequelize,
  ) {}

  // Mirror rejimda jadval har 5 daqiqada avtomatik o'qiladi (OTGRUZKA_SYNC_ENABLED=false — o'chiq)
  async onApplicationBootstrap() {
    // sequelize sync mavjud jadvalga yangi ustun qo'shmaydi
    try {
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS erp_written_at TIMESTAMPTZ`);
    } catch (e: any) {
      this.logger.error(`otgruzka_orders ustuni qo'shilmadi: ${e?.message}`);
    }
    if (process.env.OTGRUZKA_SYNC_ENABLED === 'false') {
      this.logger.log("OTGRUZKA_SYNC_ENABLED=false — avtomatik sinxron o'chirilgan");
      return;
    }
    this.bootTimer = setTimeout(() => this.runScheduled(), BOOT_DELAY_MS);
    this.intervalTimer = setInterval(() => this.runScheduled(), SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.hookTimer) clearTimeout(this.hookTimer);
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runScheduled() {
    try {
      if ((await this.getMode()) !== 'mirror') return;
      await this.sync(null);
    } catch (e: any) {
      this.logger.warn(`Otgruzka avto-sinxron xatosi: ${e?.message}`);
    }
  }

  async assertAdmin(payload: AuthPayload) {
    const user = await this.userRepo.findByPk(payload.user_id, { attributes: ['id', 'is_admin'] });
    if (!user?.is_admin) throw otError(ForbiddenException, 'OT_ADMIN_ONLY', 'Bu amal faqat admin uchun');
  }

  private async isAdmin(payload: AuthPayload) {
    const user = await this.userRepo.findByPk(payload.user_id, { attributes: ['id', 'is_admin'] });
    return Boolean(user?.is_admin);
  }

  // ─── Sozlamalar ─────────────────────────────────────────────────────
  async getMode(): Promise<OtgruzkaMode> {
    const row = await this.settingRepo.findByPk('mode');
    return row?.value === 'live' ? 'live' : 'mirror';
  }

  async getSettings() {
    const [mode, last, url] = await Promise.all([
      this.getMode(),
      this.settingRepo.findByPk('last_sync'),
      this.settingRepo.findByPk('script_url'),
    ]);
    return {
      mode,
      // Ikki tomonlama: ERP'dagi o'zgarish Apps Script orqali jadvalga ham yoziladi
      two_way: mode === 'mirror' && Boolean(url?.value),
      script_connected: Boolean(url?.value),
      sheet_id: SHEET_ID,
      sheet_url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${MAIN_GID}`,
      auto_sync: process.env.OTGRUZKA_SYNC_ENABLED !== 'false',
      sync_interval_min: Math.round(SYNC_INTERVAL_MS / 60000),
      last_sync: last?.value ?? null,
    };
  }

  async setMode(mode: OtgruzkaMode) {
    await this.settingRepo.upsert({ key: 'mode', value: mode });
    return this.getSettings();
  }

  // ─── Apps Script (ikki tomonlama sinxron) ───────────────────────────
  private async getSecret(): Promise<string> {
    const row = await this.settingRepo.findByPk('secret');
    if (row?.value) return row.value;
    const secret = randomBytes(24).toString('hex');
    await this.settingRepo.upsert({ key: 'secret', value: secret });
    return secret;
  }

  private async scriptUrl(): Promise<string | null> {
    return (await this.settingRepo.findByPk('script_url'))?.value || null;
  }

  // Faqat admin: skript matniga qo'yiladigan maxfiy kalit va ulangan manzil
  async scriptSettings() {
    return { secret: await this.getSecret(), script_url: await this.scriptUrl() };
  }

  // Manzil saqlanishidan oldin skript bilan aloqa tekshiriladi
  async setScriptUrl(url: string | null | undefined) {
    const v = url?.trim() || null;
    if (v && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) {
      throw otError(
        BadRequestException,
        'OT_SCRIPT_URL_INVALID',
        "Manzil https://script.google.com/macros/s/.../exec ko'rinishida bo'lishi kerak",
      );
    }
    if (v) await this.callScript([{ op: 'ping' }], v);
    await this.settingRepo.upsert({ key: 'script_url', value: v });
    return this.scriptSettings();
  }

  async testScript() {
    const res = await this.callScript([{ op: 'ping' }]);
    return res.results?.[0] ?? res;
  }

  private async callScript(ops: Array<Record<string, any>>, url?: string | null) {
    const target = url ?? (await this.scriptUrl());
    if (!target) throw otError(BadRequestException, 'OT_SCRIPT_NOT_SET', 'Apps Script ulanmagan');
    let status = 0;
    let text = '';
    try {
      // Apps Script POST'ga 302 bilan javob beradi — natija yo'naltirilgan manzildan olinadi
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: await this.getSecret(), ops }),
        redirect: 'follow',
        signal: AbortSignal.timeout(40000),
      });
      status = res.status;
      text = await res.text();
    } catch (e: any) {
      this.logger.warn(`Apps Script tarmoq xatosi: ${e?.message}`);
      throw otError(BadGatewayException, 'OT_SHEET_WRITE_FAILED', "Jadvalga yozib bo'lmadi (tarmoq)", { reason: 'network' });
    }
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      throw otError(BadGatewayException, 'OT_SHEET_WRITE_FAILED', "Apps Script kutilmagan javob qaytardi", {
        reason: `http_${status}`,
      });
    }
    if (!data?.ok) {
      const reason = String(data?.error || data?.results?.find((r: any) => !r.ok)?.error || 'unknown');
      throw otError(BadGatewayException, 'OT_SHEET_WRITE_FAILED', `Jadvalga yozib bo'lmadi: ${reason}`, { reason });
    }
    return data;
  }

  // Jadvaldagi qatorni topish kaliti: hozirgi raqam + kompaniya, ERP bilgan qator, takror tartibi
  private sheetKeyOf(o: OtgruzkaOrder) {
    const nth = Number(/#(\d+)$/.exec(o.sheet_key || '')?.[1] || 1);
    return { number: o.dogovor_number, company: o.client_name, row: o.sheet_row, nth };
  }

  private toSheet(patch: Record<string, any>) {
    const set: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      const m = SHEET_FIELDS[k];
      if (m) set[m[0]] = m[1](v);
    }
    return set;
  }

  // Jadval tahrirlanganda Apps Script chaqiradi (JWT'siz, maxfiy kalit bilan)
  async hook(secret: string | undefined, ping?: boolean) {
    const real = Buffer.from(await this.getSecret());
    const got = Buffer.from(String(secret || ''));
    if (got.length !== real.length || !timingSafeEqual(got, real)) {
      throw otError(ForbiddenException, 'OT_HOOK_FORBIDDEN', "Kalit noto'g'ri");
    }
    if (ping) return { ok: true, mode: await this.getMode() };
    if ((await this.getMode()) !== 'mirror') return { ok: true, skipped: 'live' };
    if (this.hookTimer) clearTimeout(this.hookTimer);
    this.hookTimer = setTimeout(() => {
      this.hookTimer = undefined;
      this.sync(null).catch((e) => this.logger.warn(`Otgruzka hook sync: ${e?.message}`));
    }, HOOK_DEBOUNCE_MS);
    return { ok: true, scheduled_in_ms: HOOK_DEBOUNCE_MS };
  }

  // Tahrirlash mumkinmi: live — faqat ERP; mirror + skript ulangan — jadvalga ham yoziladi
  private async editMode(): Promise<'live' | 'sync'> {
    if ((await this.getMode()) === 'live') return 'live';
    if (await this.scriptUrl()) return 'sync';
    throw otError(
      BadRequestException,
      'OT_MIRROR_MODE',
      "Hozir Google Sheets asosiy manba — bu ma'lumot jadvalda o'zgartiriladi va ERP'ga avtomatik tushadi",
    );
  }

  // Kartadagi o'zgarishni jadvalga yozadi. Jadvalda qatori yo'q karta bo'lsa — jadvalga yangi
  // qator qo'shiladi va karta shu qatorga bog'lanadi (keyingi sinxron dublikat yaratmasin).
  private async pushOrder(o: OtgruzkaOrder | null, patch: Record<string, any>): Promise<Partial<OtgruzkaOrderAtr>> {
    if (o && o.source === 'sheet' && !o.sheet_removed) {
      const set = this.toSheet(patch);
      if (Object.keys(set).length) await this.callScript([{ op: 'update', key: this.sheetKeyOf(o), set }]);
      return {};
    }
    const full = { ...(o ? o.get({ plain: true }) : {}), ...patch } as Record<string, any>;
    const set = this.toSheet(Object.fromEntries(Object.keys(SHEET_FIELDS).map((k) => [k, full[k]])));
    if (!full.final_status) delete set.status; // jadval formulasi o'zi hisoblaydi
    const res = await this.callScript([{ op: 'append', set }]);
    return {
      source: 'sheet',
      sheet_removed: false,
      sheet_row: res.results?.[0]?.row ?? null,
      sheet_key: await this.freeKey({ ...full, id: o?.id }),
    };
  }

  // Parser beradigan kalit bilan bir xil: raqam|kompaniya, band bo'lsa #2, #3…
  private async freeKey(o: { dogovor_number?: string | null; client_name?: string | null; id?: number }) {
    const base = `${o.dogovor_number || '-'}|${companyKey(o.client_name)}`;
    const rows = await this.orderRepo.findAll({
      where: { sheet_key: { [Op.or]: [base, { [Op.like]: `${base}#%` }] } },
      attributes: ['id', 'sheet_key'],
    });
    const taken = new Set(rows.filter((x) => x.id !== o.id).map((x) => x.sheet_key));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}#${n}`)) return `${base}#${n}`;
  }

  // Jadvalga yozish + bazaga saqlash bitta navbatda: sinxron o'rtaga tushmaydi;
  // jadvalga yozilmasa bazaga ham saqlanmaydi (ikki tomon farq qilib qolmasin).
  private async withSheet<T>(mode: 'live' | 'sync', push: () => Promise<Partial<OtgruzkaOrderAtr>>, save: (extra: Partial<OtgruzkaOrderAtr>) => Promise<T>) {
    if (mode === 'live') return save({});
    return this.exclusive(async () => {
      const extra = await push();
      return save({ ...extra, erp_written_at: new Date() });
    });
  }

  private async assertLive() {
    if ((await this.getMode()) !== 'live') {
      throw otError(
        BadRequestException,
        'OT_MIRROR_MODE',
        "Hozir Google Sheets asosiy manba — bu ma'lumot jadvalda o'zgartiriladi va ERP'ga avtomatik tushadi",
      );
    }
  }

  // ─── Google Sheets sinxroni ─────────────────────────────────────────
  private async fetchCsv(gid: string): Promise<string> {
    const url = CSV_URL_TEMPLATE
      ? CSV_URL_TEMPLATE.replace('{gid}', gid)
      : `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    if (!res.ok || /^\s*<!doctype html/i.test(text)) {
      throw otError(
        BadRequestException,
        'OT_SHEET_UNREADABLE',
        `Google Sheets varag'ini o'qib bo'lmadi (HTTP ${res.status}). Jadval havola orqali ochiqligini tekshiring.`,
        { status: res.status },
      );
    }
    return text;
  }

  // Bir vaqtda faqat bitta sinxron (avto va qo'lda bosilgani ustma-ust tushmasin)
  async sync(userId: number | null) {
    if ((await this.getMode()) === 'live') {
      throw otError(
        BadRequestException,
        'OT_LIVE_MODE',
        "ERP asosiy rejimda — Google Sheets sinxroni o'chirilgan",
      );
    }
    if (this.syncing) return this.syncing;
    this.syncing = this.exclusive(() => this.doSync(userId)).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async doSync(userId: number | null) {
    const started = Date.now();
    let result: Record<string, any>;
    try {
      const [mainCsv, linesCsv] = await Promise.all([this.fetchCsv(MAIN_GID), this.fetchCsv(LINES_GID)]);
      const main = parseMainSheet(mainCsv);
      const lines = parseLinesSheet(linesCsv);
      result = await this.sequelize.transaction((t) => this.applySheet(main.rows, lines, userId, t));
      result.skipped = main.skipped;
      result.ok = true;
    } catch (e: any) {
      this.logger.warn(`Otgruzka sync failed: ${e?.message}`);
      const body = e?.getResponse?.() ?? {};
      result = {
        ok: false,
        code: e instanceof SheetFormatError ? e.code : body.code || 'OT_SYNC_FAILED',
        params: (e instanceof SheetFormatError ? e.params : body.params) || null,
        error: body.message || e?.message || 'Xatolik',
      };
    }
    result.ms = Date.now() - started;
    result.at = new Date().toISOString();
    result.by = userId;
    await this.settingRepo.upsert({ key: 'last_sync', value: result });
    if (!result.ok) {
      throw new BadRequestException({ message: result.error, code: result.code, params: result.params });
    }
    return result;
  }

  private async applySheet(
    rows: ParsedOrderRow[],
    lines: ReturnType<typeof parseLinesSheet>,
    userId: number | null,
    transaction: Transaction,
  ) {
    const existing = await this.orderRepo.findAll({ where: { source: 'sheet' }, transaction });
    const byKey = new Map(existing.map((o) => [o.sheet_key, o]));
    const firstImport = existing.length === 0;
    const now = new Date();
    const today = todayStr();
    const stats = { created: 0, updated: 0, unchanged: 0, removed: 0, restored: 0, payments: 0, changes: 0, lines: lines.length };

    // Kalit o'zgargan qatorlarni (raqam yoki kompaniya nomi tuzatilgan) yo'qotmaslik uchun:
    // kalit bo'yicha topilmaganlar avval raqam, keyin kompaniya, keyin qator o'rni bo'yicha bog'lanadi
    const matched = new Set<number>();
    const pairs: Array<[ParsedOrderRow, OtgruzkaOrder | undefined]> = rows.map((r) => {
      const o = byKey.get(r.key);
      if (o) matched.add(o.id);
      return [r, o];
    });
    for (const pair of pairs) {
      if (pair[1]) continue;
      const r = pair[0];
      const free = existing.filter((o) => !matched.has(o.id));
      const hit =
        (r.dogovor_number && free.find((o) => o.dogovor_number === r.dogovor_number && companyKey(o.client_name) === companyKey(r.client_name))) ||
        (r.dogovor_number && free.find((o) => o.dogovor_number === r.dogovor_number && o.sheet_row === r.row)) ||
        free.find((o) => companyKey(o.client_name) === companyKey(r.client_name) && o.sheet_row === r.row);
      if (hit) {
        matched.add(hit.id);
        pair[1] = hit;
      }
    }

    const notes: Array<Record<string, any>> = [];
    const payments: Array<Record<string, any>> = [];

    for (const [r, found] of pairs) {
      const fields: OtgruzkaOrderAtr = {
        sheet_key: r.key,
        sheet_row: r.row,
        sheet_removed: false,
        source: 'sheet',
        series: r.series,
        dogovor_number: r.dogovor_number,
        dogovor_date: r.dogovor_date,
        client_name: r.client_name,
        client_inn: r.client_inn,
        client_contact: r.client_contact,
        client_phone: r.client_phone,
        manager_name: r.manager_name,
        contract_sum: r.contract_sum,
        ready_pct: r.ready_pct,
        shipped_pct: r.shipped_pct,
        didox_contract: r.didox_contract,
        didox_poa: r.didox_poa,
        invoice_numbers: r.invoice_numbers,
        sheet_status: r.sheet_status,
        final_status: r.final_status,
        note_main: r.note_main,
        note_extra: r.note_extra,
        sgp_date: r.sgp_date,
      };

      if (!found) {
        const o = await this.orderRepo.create(
          {
            ...fields,
            paid_sum: r.paid_sum,
            ready_at: r.ready_pct >= 1 && !firstImport ? now : null,
            shipped_at: r.shipped_pct >= 1 && !firstImport ? now : null,
            paid_at: r.contract_sum > 0 && r.paid_sum >= r.contract_sum - EPS && !firstImport ? now : null,
          },
          { transaction },
        );
        stats.created++;
        if (Math.abs(r.paid_sum) > EPS) {
          payments.push({ order_id: o.id, amount: r.paid_sum, pay_date: firstImport ? (r.dogovor_date || today) : today, comment: 'sys:opening', source: 'sheet', created_by: userId });
        }
        if (r.note_main) notes.push({ order_id: o.id, kind: 'note', text: r.note_main, data: { field: 'note_main', import: true }, source: 'sheet', created_by: userId });
        if (r.note_extra) notes.push({ order_id: o.id, kind: 'note', text: r.note_extra, data: { field: 'note_extra', import: true }, source: 'sheet', created_by: userId });
        continue;
      }

      const o = found;
      if (o.sheet_removed) stats.restored++;
      // ERP yaqinda shu qatorni jadvalga yozgan — eski CSV uni qaytarib yubormasin
      if (o.erp_written_at && now.getTime() - new Date(o.erp_written_at).getTime() < WRITE_GUARD_MS) {
        const keep: Partial<OtgruzkaOrderAtr> = {};
        if (o.sheet_row !== r.row) keep.sheet_row = r.row;
        if (o.sheet_removed) keep.sheet_removed = false;
        if (Object.keys(keep).length) await o.update(keep, { transaction });
        stats.unchanged++;
        continue;
      }
      const patch: Partial<OtgruzkaOrderAtr> = {};
      for (const [k, v] of Object.entries(fields) as Array<[keyof OtgruzkaOrderAtr, any]>) {
        if (!same((o as any)[k], v)) (patch as any)[k] = v;
      }
      for (const k of TRACKED) {
        if (k in patch) {
          notes.push({ order_id: o.id, kind: 'change', data: { field: k, from: (o as any)[k] ?? null, to: (patch as any)[k] ?? null }, source: 'sheet', created_by: userId });
          stats.changes++;
        }
      }
      for (const k of ['note_main', 'note_extra'] as const) {
        if (k in patch && patch[k]) notes.push({ order_id: o.id, kind: 'note', text: patch[k], data: { field: k }, source: 'sheet', created_by: userId });
      }
      // Holatga yetgan vaqtlar
      if ((patch.ready_pct ?? 0) >= 1 && o.ready_pct < 1) patch.ready_at = now;
      if ((patch.shipped_pct ?? 0) >= 1 && o.shipped_pct < 1) patch.shipped_at = now;

      // To'lov: varaqdagi jami bilan jurnal yig'indisi farqi — bugungi sana bilan yoziladi
      const diff = r2(r.paid_sum - o.paid_sum);
      if (Math.abs(diff) > EPS) {
        payments.push({ order_id: o.id, amount: diff, pay_date: today, comment: 'sys:sheet_diff', source: 'sheet', created_by: userId });
        patch.paid_sum = r.paid_sum;
        const contract = patch.contract_sum ?? o.contract_sum;
        if (contract > 0 && r.paid_sum >= contract - EPS && !(contract > 0 && o.paid_sum >= contract - EPS)) patch.paid_at = now;
      }

      if (Object.keys(patch).length) {
        await o.update(patch, { transaction });
        stats.updated++;
      } else stats.unchanged++;
    }

    // Varaqdan o'chirilgan qatorlar — ERP'da tarix uchun qoladi, belgilanadi
    const gone = existing.filter((o) => !matched.has(o.id) && !o.sheet_removed);
    if (gone.length) {
      await this.orderRepo.update({ sheet_removed: true }, { where: { id: gone.map((o) => o.id) }, transaction });
      stats.removed = gone.length;
    }

    if (payments.length) {
      await this.paymentRepo.bulkCreate(payments as any, { transaction });
      stats.payments = payments.length;
    }
    if (notes.length) await this.noteRepo.bulkCreate(notes as any, { transaction });

    // Лист1 — to'liq almashtiriladi, shartnomaga raqam bo'yicha bog'lanadi
    const all = await this.orderRepo.findAll({ where: { sheet_removed: false }, attributes: ['id', 'dogovor_number'], transaction });
    const byNumber = new Map<string, number>();
    for (const o of all) if (o.dogovor_number && !byNumber.has(o.dogovor_number)) byNumber.set(o.dogovor_number, o.id);
    await this.lineRepo.destroy({ where: {}, transaction });
    if (lines.length) {
      await this.lineRepo.bulkCreate(
        lines.map((l) => ({
          row_no: l.row,
          order_id: l.dogovor_label ? byNumber.get(l.dogovor_label) ?? null : null,
          dogovor_label: l.dogovor_label,
          client_label: l.client_label,
          item_name: l.item_name,
          qty_contract: l.qty_contract,
          qty_in: l.qty_in,
          qty_out: l.qty_out,
          note: l.note,
        })),
        { transaction },
      );
    }

    await this.linkDogovors(transaction);
    return stats;
  }

  // ERP'dagi "Dogovorlar" bilan bog'lash: raqam bir xil + (INN yoki kompaniya nomi mos),
  // aks holda sanasi eng yaqini. Raqamlar har yili qaytadan boshlanadi — faqat raqam yetmaydi.
  private async linkDogovors(transaction?: Transaction) {
    const orders = await this.orderRepo.findAll({ where: { dogovor_id: null }, transaction });
    const nums = [...new Set(orders.map((o) => Number(o.dogovor_number)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!nums.length) return 0;
    const dogs = await this.dogovorRepo.findAll({
      where: { dogovor_number: { [Op.in]: nums } },
      attributes: ['id', 'dogovor_number', 'dogovor_date', 'client_name', 'client_inn'],
      transaction,
    });
    const byNum = new Map<number, Dogovor[]>();
    for (const d of dogs) {
      const list = byNum.get(Number(d.dogovor_number)) || [];
      list.push(d);
      byNum.set(Number(d.dogovor_number), list);
    }
    let linked = 0;
    for (const o of orders) {
      const cands = byNum.get(Number(o.dogovor_number));
      if (!cands?.length) continue;
      const ck = companyKey(o.client_name);
      const score = (d: Dogovor) => {
        let s = 0;
        if (o.client_inn && d.client_inn && String(d.client_inn).replace(/\D/g, '') === o.client_inn) s += 100;
        const dk = companyKey(d.client_name);
        if (ck && dk && (dk === ck || dk.includes(ck) || ck.includes(dk))) s += 50;
        if (o.dogovor_date && d.dogovor_date) {
          const days = Math.abs(new Date(o.dogovor_date).getTime() - new Date(d.dogovor_date).getTime()) / 86400000;
          s += Math.max(0, 30 - days);
        } else {
          s += new Date(d.dogovor_date).getFullYear() === new Date().getFullYear() ? 10 : 0;
        }
        return s;
      };
      const best = cands.map((d) => ({ d, s: score(d) })).sort((a, b) => b.s - a.s)[0];
      // Mijoz bo'yicha hech qanday moslik bo'lmasa bog'lanmaydi (xato raqam ehtimoli)
      if (best && best.s >= 50) {
        await o.update({ dogovor_id: best.d.id }, { transaction });
        linked++;
      }
    }
    return linked;
  }

  // ─── O'qish ─────────────────────────────────────────────────────────
  private view(o: OtgruzkaOrder) {
    const json = o.toJSON() as any;
    return {
      ...json,
      official: isOfficial(o.series),
      pay_status: payStatusOf(o),
      debt: r2(Math.max(0, (o.contract_sum || 0) - (o.paid_sum || 0))),
      stage: stageOf(o),
      alerts: alertsOf(o),
    };
  }

  async list(includeRemoved = false) {
    const orders = await this.orderRepo.findAll({
      where: includeRemoved ? {} : { sheet_removed: false },
      include: [{ model: Dogovor, as: 'dogovor', attributes: ['id', 'dogovor_number', 'dogovor_date'] }],
      order: [['sheet_row', 'ASC NULLS LAST'], ['id', 'ASC']],
    });
    const counts = (await this.lineRepo.findAll({
      attributes: ['order_id', [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'n']],
      where: { order_id: { [Op.ne]: null } },
      group: ['order_id'],
      raw: true,
    })) as unknown as Array<{ order_id: number; n: string }>;
    const lineCount = new Map(counts.map((c) => [c.order_id, Number(c.n)]));
    return orders.map((o) => ({ ...this.view(o), lines_count: lineCount.get(o.id) || 0 }));
  }

  async stats() {
    const rows = await this.list();
    const active = rows.filter((r) => !r.final_status);
    const sum = (list: any[], f: (r: any) => number) => r2(list.reduce((a, r) => a + (f(r) || 0), 0));
    const managers = new Map<string, any>();
    for (const r of rows) {
      const name = r.manager_name || '—';
      const m = managers.get(name) || { manager: name, count: 0, contract_sum: 0, paid_sum: 0, debt: 0, open: 0, open_sum: 0, done: 0, done_sum: 0 };
      if (r.final_status) continue;
      m.count++;
      m.contract_sum += r.contract_sum;
      m.paid_sum += r.paid_sum;
      m.debt += r.debt;
      if (r.stage === 'done') {
        m.done++;
        m.done_sum += r.contract_sum;
      } else {
        m.open++;
        m.open_sum += r.contract_sum;
      }
      managers.set(name, m);
    }
    const countBy = (key: string) => {
      const map: Record<string, { count: number; sum: number }> = {};
      for (const r of rows) {
        const k = String(r[key]);
        map[k] = map[k] || { count: 0, sum: 0 };
        map[k].count++;
        map[k].sum = r2(map[k].sum + r.contract_sum);
      }
      return map;
    };
    const alerts: Record<string, number> = {};
    for (const r of rows) for (const a of r.alerts) alerts[a] = (alerts[a] || 0) + 1;
    return {
      total: rows.length,
      active: active.length,
      contract_sum: sum(active, (r) => r.contract_sum),
      paid_sum: sum(active, (r) => r.paid_sum),
      debt: sum(active, (r) => r.debt),
      shipped_value: sum(active, (r) => r.contract_sum * Math.min(1, r.shipped_pct)),
      by_stage: countBy('stage'),
      by_pay: countBy('pay_status'),
      by_series: countBy('series'),
      alerts,
      managers: [...managers.values()]
        .map((m) => ({ ...m, contract_sum: r2(m.contract_sum), paid_sum: r2(m.paid_sum), debt: r2(m.debt), open_sum: r2(m.open_sum), done_sum: r2(m.done_sum) }))
        .sort((a, b) => b.open_sum - a.open_sum),
    };
  }

  private async findOrder(id: number) {
    const o = await this.orderRepo.findByPk(id);
    if (!o) throw otError(NotFoundException, 'OT_NOT_FOUND', 'Yozuv topilmadi');
    return o;
  }

  async detail(id: number) {
    const o = await this.orderRepo.findByPk(id, {
      include: [{ model: Dogovor, as: 'dogovor', attributes: ['id', 'dogovor_number', 'dogovor_date', 'client_name', 'dogovor_sum', 'dogovor_status'] }],
    });
    if (!o) throw otError(NotFoundException, 'OT_NOT_FOUND', 'Yozuv topilmadi');
    const creator = { model: User, as: 'creator', attributes: ['id', 'firstname', 'lastname', 'username'] };
    const [payments, notes, lines] = await Promise.all([
      this.paymentRepo.findAll({ where: { order_id: id }, include: [creator], order: [['pay_date', 'ASC'], ['id', 'ASC']] }),
      this.noteRepo.findAll({ where: { order_id: id }, include: [creator], order: [['createdAt', 'DESC'], ['id', 'DESC']] }),
      this.lineRepo.findAll({ where: { order_id: id }, order: [['row_no', 'ASC']] }),
    ]);
    return { ...this.view(o), payments, notes, lines };
  }

  async lines() {
    return this.lineRepo.findAll({
      include: [{ model: OtgruzkaOrder, as: 'order', attributes: ['id', 'dogovor_number', 'client_name', 'manager_name'] }],
      order: [['row_no', 'ASC']],
    });
  }

  // ─── O'zgartirish ───────────────────────────────────────────────────
  async create(dto: CreateOrderDto, payload: AuthPayload) {
    const mode = await this.editMode();
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(dto)) if (v !== undefined) fields[k] = typeof v === 'string' ? v.trim() || null : v;
    const base = {
      ...fields,
      source: 'erp' as const,
      series: seriesOf(fields.dogovor_number),
      paid_sum: 0,
      // Jadval formulasi chiqaradigan holat — keyingi sinxron buni "o'zgarish" deb yozmasin
      sheet_status: fields.final_status ? FINAL_TEXT[fields.final_status] : formulaStatus(fields.shipped_pct ?? 0),
      created_by: payload.user_id,
    } as OtgruzkaOrderAtr;
    const o = await this.withSheet(
      mode,
      () => this.pushOrder(null, base),
      (extra) => this.orderRepo.create({ ...base, ...extra }),
    );
    await this.linkDogovors();
    return this.detail(o.id);
  }

  async update(id: number, dto: UpdateOrderDto, payload: AuthPayload) {
    const o = await this.findOrder(id);
    const keys = Object.keys(dto).filter((k) => (dto as any)[k] !== undefined);
    const free = ['next_action', 'next_action_date'];
    // Faqat ERP'dagi maydonlar (keyingi qadam) — jadvalga tegmaydi, har rejimda mumkin
    const mode = keys.some((k) => !free.includes(k)) ? await this.editMode() : 'live';
    if (dto.final_status && !(dto.final_reason ?? o.final_reason)?.trim()) {
      throw otError(BadRequestException, 'OT_REASON_REQUIRED', 'Yakuniy holat uchun sababini yozing');
    }
    const patch: Record<string, any> = {};
    for (const k of keys) {
      const v = (dto as any)[k];
      patch[k] = typeof v === 'string' ? v.trim() || null : v;
    }
    if (patch.dogovor_number) patch.series = seriesOf(patch.dogovor_number);
    const now = new Date();
    if (patch.ready_pct >= 1 && o.ready_pct < 1) patch.ready_at = now;
    if (patch.shipped_pct >= 1 && o.shipped_pct < 1) patch.shipped_at = now;
    // Jadvaldagi "Статус товаров" matni ham shunga mos (keyingi sinxron farq ko'rmasin)
    if ('final_status' in patch || 'shipped_pct' in patch) {
      const fin = 'final_status' in patch ? patch.final_status : o.final_status;
      patch.sheet_status = fin ? FINAL_TEXT[fin] : formulaStatus(patch.shipped_pct ?? o.shipped_pct);
    }
    // Raqam yoki kompaniya o'zgarsa — jadval qatori kaliti ham yangilanadi
    if (o.source === 'sheet' && ('dogovor_number' in patch || 'client_name' in patch)) {
      patch.sheet_key = await this.freeKey({
        id: o.id,
        dogovor_number: patch.dogovor_number ?? o.dogovor_number,
        client_name: patch.client_name ?? o.client_name,
      });
    }
    const changes = TRACKED.filter((k) => k in patch && !same((o as any)[k], patch[k])).map((k) => ({
      order_id: o.id,
      kind: 'change' as const,
      data: { field: k, from: (o as any)[k] ?? null, to: patch[k] ?? null },
      source: 'erp' as const,
      created_by: payload.user_id,
    }));
    const sheetPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => k in SHEET_FIELDS));
    await this.withSheet(
      Object.keys(sheetPatch).length ? mode : 'live',
      () => this.pushOrder(o, sheetPatch),
      (extra) =>
        this.sequelize.transaction(async (transaction) => {
          await o.update({ ...patch, ...extra }, { transaction });
          if (changes.length) await this.noteRepo.bulkCreate(changes, { transaction });
        }),
    );
    if ('dogovor_number' in patch || 'client_inn' in patch) {
      await o.update({ dogovor_id: null });
      await this.linkDogovors();
    }
    return this.detail(o.id);
  }

  private async recalcPaid(orderId: number, transaction?: Transaction) {
    const o = await this.orderRepo.findByPk(orderId, { transaction });
    if (!o) return;
    const total = r2(Number((await this.paymentRepo.sum('amount', { where: { order_id: orderId }, transaction })) || 0));
    const wasPaid = o.contract_sum > 0 && o.paid_sum >= o.contract_sum - EPS;
    const isPaid = o.contract_sum > 0 && total >= o.contract_sum - EPS;
    await o.update({ paid_sum: total, ...(isPaid && !wasPaid ? { paid_at: new Date() } : {}) }, { transaction });
  }

  // To'lov o'zgarganda jadvaldagi "оплаченная сумма" yangi jami bilan yoziladi
  private async paidTotalAfter(orderId: number, delta: number) {
    const cur = Number((await this.paymentRepo.sum('amount', { where: { order_id: orderId } })) || 0);
    return r2(cur + delta);
  }

  async addPayment(orderId: number, dto: CreatePaymentDto, payload: AuthPayload) {
    const mode = await this.editMode();
    const o = await this.findOrder(orderId);
    if (!dto.amount) throw otError(BadRequestException, 'OT_AMOUNT_ZERO', "Summa 0 bo'lmasligi kerak");
    await this.withSheet(
      mode,
      async () => this.pushOrder(o, { paid_sum: await this.paidTotalAfter(orderId, dto.amount) }),
      (extra) =>
        this.sequelize.transaction(async (transaction) => {
          await this.paymentRepo.create(
            { order_id: orderId, amount: dto.amount, pay_date: dto.pay_date, comment: dto.comment?.trim() || null, source: 'erp', created_by: payload.user_id },
            { transaction },
          );
          if (Object.keys(extra).length) await o.update(extra, { transaction });
          await this.recalcPaid(orderId, transaction);
        }),
    );
    return this.detail(orderId);
  }

  // Sana va izohni har doim to'g'rilash mumkin (avtomatik yozuvga haqiqiy sanani qo'yish uchun).
  // Summa — faqat tahrirlash mumkin bo'lgan rejimda (jadvalga ham yoziladi).
  async updatePayment(id: number, dto: UpdatePaymentDto, payload: AuthPayload) {
    const p = await this.paymentRepo.findByPk(id);
    if (!p) throw otError(NotFoundException, 'OT_PAYMENT_NOT_FOUND', "To'lov topilmadi");
    const amountChanged = dto.amount !== undefined && dto.amount !== p.amount;
    let mode: 'live' | 'sync' = 'live';
    if (amountChanged) {
      mode = await this.editMode();
      if (!dto.amount) throw otError(BadRequestException, 'OT_AMOUNT_ZERO', "Summa 0 bo'lmasligi kerak");
    }
    const o = await this.findOrder(p.order_id);
    await this.withSheet(
      mode,
      async () => this.pushOrder(o, { paid_sum: await this.paidTotalAfter(p.order_id, (dto.amount ?? p.amount) - p.amount) }),
      (extra) =>
        this.sequelize.transaction(async (transaction) => {
          await this.noteRepo.create(
            { order_id: p.order_id, kind: 'change', data: { field: 'payment', payment_id: p.id, pay_date: p.pay_date, amount: p.amount }, source: 'erp', created_by: payload.user_id },
            { transaction },
          );
          await p.update(
            {
              ...(amountChanged ? { amount: dto.amount } : {}),
              ...(dto.pay_date ? { pay_date: dto.pay_date } : {}),
              ...(dto.comment !== undefined ? { comment: dto.comment?.trim() || null } : {}),
            },
            { transaction },
          );
          if (Object.keys(extra).length) await o.update(extra, { transaction });
          await this.recalcPaid(p.order_id, transaction);
        }),
    );
    return this.detail(p.order_id);
  }

  async removePayment(id: number) {
    const mode = await this.editMode();
    const p = await this.paymentRepo.findByPk(id);
    if (!p) throw otError(NotFoundException, 'OT_PAYMENT_NOT_FOUND', "To'lov topilmadi");
    if (p.source === 'sheet') {
      throw otError(ConflictException, 'OT_PAYMENT_FROM_SHEET', "Jadvaldan kelgan to'lovni o'chirib bo'lmaydi — tuzatish (manfiy) to'lov kiriting");
    }
    const o = await this.findOrder(p.order_id);
    await this.withSheet(
      mode,
      async () => this.pushOrder(o, { paid_sum: await this.paidTotalAfter(p.order_id, -p.amount) }),
      (extra) =>
        this.sequelize.transaction(async (transaction) => {
          await p.destroy({ transaction });
          if (Object.keys(extra).length) await o.update(extra, { transaction });
          await this.recalcPaid(p.order_id, transaction);
        }),
    );
    return this.detail(p.order_id);
  }

  // Ikki tomonlama rejimda izoh jadvaldagi izoh ustuniga (S) ham yoziladi — Ilyosov jadvalda ko'radi
  async addNote(orderId: number, dto: CreateNoteDto, payload: AuthPayload) {
    const o = await this.findOrder(orderId);
    const text = dto.text.trim();
    const settings = await this.getSettings();
    const mode = settings.two_way && o.source === 'sheet' && !o.sheet_removed ? 'sync' : 'live';
    await this.withSheet(
      mode,
      () => this.pushOrder(o, { note_main: text }),
      (extra) =>
        this.sequelize.transaction(async (transaction) => {
          await this.noteRepo.create({ order_id: orderId, kind: dto.kind, text, source: 'erp', created_by: payload.user_id }, { transaction });
          if (mode === 'sync') await o.update({ note_main: text, ...extra }, { transaction });
        }),
    );
    return this.detail(orderId);
  }

  async removeNote(id: number, payload: AuthPayload) {
    const n = await this.noteRepo.findByPk(id);
    if (!n) throw otError(NotFoundException, 'OT_NOTE_NOT_FOUND', 'Izoh topilmadi');
    if (n.kind === 'change' || n.source === 'sheet') {
      throw otError(ForbiddenException, 'OT_NOTE_SYSTEM', "Avtomatik yozuvni o'chirib bo'lmaydi");
    }
    if (!(await this.isAdmin(payload))) {
      if (n.created_by !== payload.user_id) throw otError(ForbiddenException, 'OT_NOT_OWNER', "Faqat yozgan xodim yoki admin o'chira oladi");
      if (Date.now() - new Date(n.createdAt).getTime() > EDIT_WINDOW_MS) {
        throw otError(ForbiddenException, 'OT_EDIT_WINDOW', "2 kundan oshgan izohni faqat admin o'chira oladi");
      }
    }
    const orderId = n.order_id;
    await n.destroy();
    return this.detail(orderId);
  }
}
