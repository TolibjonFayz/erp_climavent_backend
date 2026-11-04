// "Отгрузка Трекер" Google Sheets jadvalini o'qish (sof funksiyalar — bazaga tegmaydi).
//
// "Главная" varag'i: yuqorida jami ko'rsatkichlar, keyin sarlavha qatori:
//   инн | клиент фио | клиент тел номер | менеджер | дата регистрации | дог номер |
//   компания | готовность товаров | договор | доверенность (DIDOX) | сумма по договору |
//   оплеченная сумма | % | отгруженные товары | счет фактура номер | Статус товаров |
//   Статус оплаты | (2 ta nomsiz izoh ustuni) | Дата готовности (СГП)
// Ustunlar sarlavha matni bo'yicha topiladi (joyi o'zgarsa ham ishlaydi).
//
// "Лист1" varag'i: договор | наименование | кол-во по дог. | приход | расход | остаток,
//   B ustunda mijoz qisqa nomi yoki "запас/ждем/неизвестно".

import { nameKey, parseCsv, SheetFormatError } from 'src/sklad/sheet-parser';
import type { FinalStatus, OtgruzkaSeries } from './models/otgruzka-order.model';

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const low = (v: unknown) => clean(v).toLowerCase();

export interface ParsedOrderRow {
  row: number; // varaqdagi qator raqami (1 dan)
  key: string;
  dogovor_number: string | null;
  dogovor_date: string | null;
  series: OtgruzkaSeries;
  client_name: string | null;
  client_inn: string | null;
  client_contact: string | null;
  client_phone: string | null;
  manager_name: string | null;
  contract_sum: number;
  paid_sum: number;
  ready_pct: number;
  shipped_pct: number;
  didox_contract: boolean | null;
  didox_poa: boolean | null;
  invoice_numbers: string | null;
  sheet_status: string | null;
  final_status: FinalStatus | null;
  note_main: string | null;
  note_extra: string | null;
  sgp_date: string | null;
}

export interface ParsedLine {
  row: number;
  dogovor_label: string | null;
  client_label: string | null;
  item_name: string;
  qty_contract: number | null;
  qty_in: number | null;
  qty_out: number | null;
  note: string | null;
}

