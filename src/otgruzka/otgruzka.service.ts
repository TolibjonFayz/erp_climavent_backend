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
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { SheetFormatError } from 'src/sklad/sheet-parser';
import { SkladService } from 'src/sklad/sklad.service';
import { R2Service } from 'src/storage/r2.service';
import {
  CreateNoteDto,
  CreateOrderDto,
  CreatePaymentDto,
  DidoxFileDto,
  UpdateOrderDto,
  UpdatePaymentDto,
} from './dto/otgruzka.dto';
import { OtgruzkaDidoxFile } from './models/otgruzka-didox-file.model';
import { OtgruzkaLine } from './models/otgruzka-line.model';
import { OtgruzkaNote } from './models/otgruzka-note.model';
import { OtgruzkaItem, OtgruzkaOrder, OtgruzkaOrderAtr } from './models/otgruzka-order.model';
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
// Mahsulot qatorlari bir xil ko'rinishda (shartnoma va karta solishtirilganda farq faqat yozilishda bo'lmasin)
const normItems = (list: Array<{ name?: string; unit?: string | null; qty?: number; price?: number }> | null | undefined): OtgruzkaItem[] =>
  (list || [])
    .filter((i) => i && String(i.name || '').trim())
    .map((i) => ({ name: String(i.name).trim(), unit: i.unit ? String(i.unit).trim() : null, qty: Number(i.qty) || 0, price: Number(i.price) || 0 }));

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
    @InjectModel(OtgruzkaDidoxFile) private readonly didoxRepo: typeof OtgruzkaDidoxFile,
    private readonly sequelize: Sequelize,
    private readonly sklad: SkladService,
    private readonly r2: R2Service,
  ) {}

  // Mirror rejimda jadval har 5 daqiqada avtomatik o'qiladi (OTGRUZKA_SYNC_ENABLED=false — o'chiq)
  async onApplicationBootstrap() {
    // sequelize sync mavjud jadvalga yangi ustun qo'shmaydi
    try {
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS erp_written_at TIMESTAMPTZ`);
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS items JSONB`);
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS sklad_check VARCHAR(16)`);
      await this.sequelize.query(`ALTER TABLE otgruzka_didox_files ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'invoice'`);
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS sklad_requested_at TIMESTAMPTZ`);
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS sklad_checked_at TIMESTAMPTZ`);
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS sklad_checked_by INTEGER`);
      await this.sequelize.query(`ALTER TABLE otgruzka_orders ADD COLUMN IF NOT EXISTS sklad_check_note TEXT`);
    } catch (e: any) {
      this.logger.error(`otgruzka_orders ustuni qo'shilmadi: ${e?.message}`);
    }
    this.backfillDogovorPayments().catch((e) => this.logger.warn(`Shartnoma to'lovlari ko'chirilmadi: ${e?.message}`));
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

  // Karta uchun tahrirlash rejimi: jadvalda qatori yo'q (ERP'da ochilgan) karta skript
  // ulanmagan bo'lsa ham ERP'da tahrirlanadi — jadval uni qaytarib yozmaydi.
  private async editModeFor(o: OtgruzkaOrder): Promise<'live' | 'sync'> {
    try {
      return await this.editMode();
    } catch (e) {
      if (o.source !== 'sheet' || o.sheet_removed) return 'live';
      throw e;
    }
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
      // Oxirgi kiritilgan karta tepada; jadvaldan bir vaqtda kelganlar — pastdagi qator tepada
      order: [['createdAt', 'DESC'], ['sheet_row', 'DESC NULLS FIRST'], ['id', 'DESC']],
    });
    const counts = (await this.lineRepo.findAll({
      attributes: ['order_id', [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'n']],
      where: { order_id: { [Op.ne]: null } },
      group: ['order_id'],
      raw: true,
    })) as unknown as Array<{ order_id: number; n: string }>;
    const lineCount = new Map(counts.map((c) => [c.order_id, Number(c.n)]));
    // Schyot-faktura soni va summasi + ishonchnomalar soni (summa faqat schyot-fakturalardan)
    const didox = (await this.didoxRepo.findAll({
      attributes: [
        'order_id',
        [this.sequelize.literal(`COUNT(*) FILTER (WHERE kind <> 'poa')`), 'n'],
        [this.sequelize.literal(`COUNT(*) FILTER (WHERE kind = 'poa')`), 'poa'],
        [this.sequelize.literal(`COALESCE(SUM(amount) FILTER (WHERE kind <> 'poa'), 0)`), 'sum'],
      ],
      group: ['order_id'],
      raw: true,
    })) as unknown as Array<{ order_id: number; n: string; poa: string; sum: string }>;
    const didoxBy = new Map(didox.map((d) => [d.order_id, { n: Number(d.n), poa: Number(d.poa), sum: r2(Number(d.sum) || 0) }]));
    return orders.map((o) => ({
      ...this.view(o),
      lines_count: lineCount.get(o.id) || 0,
      didox_files_count: didoxBy.get(o.id)?.n || 0,
      didox_files_sum: didoxBy.get(o.id)?.sum || 0,
      didox_poa_count: didoxBy.get(o.id)?.poa || 0,
    }));
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
      include: [{ model: Dogovor, as: 'dogovor', attributes: ['id', 'dogovor_number', 'dogovor_date', 'client_name', 'dogovor_sum', 'dogovor_status', 'items'] }],
    });
    if (!o) throw otError(NotFoundException, 'OT_NOT_FOUND', 'Yozuv topilmadi');
    const creator = { model: User, as: 'creator', attributes: ['id', 'firstname', 'lastname', 'username'] };
    const [payments, notes, lines, didox_files] = await Promise.all([
      this.paymentRepo.findAll({ where: { order_id: id }, include: [creator], order: [['pay_date', 'ASC'], ['id', 'ASC']] }),
      this.noteRepo.findAll({ where: { order_id: id }, include: [creator], order: [['createdAt', 'DESC'], ['id', 'DESC']] }),
      this.lineRepo.findAll({ where: { order_id: id }, order: [['row_no', 'ASC']] }),
      this.didoxRepo.findAll({
        where: { order_id: id },
        include: [{ model: User, as: 'uploader', attributes: ['id', 'firstname', 'lastname', 'username'] }],
        order: [['invoice_date', 'ASC NULLS LAST'], ['id', 'ASC']],
      }),
    ]);
    // Kartada mahsulot yo'q bo'lsa — bog'langan ERP shartnomasidagilar ko'rsatiladi
    const items = this.itemsOf(o as any);
    const view = this.view(o);
    // toJSON ichki modelning o'z dataValues'ini qaytaradi — nusxasiz o'chirish modelni buzadi
    if (view.dogovor) {
      const { items: _skip, ...dog } = view.dogovor;
      view.dogovor = dog;
    }
    const invoices = didox_files.filter((f) => f.kind !== 'poa');
    const didox_files_sum = r2(invoices.reduce((a, f) => a + (Number(f.amount) || 0), 0));
    return {
      ...view,
      items,
      items_from_dogovor: !o.items?.length && items.length > 0,
      payments,
      notes,
      lines,
      didox_files,
      didox_files_count: invoices.length,
      didox_files_sum,
      didox_poa_count: didox_files.length - invoices.length,
      storage_ready: this.r2.isConfigured,
    };
  }

  async lines() {
    return this.lineRepo.findAll({
      include: [{ model: OtgruzkaOrder, as: 'order', attributes: ['id', 'dogovor_number', 'client_name', 'manager_name'] }],
      order: [['row_no', 'ASC']],
    });
  }

  /** Menejerlar ro'yxati (tanlash uchun): kartalar va ERP shartnomalaridagi ismlar, ko'p uchraganlari tepada */
  async managers() {
    const rows = await this.sequelize.query<{ name: string; n: number }>(
      `SELECT name, COUNT(*)::int AS n FROM (
         SELECT TRIM(manager_name) AS name FROM otgruzka_orders WHERE manager_name IS NOT NULL
         UNION ALL
         SELECT TRIM(manager_name) FROM dogovor WHERE manager_name IS NOT NULL AND dogovor_date >= NOW() - INTERVAL '2 years'
       ) t WHERE name <> '' GROUP BY name ORDER BY n DESC, name`,
      { type: QueryTypes.SELECT },
    );
    // "Ilyosov M." va "Ilyosov M" kabi yozilish farqlari bitta bo'lib ko'rinsin
    const seen = new Map<string, string>();
    for (const r of rows) {
      const k = r.name.toLowerCase().replace(/[.\s]+/g, ' ').trim();
      if (!seen.has(k)) seen.set(k, r.name);
    }
    return [...seen.values()];
  }

  // ─── Mahsulotlar va ombordagi tayyorlik ────────────────────────────
  private itemsOf(o: OtgruzkaOrder & { dogovor?: Dogovor | null }) {
    if (o.items?.length) return o.items;
    return (o.dogovor?.items || []).filter((i) => i?.name);
  }

  // Har mahsulot uchun: shartnoma bo'yicha omborga kelgani (reserved) + umumiy bo'sh qoldiq → tayyor soni
  private async readinessOf(list: Array<{ order: OtgruzkaOrder; items: Array<{ name: string; qty: number }> }>) {
    const queries = list.flatMap(({ order, items }) => items.map((i) => ({ name: i.name, dogovor_number: order.dogovor_number })));
    const found = queries.length ? await this.sklad.stockFor(queries) : [];
    let k = 0;
    return list.map(({ items }) => {
      const rows = items.map((i) => {
        const st = found[k++];
        const qty = Number(i.qty) || 0;
        const avail = st.reserved + Math.max(0, st.balance ?? 0);
        const ready = Math.min(qty, avail);
        const status = !st.item && !st.reserved ? 'unknown' : ready >= qty && qty > 0 ? 'ready' : ready > 0 ? 'partial' : 'none';
        return { ...st, qty, ready: Math.round(ready * 1000) / 1000, status };
      });
      const total = rows.reduce((s, r) => s + r.qty, 0);
      const ready = rows.reduce((s, r) => s + r.ready, 0);
      return {
        rows,
        summary: {
          positions: rows.length,
          ready_positions: rows.filter((r) => r.status === 'ready').length,
          unknown: rows.filter((r) => r.status === 'unknown').length,
          pct: total > 0 ? Math.round((ready / total) * 1000) / 1000 : 0,
        },
      };
    });
  }

  /** Bitta karta mahsulotlari ombor qoldig'i bilan */
  async stock(id: number) {
    const o = await this.orderRepo.findByPk(id, { include: [{ model: Dogovor, as: 'dogovor', attributes: ['id', 'items'] }] });
    if (!o) throw otError(NotFoundException, 'OT_NOT_FOUND', 'Yozuv topilmadi');
    const items = this.itemsOf(o as any);
    const [res] = await this.readinessOf([{ order: o, items }]);
    return { items, ...res };
  }

  /**
   * Ombor uchun: hali to'liq jo'natilmagan, mahsulotlari ma'lum kartalar va har biri bo'yicha
   * qaysi mahsulotdan nechtasi omborda tayyor.
   */
  async readiness() {
    const orders = await this.orderRepo.findAll({
      where: { sheet_removed: false, final_status: null, shipped_pct: { [Op.lt]: 1 } },
      include: [{ model: Dogovor, as: 'dogovor', attributes: ['id', 'items'] }],
      order: [['dogovor_date', 'DESC NULLS LAST'], ['id', 'DESC']],
    });
    const list = orders
      .map((order) => ({ order, items: this.itemsOf(order as any) }))
      .filter((x) => x.items.length);
    const res = await this.readinessOf(list);
    return list.map(({ order, items }, i) => ({
      id: order.id,
      dogovor_number: order.dogovor_number,
      dogovor_date: order.dogovor_date,
      client_name: order.client_name,
      manager_name: order.manager_name,
      ready_pct: order.ready_pct,
      shipped_pct: order.shipped_pct,
      items,
      ...res[i],
    }));
  }

  // ─── ERP shartnomasidan avtomatik karta ────────────────────────────
  /**
   * "Dogovorlar" bo'limida yangi shartnoma kiritilganda chaqiriladi: otgruzkada karta ochiladi
   * (tayyorlik/jo'natish 0%). Shu raqam + mijozli karta allaqachon bo'lsa (jadvalga oldin kiritilgan) —
   * yangisi ochilmaydi, mavjudi shartnomaga bog'lanadi va mahsulotlari to'ldiriladi.
   * Jadval ulangan bo'lsa unga ham qator qo'shiladi; jadvalga yozib bo'lmasa karta baribir ERP'da ochiladi.
   */
  async fromDogovor(d: Dogovor, userId: number | null) {
    const number = d.dogovor_number != null ? String(d.dogovor_number) : null;
    const items = normItems(d.items);
    const ck = companyKey(d.client_name);
    const same = number
      ? (await this.orderRepo.findAll({ where: { dogovor_number: number } })).find(
          (o) => o.dogovor_id === d.id || (ck && companyKey(o.client_name) === ck),
        )
      : await this.orderRepo.findOne({ where: { dogovor_id: d.id } });
    if (same) {
      await same.update({
        // Karta allaqachon boshqa shartnomaga bog'langan bo'lsa — o'sha bog'lanish saqlanadi
        dogovor_id: same.dogovor_id ?? d.id,
        ...(!same.items?.length && items.length ? { items } : {}),
        ...(!same.manager_name && d.manager_name ? { manager_name: d.manager_name } : {}),
        // Yangi shartnoma — ombor mahsulotlar borligini tekshirsin
        ...(same.shipped_pct < 1 && !same.final_status ? this.skladRequest() : {}),
      });
      await this.syncDogovorPayment(d, userId, same.id);
      return { id: same.id, created: false };
    }

    // Shartnomada kiritilgan boshlang'ich to'lov kartaga ham o'tadi
    const initial = r2(Number(d.initial_payment) || 0);

    const base = {
      dogovor_number: number,
      dogovor_date: d.dogovor_date || null,
      dogovor_id: d.id,
      client_name: d.client_name,
      client_inn: d.client_inn || null,
      client_contact: d.contact_name || null,
      client_phone: d.client_phone || null,
      manager_name: d.manager_name || null,
      contract_sum: Number(d.dogovor_sum) || 0,
      ready_pct: 0,
      shipped_pct: 0,
      items: items.length ? items : null,
      source: 'erp' as const,
      series: seriesOf(number),
      paid_sum: 0,
      sheet_status: formulaStatus(0),
      ...this.skladRequest(),
      created_by: userId,
    } as OtgruzkaOrderAtr;

    let sheetMode: 'live' | 'sync' | null = null;
    try {
      sheetMode = await this.editMode();
    } catch {
      sheetMode = null; // jadval asosiy, skript ulanmagan — karta faqat ERP'da
    }
    let o: OtgruzkaOrder;
    if (sheetMode === 'sync') {
      try {
        // Jadvalga to'langan summa ham birga yoziladi (keyingi sinxron farq ko'rmasin)
        o = await this.withSheet('sync', () => this.pushOrder(null, { ...base, paid_sum: initial }), (extra) => this.orderRepo.create({ ...base, ...extra }));
      } catch (e: any) {
        this.logger.warn(`Dogovor ${d.id}: jadvalga qator qo'shilmadi (${e?.message}) — karta faqat ERP'da ochildi`);
        o = await this.orderRepo.create(base);
      }
    } else {
      o = await this.orderRepo.create(base);
    }
    await this.noteRepo.create({
      order_id: o.id,
      kind: 'change',
      data: { field: 'from_dogovor', dogovor_id: d.id },
      source: 'erp',
      created_by: userId,
    } as any);
    if (initial > EPS) await this.writeDogovorPayment(o.id, d, userId);
    return { id: o.id, created: true };
  }

  // Omborga tekshiruv so'rovi (yangi shartnoma yoki mahsulotlari o'zgardi)
  private skladRequest() {
    return { sklad_check: 'pending' as const, sklad_requested_at: new Date(), sklad_checked_at: null, sklad_checked_by: null, sklad_check_note: null };
  }

  // ─── Shartnomadagi to'lov → karta to'lovlari ───────────────────────
  // Shartnomadan kelgan to'lov `comment = 'sys:dogovor'` bilan bitta yozuv bo'lib turadi:
  // shartnomada summa/sana o'zgarsa shu yozuv yangilanadi (takror qo'shilmaydi).
  private dogovorPayDate(d: Dogovor) {
    return String(d.payment_date || d.dogovor_date || todayStr()).slice(0, 10);
  }

  private async writeDogovorPayment(orderId: number, d: Dogovor, userId: number | null) {
    const amount = r2(Number(d.initial_payment) || 0);
    await this.sequelize.transaction(async (transaction) => {
      const prev = await this.paymentRepo.findOne({ where: { order_id: orderId, comment: 'sys:dogovor' }, transaction });
      if (amount > EPS) {
        if (prev) await prev.update({ amount, pay_date: this.dogovorPayDate(d) }, { transaction });
        else {
          await this.paymentRepo.create(
            { order_id: orderId, amount, pay_date: this.dogovorPayDate(d), comment: 'sys:dogovor', source: 'erp', created_by: userId },
            { transaction },
          );
        }
      } else if (prev) await prev.destroy({ transaction });
      await this.recalcPaid(orderId, transaction);
    });
  }

  /**
   * Shartnomadagi boshlang'ich to'lov (summa + sana) bog'langan kartaga yoziladi.
   * Jadval asosiy manba bo'lgan kartada to'lov jadvalga ham yoziladi (skript ulangan bo'lsa);
   * ulanmagan bo'lsa tegilmaydi — aks holda keyingi sinxron uni qaytarib "tuzatib" yuboradi.
   * Kartada qo'lda kiritilgan to'lovlar bo'lsa va shartnoma to'lovi hali yozilmagan bo'lsa —
   * qo'shilmaydi (ikki marta hisoblanmasin).
   */
  async syncDogovorPayment(d: Dogovor, userId: number | null, onlyOrderId?: number) {
    const orders = onlyOrderId
      ? await this.orderRepo.findAll({ where: { id: onlyOrderId } })
      : await this.orderRepo.findAll({ where: { dogovor_id: d.id } });
    const amount = r2(Number(d.initial_payment) || 0);
    for (const o of orders) {
      const prev = await this.paymentRepo.findOne({ where: { order_id: o.id, comment: 'sys:dogovor' } });
      if (!prev) {
        if (!(amount > EPS)) continue;
        const others = await this.paymentRepo.count({ where: { order_id: o.id } });
        if (others > 0) continue;
      } else if (same(prev.amount, amount) && prev.pay_date === this.dogovorPayDate(d)) continue;

      let mode: 'live' | 'sync';
      try {
        mode = await this.editModeFor(o);
      } catch {
        continue; // jadval asosiy, skript ulanmagan
      }
      const delta = amount - (prev ? prev.amount : 0);
      await this.withSheet(
        Math.abs(delta) > EPS ? mode : 'live',
        async () => this.pushOrder(o, { paid_sum: await this.paidTotalAfter(o.id, delta) }),
        async (extra) => {
          if (Object.keys(extra).length) await o.update(extra);
          await this.writeDogovorPayment(o.id, d, userId);
        },
      );
    }
  }

  // Bir martalik: avval ochilgan (to'lovsiz) kartalarga shartnomadagi to'lovni ko'chirish.
  // Faqat jadvalga bog'liq bo'lmagan holatlar (ERP kartasi yoki ERP asosiy rejim) — tarmoqsiz.
  private async backfillDogovorPayments() {
    const flag = await this.settingRepo.findByPk('dogovor_pay_backfill');
    if (flag?.value) return;
    const live = (await this.getMode()) === 'live';
    const orders = await this.orderRepo.findAll({
      where: { dogovor_id: { [Op.ne]: null }, paid_sum: 0 },
      include: [{ model: Dogovor, as: 'dogovor' }],
    });
    let n = 0;
    for (const o of orders) {
      const d = o.dogovor;
      if (!d || !(Number(d.initial_payment) > EPS)) continue;
      if (!live && o.source === 'sheet' && !o.sheet_removed) continue;
      if (await this.paymentRepo.count({ where: { order_id: o.id } })) continue;
      await this.writeDogovorPayment(o.id, d, null);
      n++;
    }
    await this.settingRepo.upsert({ key: 'dogovor_pay_backfill', value: { at: new Date().toISOString(), orders: n } });
    if (n) this.logger.log(`Shartnoma to'lovlari ${n} ta kartaga ko'chirildi`);
  }

  /** Shartnoma mahsulotlari o'zgarsa — bog'langan kartada ham yangilanadi (karta mahsulotlari shartnomadan olingan bo'lsa) */
  async dogovorItemsChanged(d: Dogovor, before: unknown) {
    const items = normItems(d.items);
    const prev = JSON.stringify(normItems(before as any));
    if (JSON.stringify(items) === prev) return;
    const orders = await this.orderRepo.findAll({ where: { dogovor_id: d.id } });
    for (const o of orders) {
      // Kartada mahsulotlar qo'lda o'zgartirilgan bo'lsa — tegilmaydi
      if (!o.items?.length || JSON.stringify(normItems(o.items)) === prev) {
        const recheck = items.length && o.shipped_pct < 1 && !o.final_status;
        await o.update({
          items: items.length ? items : null,
          ...(recheck ? this.skladRequest() : {}),
        });
      }
    }
  }

  // ─── O'zgartirish ───────────────────────────────────────────────────
  async create(dto: CreateOrderDto, payload: AuthPayload) {
    const mode = await this.editMode();
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(dto)) if (v !== undefined) fields[k] = typeof v === 'string' ? v.trim() || null : v;
    if ('items' in fields) fields.items = normItems(fields.items).length ? normItems(fields.items) : null;
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
    const free = ['next_action', 'next_action_date', 'items'];
    // Faqat ERP'dagi maydonlar (keyingi qadam, mahsulotlar) — jadvalga tegmaydi, har rejimda mumkin
    const mode = keys.some((k) => !free.includes(k)) ? await this.editModeFor(o) : 'live';
    if (dto.final_status && !(dto.final_reason ?? o.final_reason)?.trim()) {
      throw otError(BadRequestException, 'OT_REASON_REQUIRED', 'Yakuniy holat uchun sababini yozing');
    }
    const patch: Record<string, any> = {};
    for (const k of keys) {
      const v = (dto as any)[k];
      patch[k] = typeof v === 'string' ? v.trim() || null : v;
    }
    if (patch.dogovor_number) patch.series = seriesOf(patch.dogovor_number);
    if ('items' in patch) patch.items = normItems(patch.items).length ? normItems(patch.items) : null;
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
    const o = await this.findOrder(orderId);
    const mode = await this.editModeFor(o);
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
    const o = await this.findOrder(p.order_id);
    let mode: 'live' | 'sync' = 'live';
    if (amountChanged) {
      mode = await this.editModeFor(o);
      if (!dto.amount) throw otError(BadRequestException, 'OT_AMOUNT_ZERO', "Summa 0 bo'lmasligi kerak");
    }
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
    const p = await this.paymentRepo.findByPk(id);
    if (!p) throw otError(NotFoundException, 'OT_PAYMENT_NOT_FOUND', "To'lov topilmadi");
    if (p.source === 'sheet') {
      throw otError(ConflictException, 'OT_PAYMENT_FROM_SHEET', "Jadvaldan kelgan to'lovni o'chirib bo'lmaydi — tuzatish (manfiy) to'lov kiriting");
    }
    const o = await this.findOrder(p.order_id);
    const mode = await this.editModeFor(o);
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

  // ─── Didox: schyot-faktura fayllari (Cloudflare R2) ────────────────
  private static readonly DIDOX_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic)|application\/(xml|json|zip|x-zip-compressed|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel|msword)|text\/(xml|plain|csv))$/i;

  private static readonly DIDOX_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'xml', 'json', 'zip', 'xls', 'xlsx', 'doc', 'docx', 'csv', 'txt']);

  private didoxFields(dto: DidoxFileDto) {
    const out: Record<string, unknown> = {};
    if (dto.amount !== undefined) {
      if (dto.amount !== null && !Number.isFinite(dto.amount)) throw otError(BadRequestException, 'OT_DIDOX_AMOUNT', "Summa noto'g'ri");
      out.amount = dto.amount === null ? null : r2(dto.amount);
    }
    if (dto.invoice_number !== undefined) out.invoice_number = dto.invoice_number?.trim() || null;
    if (dto.invoice_date !== undefined) out.invoice_date = dto.invoice_date || null;
    if (dto.comment !== undefined) out.comment = dto.comment?.trim() || null;
    return out;
  }

  async addDidoxFile(orderId: number, file: Express.Multer.File, dto: DidoxFileDto, payload: AuthPayload) {
    const o = await this.findOrder(orderId);
    if (!this.r2.isConfigured) throw otError(BadRequestException, 'OT_STORAGE_OFF', "Fayl saqlash (Cloudflare R2) sozlanmagan");
    // Ba'zi brauzerlar .xlsx/.heic/.xml uchun "application/octet-stream" yuboradi — kengaytma ham tekshiriladi
    const ext = /\.([a-z0-9]{1,5})$/i.exec(file.originalname || '')?.[1]?.toLowerCase() || '';
    if (!OtgruzkaService.DIDOX_EXT.has(ext) && !(file.mimetype && OtgruzkaService.DIDOX_MIME.test(file.mimetype))) {
      throw otError(BadRequestException, 'OT_DIDOX_TYPE', "Bu turdagi fayl qabul qilinmaydi (PDF, rasm, Excel, XML)");
    }
    // Multer fayl nomini latin1 sifatida beradi — kirill nomlar buzilmasin
    const name = Buffer.from(file.originalname || 'file', 'latin1').toString('utf8');
    const key = this.r2.buildKey(`otgruzka/${o.id}/didox`, name);
    await this.r2.upload(key, file.buffer, file.mimetype);
    try {
      const f = await this.didoxRepo.create({
        order_id: o.id,
        file_name: name.slice(0, 255),
        file_key: key,
        mime_type: file.mimetype || null,
        size_bytes: file.size,
        uploaded_by: payload.user_id,
        ...this.didoxFields(dto),
        kind: dto.kind || 'invoice',
        // Ishonchnomada summa bo'lmaydi
        ...(dto.kind === 'poa' ? { amount: null } : {}),
      } as any);
      await this.noteRepo.create({
        order_id: o.id,
        kind: 'change',
        data: { field: 'didox_file', action: 'add', file_kind: f.kind, file_name: f.file_name, amount: f.amount },
        source: 'erp',
        created_by: payload.user_id,
      } as any);
    } catch (e) {
      await this.r2.remove(key); // bazaga yozilmasa R2'da yetim fayl qolmasin
      throw e;
    }
    // Ishonchnoma yuklandi — Didox'dagi "Ishonchnoma: bor" belgisi o'zi yoqiladi (rasmiy shartnomalarda).
    // Oddiy tahrir yo'li bilan: tarixga yoziladi va ikki tomonlama rejimda jadvalga ham boradi.
    // Yoqib bo'lmasa (jadval asosiy, skript ulanmagan) — fayl baribir saqlanadi, frontend ogohlantiradi.
    let poa_flag_skipped = false;
    if (dto.kind === 'poa' && isOfficial(o.series) && o.didox_poa !== true) {
      try {
        await this.update(o.id, { didox_poa: true } as UpdateOrderDto, payload);
      } catch (e: any) {
        poa_flag_skipped = true;
        this.logger.warn(`Karta ${o.id}: ishonchnoma belgisi yoqilmadi — ${e?.message}`);
      }
    }
    return { ...(await this.detail(o.id)), poa_flag_skipped };
  }

  private async findDidox(id: number) {
    const f = await this.didoxRepo.findByPk(id);
    if (!f) throw otError(NotFoundException, 'OT_DIDOX_NOT_FOUND', 'Fayl topilmadi');
    return f;
  }

  async updateDidoxFile(id: number, dto: DidoxFileDto) {
    const f = await this.findDidox(id);
    const fields = this.didoxFields(dto);
    if (f.kind === 'poa') delete fields.amount;
    await f.update(fields);
    return this.detail(f.order_id);
  }

  // O'chirish: yuklagan xodim yoki admin
  async removeDidoxFile(id: number, payload: AuthPayload) {
    const f = await this.findDidox(id);
    if (f.uploaded_by !== payload.user_id && !(await this.isAdmin(payload))) {
      throw otError(ForbiddenException, 'OT_NOT_OWNER', "Faqat yuklagan xodim yoki admin o'chira oladi");
    }
    const orderId = f.order_id;
    await this.noteRepo.create({
      order_id: orderId,
      kind: 'change',
      data: { field: 'didox_file', action: 'remove', file_kind: f.kind, file_name: f.file_name, amount: f.amount },
      source: 'erp',
      created_by: payload.user_id,
    } as any);
    await f.destroy();
    await this.r2.remove(f.file_key);
    return this.detail(orderId);
  }

  async didoxFileLink(id: number, mode: 'download' | 'inline' = 'inline') {
    const f = await this.findDidox(id);
    const expiresIn = 300;
    const url = mode === 'download'
      ? await this.r2.getDownloadUrl(f.file_key, f.file_name, expiresIn)
      : await this.r2.getInlineUrl(f.file_key, expiresIn);
    return { url, expiresIn };
  }

  // ─── Ombor tekshiruvi (yangi shartnoma → bildirishnoma) ────────────
  /** Ombor tekshirishi kerak bo'lgan yangi shartnomalar (mahsulotlar va ombordagi holati bilan) */
  async skladChecks() {
    const orders = await this.orderRepo.findAll({
      where: { sklad_check: 'pending', final_status: null, shipped_pct: { [Op.lt]: 1 } },
      include: [{ model: Dogovor, as: 'dogovor', attributes: ['id', 'items'] }],
      order: [['sklad_requested_at', 'DESC NULLS LAST'], ['id', 'DESC']],
    });
    const list = orders.map((order) => ({ order, items: this.itemsOf(order as any) }));
    const withItems = list.filter((x) => x.items.length);
    const res = await this.readinessOf(withItems);
    const byId = new Map(withItems.map((x, i) => [x.order.id, res[i]]));
    return list.map(({ order, items }) => ({
      id: order.id,
      dogovor_id: order.dogovor_id,
      dogovor_number: order.dogovor_number,
      dogovor_date: order.dogovor_date,
      client_name: order.client_name,
      manager_name: order.manager_name,
      contract_sum: order.contract_sum,
      requested_at: order.sklad_requested_at || order.createdAt,
      items,
      ...(byId.get(order.id) || { rows: [], summary: { positions: 0, ready_positions: 0, unknown: 0, pct: 0 } }),
    }));
  }

  /** Bildirishnoma uchun: soni va qisqa ro'yxat (har biri alohida o'qilgan deb belgilanadi) */
  async skladChecksCount() {
    const rows = await this.orderRepo.findAll({
      where: { sklad_check: 'pending', final_status: null, shipped_pct: { [Op.lt]: 1 } },
      attributes: ['id', 'dogovor_number', 'client_name', 'manager_name', 'createdAt', 'sklad_requested_at'],
      order: [['sklad_requested_at', 'DESC NULLS LAST'], ['id', 'DESC']],
      limit: 100,
    });
    const count = rows.length < 100 ? rows.length : await this.orderRepo.count({ where: { sklad_check: 'pending', final_status: null, shipped_pct: { [Op.lt]: 1 } } });
    return {
      count,
      // `at` — tekshiruv so'ralgan vaqt: qayta so'ralsa (mahsulotlar o'zgardi) — yangi bildirishnoma
      items: rows.map((o) => ({
        id: o.id,
        dogovor_number: o.dogovor_number,
        client_name: o.client_name,
        manager_name: o.manager_name,
        at: o.sklad_requested_at || o.createdAt,
      })),
    };
  }

  /** Ombor tekshirdi: izoh kartaning tarixiga yoziladi */
  async markSkladChecked(id: number, note: string | undefined, payload: AuthPayload) {
    const o = await this.orderRepo.findByPk(id, { include: [{ model: Dogovor, as: 'dogovor', attributes: ['id', 'items'] }] });
    if (!o) throw otError(NotFoundException, 'OT_NOT_FOUND', 'Yozuv topilmadi');
    const text = note?.trim() || null;
    const [res] = await this.readinessOf([{ order: o, items: this.itemsOf(o as any) }]);
    await this.sequelize.transaction(async (transaction) => {
      await o.update(
        { sklad_check: 'done', sklad_checked_at: new Date(), sklad_checked_by: payload.user_id, sklad_check_note: text },
        { transaction },
      );
      await this.noteRepo.create(
        {
          order_id: o.id,
          kind: 'change',
          text,
          data: { field: 'sklad_check', ready: res.summary.ready_positions, total: res.summary.positions },
          source: 'erp',
          created_by: payload.user_id,
        } as any,
        { transaction },
      );
    });
    return { ok: true };
  }
}