// "1 908 480,00 UZS" | "4 300 000,00" | "224821744" | "-" -> son
export function parseMoney(v: unknown): number {
  let s = clean(v).replace(/[^\d,.\-]/g, '');
  if (!s || s === '-') return 0;
  // Vergul — o'nli ajratgich (ru format); nuqta faqat vergul bo'lmasa o'nli
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// "100%" | "55,8%" | "0,95" | "1" -> 0..1 (100 dan katta bo'lsa ham kesilmaydi)
export function parsePct(v: unknown): number {
  const s = clean(v);
  if (!s || s === '-') return 0;
  const hasPct = s.includes('%');
  const n = Number(s.replace('%', '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  const val = hasPct || n > 1 ? n / 100 : n;
  return Math.round(Math.max(0, val) * 10000) / 10000;
}

// Didox ustunlari: "1" — bor, "0" — yo'q, "-" / bo'sh — kerak emas
export function parseFlag(v: unknown): boolean | null {
  const s = clean(v);
  if (!s || s === '-') return null;
  if (/^(1|да|yes|true|\+|✓|✔)$/i.test(s)) return true;
  if (/^(0|нет|no|false)$/i.test(s)) return false;
  return parsePct(s) >= 1 ? true : false;
}

// "02.10.26" | "02.10.2026" | "2026-10-02" -> "2026-10-02"
export function parseDate(v: unknown): string | null {
  const s = clean(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, +m[2], +m[1]);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Raqam -> seriya. Faqat birinchi butun son olinadi ("246 выстав" -> 246).
export function seriesOf(num: string | null): OtgruzkaSeries {
  const m = clean(num).match(/^\d+/);
  if (!m) return 'other';
  const n = Number(m[0]);
  if (n >= 30000 && n < 40000) return 'cv_official';
  if (n >= 50000 && n < 60000) return 'cv_unofficial';
  if (n >= 10000 && n < 20000) return 'jv_unofficial';
  if (n >= 1 && n < 1000) return 'jv_official';
  return 'other';
}

// Kompaniya nomini solishtirish kaliti: qo'shtirnoq, MCHJ/ООО kabi shakl so'zlari va
// bo'shliqlarsiz ('"DUBANYA SILK ROAD" MCHJ QK' -> 'dubanya silk road')
export function companyKey(name: string | null | undefined): string {
  return nameKey(
    String(name ?? '')
      .replace(/["'«»`ʻʼ‘’]/g, ' ')
      .replace(/(^|\s)(mchj|мчж|ооо|ooo|xk|хк|qk|ао|оао|чп|ип|ntm|нтм|llc|ltd|лтд)(?=\s|$)/gi, ' '),
  );
}

export const isOfficial =(s: OtgruzkaSeries) => s === 'cv_official' || s === 'jv_official';

// "Статус товаров" ustunidagi qo'lda yozilgan yakuniy holatlar
export function finalStatusOf(status: string | null): FinalStatus | null {
  const s = low(status);
  if (!s) return null;
  if (s.includes('отказ')) return 'refused';
  if (s.includes('возврат')) return 'returned';
  if (s.includes('стоп')) return 'stopped';
  if (s.includes('запас')) return 'stock';
  return null;
}

// Matn ustunlari: bo'shliqlar tozalanadi, qo'shtirnoqlar o'zgarmaydi ('"DUBANYA" MCHJ')
const tidy = (v: unknown) => clean(v) || null;

// Telefon: Excel'dan qolgan qo'shtirnoqlar olib tashlanadi, bir nechta raqam vergul bilan
// '"+998 88 287 19 99   "+998 97 918 08 09' -> '+998 88 287 19 99, +998 97 918 08 09'
const tidyPhone = (v: unknown) => {
  const s = clean(String(v ?? '').replace(/"/g, ' '))
    .replace(/\s+(?=\+998)/g, ', ')
    .replace(/^,\s*/, '');
  return s || null;
};

// INN: faqat raqamlar (Excel ba'zan 3.10104742E8 qilib yuboradi)
function parseInn(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  if (/e\+?\d+$/i.test(s) && Number.isFinite(n)) return String(Math.round(n));
  const digits = s.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

// Raqam: "30281" | "30281.0" -> "30281"; matn bo'lsa o'zi
function parseNumber(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  if (/^\d+([.,]0+)?$/.test(s)) return String(parseInt(s, 10));
  return s.slice(0, 64);
}

type Col =
  | 'inn' | 'contact' | 'phone' | 'manager' | 'date' | 'number' | 'company' | 'ready'
  | 'didox_contract' | 'didox_poa' | 'sum' | 'paid' | 'shipped' | 'invoice' | 'status'
  | 'pay_status' | 'sgp';

const HEADER_RULES: Array<[Col, (h: string) => boolean]> = [
  ['inn', (h) => h === 'инн'],
  ['contact', (h) => h.startsWith('клиент фио') || h === 'клиент'],
  ['phone', (h) => h.includes('тел')],
  ['manager', (h) => h.startsWith('менеджер')],
  ['date', (h) => h.startsWith('дата регистр')],
  ['number', (h) => h.startsWith('дог') && h.includes('номер')],
  ['company', (h) => h.startsWith('компания')],
  ['ready', (h) => h.startsWith('готовность')],
  ['didox_contract', (h) => h === 'договор'],
  ['didox_poa', (h) => h.startsWith('доверенност')],
  ['sum', (h) => h.startsWith('сумма по дог')],
  ['paid', (h) => /^(оплеч|оплач)/.test(h)],
  ['shipped', (h) => h.startsWith('отгруженн')],
  ['invoice', (h) => h.startsWith('счет') || h.startsWith('счёт')],
  ['status', (h) => h.startsWith('статус товар')],
  ['pay_status', (h) => h.startsWith('статус оплат')],
  ['sgp', (h) => h.startsWith('дата готовност')],
];

export interface ParsedMain {
  rows: ParsedOrderRow[];
  skipped: number;
}

export function parseMainSheet(csv: string): ParsedMain {
  const grid = parseCsv(csv);
  const headerIdx = grid.findIndex(
    (r) => r.some((c) => low(c).startsWith('дог') && low(c).includes('номер')) && r.some((c) => low(c).startsWith('компания')),
  );
  if (headerIdx < 0) {
    throw new SheetFormatError('OT_SHEET_NO_HEADER', '"Главная" varag\'ida sarlavha qatori (дог номер, компания) topilmadi');
  }
  const header = grid[headerIdx].map(low);
  const col = {} as Record<Col, number>;
  header.forEach((h, i) => {
    if (!h) return;
    for (const [name, test] of HEADER_RULES) {
      if (col[name] === undefined && test(h)) {
        col[name] = i;
        break;
      }
    }
  });
  for (const req of ['number', 'company', 'sum', 'paid'] as Col[]) {
    if (col[req] === undefined) {
      throw new SheetFormatError('OT_SHEET_NO_COLUMN', `"${req}" ustuni topilmadi`, { column: req });
    }
  }
  // Izoh ustunlari: "Статус оплаты" dan keyingi nomsiz ustunlar
  const after = (col.pay_status ?? col.status ?? header.length) + 1;
  const noteCols: number[] = [];
  for (let i = after; i < header.length && noteCols.length < 2; i++) {
    if (!header[i]) noteCols.push(i);
    else break;
  }

  const get = (r: string[], c: Col) => (col[c] === undefined ? '' : r[col[c]] ?? '');
  const seen = new Map<string, number>();
  const rows: ParsedOrderRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const number = parseNumber(get(r, 'number'));
    const company = tidy(get(r, 'company'));
    // Bo'sh shablon qatorlari (formulalar 0% / Ожидание qoldirgan) — raqam ham, kompaniya ham yo'q
    if (!number && !company) {
      if (r.some((c) => clean(c) && !/^(0|0%|-|0,00 uzs|ожидание)$/i.test(clean(c)))) skipped++;
      continue;
    }
    const base = `${number || '-'}|${companyKey(company)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const status = tidy(get(r, 'status'));
    const series = seriesOf(number);
    rows.push({
      row: i + 1,
      key: n > 1 ? `${base}#${n}` : base,
      dogovor_number: number,
      dogovor_date: parseDate(get(r, 'date')),
      series,
      client_name: company,
      client_inn: parseInn(get(r, 'inn')),
      client_contact: tidy(get(r, 'contact')),
      client_phone: tidyPhone(get(r, 'phone')),
      manager_name: tidy(get(r, 'manager')),
      contract_sum: parseMoney(get(r, 'sum')),
      paid_sum: parseMoney(get(r, 'paid')),
      ready_pct: parsePct(get(r, 'ready')),
      shipped_pct: parsePct(get(r, 'shipped')),
      didox_contract: parseFlag(get(r, 'didox_contract')),
      didox_poa: parseFlag(get(r, 'didox_poa')),
      invoice_numbers: tidy(get(r, 'invoice'))?.replace(/\s{2,}/g, ' ') ?? null,
      sheet_status: status,
      final_status: finalStatusOf(status),
      note_main: noteCols[0] !== undefined ? tidy(r[noteCols[0]]) : null,
      note_extra: noteCols[1] !== undefined ? tidy(r[noteCols[1]]) : null,
      sgp_date: parseDate(get(r, 'sgp')),
    });
  }
  return { rows, skipped };
}

const toQty = (v: unknown): number | null => {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function parseLinesSheet(csv: string): ParsedLine[] {
  const grid = parseCsv(csv);
  const headerIdx = grid.findIndex((r) => r.some((c) => low(c) === 'договор') && r.some((c) => low(c).startsWith('наим')));
  if (headerIdx < 0) {
    throw new SheetFormatError('OT_LINES_NO_HEADER', '"Лист1" varag\'ida sarlavha (договор, наименование) topilmadi');
  }
  const h = grid[headerIdx].map(low);
  const cDog = h.findIndex((x) => x === 'договор');
  const cName = h.findIndex((x) => x.startsWith('наим'));
  const cQty = h.findIndex((x) => x.startsWith('кол-во'));
  const cIn = h.findIndex((x) => x.startsWith('приход'));
  const cOut = h.findIndex((x) => x.startsWith('расход'));
  const cRest = h.findIndex((x) => x.startsWith('остаток'));
  const cClient = cDog - 1;
  const out: ParsedLine[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const name = clean(r[cName]);
    if (!name) continue;
    // "остаток" dan keyingi birinchi to'ldirilgan ustun — izoh
    const extra = cRest >= 0 ? r.slice(cRest + 1).map(clean).find(Boolean) || null : null;
    out.push({
      row: i + 1,
      dogovor_label: parseNumber(r[cDog]),
      client_label: cClient >= 0 ? clean(r[cClient]) || null : null,
      item_name: name,
      qty_contract: cQty >= 0 ? toQty(r[cQty]) : null,
      qty_in: cIn >= 0 ? toQty(r[cIn]) : null,
      qty_out: cOut >= 0 ? toQty(r[cOut]) : null,
      note: extra,
    });
  }
  return out;
}
