// Ombor Google Sheets jadvalini o'qish (sof funksiyalar — bazaga tegmaydi).
//
// Oylik varaq tuzilishi (masalan "Октябрь2026"):
//   1-qator: "ОКТЯБРЬ 2026" sarlavhasi (oy shu yerdan aniqlanadi)
//   sarlavha qatori: № | группа товаров | Группа товаров | Наименования |
//     НАЧАЛО МЕСЯЦА | ПРИХОД | ИТОГО РАСХОД | РЕЗЕРВ | факт | Имеется в НАЛИЧИЕ |
//     1..31 (kunlik kirim) | ИТОГО ПРИХОД | "2окт." / "20.10.2026" (chiqim sanalari) | ...
//   Formula: факт = НАЧАЛО + ПРИХОД - РАСХОД - РЕЗЕРВ.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function nameKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function toQty(v: unknown): number | null {
  const s = clean(v).replace(/\s/g, '').replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Array<[RegExp, number]> = [
  [/^янв/, 1],
  [/^фев/, 2],
  [/^мар/, 3],
  [/^апр/, 4],
  [/^ма[йя]/, 5],
  [/^июн/, 6],
  [/^июл/, 7],
  [/^авг/, 8],
  [/^сен/, 9],
  [/^окт/, 10],
  [/^ноя/, 11],
  [/^дек/, 12],
];

function monthFromWord(word: string): number | null {
  const w = word.toLowerCase();
  for (const [re, m] of MONTHS) if (re.test(w)) return m;
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function lastDayOf(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

// "2окт." / "2сен" / "20.10.2026" / "20.10" -> "2026-10-20"
export function parseDayHeader(header: string, period: string): string | null {
  const h = clean(header).toLowerCase();
  if (!h) return null;
  const [year, month] = period.split('-').map(Number);
  let m = h.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    return valid(y, Number(m[2]), Number(m[1]));
  }
  m = h.match(/^(\d{1,2})\s*([а-яё]+)\.?$/);
  if (m) {
    const mon = monthFromWord(m[2]);
    if (!mon) return null;
    // Dekabr varag'idagi "2янв" kabi o'tish holatlari uchun yilni moslaymiz
    const y = mon < month && month - mon > 6 ? year + 1 : year;
    return valid(y, mon, Number(m[1]));
  }
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// "ОКТЯБРЬ 2026" -> "2026-10"
export function parsePeriodTitle(title: string): string | null {
  const m = clean(title).match(/([А-Яа-яЁё]+)\s*(\d{4})/);
  if (!m) return null;
  const mon = monthFromWord(m[1]);
  return mon ? `${m[2]}-${pad(mon)}` : null;
}

export interface ParsedMove {
  type: 'in' | 'out' | 'reserve';
  qty: number;
  date: string;
  comment?: string;
}

export interface ParsedMonthRow {
  row_no: number | null;
  name: string;
  group_name: string | null;
  sub_group: string | null;
  opening: number;
  in_total: number;
  out_total: number;
  reserve: number;
  sheet_fact: number | null;
  moves: ParsedMove[];
}

export interface ParsedMonth {
  period: string;
  rows: ParsedMonthRow[];
  warnings: string[];
}

const norm = (v: unknown) => clean(v).toLowerCase();

export function parseMonthSheet(csv: string, today = new Date()): ParsedMonth {
  const rows = parseCsv(csv);
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'наименования'));
  if (headerIdx < 0) {
    throw new Error("Varaqda 'Наименования' sarlavhasi topilmadi — bu oylik qoldiq varag'i emas");
  }
  const header = rows[headerIdx].map(norm);

  let period: string | null = null;
  for (const r of rows.slice(0, headerIdx)) {
    for (const c of r) {
      period = parsePeriodTitle(c);
      if (period) break;
    }
    if (period) break;
  }
  if (!period) throw new Error("Varaq sarlavhasidan oy aniqlanmadi (masalan 'ОКТЯБРЬ 2026')");

  const find = (pred: (h: string) => boolean, from = 0) => {
    for (let i = from; i < header.length; i++) if (pred(header[i])) return i;
    return -1;
  };
  const groupCols = header
    .map((h, i) => (h === 'группа товаров' ? i : -1))
    .filter((i) => i >= 0);
  const col = {
    no: find((h) => h === '№'),
    sub: groupCols.length > 1 ? groupCols[0] : -1,
    group: groupCols.length ? groupCols[groupCols.length - 1] : -1,
    name: find((h) => h === 'наименования'),
    opening: find((h) => h.startsWith('начало месяца')),
    in: find((h) => h === 'приход'),
    out: find((h) => h === 'итого расход'),
    reserve: find((h) => h === 'резерв'),
    fact: find((h) => h === 'факт'),
    inTotal: find((h) => h === 'итого приход'),
  };
  for (const k of ['name', 'opening', 'in', 'out', 'inTotal'] as const) {
    if (col[k] < 0) throw new Error(`Varaqda kerakli ustun topilmadi: ${k}`);
  }
  // Kunlik kirim: "ИТОГО ПРИХОД" dan oldingi 1..31 raqamli ustunlar
  const inDays: Array<[number, string]> = [];
  for (let i = col.name + 1; i < col.inTotal; i++) {
    if (/^\d{1,2}$/.test(header[i])) {
      const d = valid(Number(period.slice(0, 4)), Number(period.slice(5)), Number(header[i]));
      if (d) inDays.push([i, d]);
    }
  }
  // Kunlik chiqim: "ИТОГО ПРИХОД" dan keyingi, ikkinchi "ИТОГО РАСХОД" gacha
  const outEnd = find((h) => h === 'итого расход', col.inTotal + 1);
  const outCols: Array<[number, string | null]> = [];
  for (let i = col.inTotal + 1; i < (outEnd < 0 ? header.length : outEnd); i++) {
    outCols.push([i, parseDayHeader(rows[headerIdx][i], period)]);
  }

  const monthEnd = lastDayOf(period);
  const todayStr = today.toISOString().slice(0, 10);
  const fallbackDate = todayStr < monthEnd && todayStr >= `${period}-01` ? todayStr : monthEnd;
  const warnings: string[] = [];
  const out: ParsedMonthRow[] = [];

  for (const r of rows.slice(headerIdx + 1)) {
    const name = clean(r[col.name]);
    if (!name) continue;
    const moves: ParsedMove[] = [];
    let inSum = 0;
    for (const [i, d] of inDays) {
      const q = toQty(r[i]);
      if (q) {
        moves.push({ type: 'in', qty: q, date: d });
        inSum += q;
      }
    }
    let outSum = 0;
    for (const [i, d] of outCols) {
      const q = toQty(r[i]);
      if (!q) continue;
      moves.push(
        d
          ? { type: 'out', qty: q, date: d }
          : { type: 'out', qty: q, date: fallbackDate, comment: "Jadvalda sana ko'rsatilmagan" },
      );
      outSum += q;
    }
    const inTotal = toQty(r[col.in]) ?? 0;
    const outTotal = toQty(r[col.out]) ?? 0;
    // Jami ustun — asosiy manba. Kunlik kataklar bilan farq bo'lsa, farqni oy oxiriga yozamiz
    const inDiff = round(inTotal - inSum);
    if (inDiff > 0) moves.push({ type: 'in', qty: inDiff, date: fallbackDate, comment: 'Jadval jami bilan farq' });
    else if (inDiff < 0) warnings.push(`${name}: kunlik kirim (${inSum}) jamidan (${inTotal}) ko'p`);
    const outDiff = round(outTotal - outSum);
    if (outDiff > 0) moves.push({ type: 'out', qty: outDiff, date: fallbackDate, comment: 'Jadval jami bilan farq' });
    else if (outDiff < 0) warnings.push(`${name}: kunlik chiqim (${outSum}) jamidan (${outTotal}) ko'p`);

    const reserve = col.reserve >= 0 ? toQty(r[col.reserve]) ?? 0 : 0;
    if (reserve > 0) moves.push({ type: 'reserve', qty: reserve, date: fallbackDate, comment: 'Jadvaldagi rezerv' });

    const opening = toQty(r[col.opening]) ?? 0;
    const fact = col.fact >= 0 ? toQty(r[col.fact]) : null;
    const computed = round(opening + Math.max(inTotal, inSum) - Math.max(outTotal, outSum) - reserve);
    if (fact !== null && round(fact) !== computed) {
      warnings.push(`${name}: jadvaldagi "факт" ${fact}, hisoblangani ${computed}`);
    }
    out.push({
      row_no: col.no >= 0 ? toQty(r[col.no]) : null,
      name,
      group_name: col.group >= 0 ? clean(r[col.group]) || null : null,
      sub_group: col.sub >= 0 ? clean(r[col.sub]) || null : null,
      opening,
      in_total: inTotal,
      out_total: outTotal,
      reserve,
      sheet_fact: fact,
      moves,
    });
  }
  return { period, rows: out, warnings };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface ParsedContractLine {
  row_no: number | null;
  dogovor_number: string | null;
  item_name: string;
  qty_contract: number | null;
  qty_in: number | null;
  qty_out: number | null;
}

// "договора на складе": shartnoma raqami faqat guruhning birinchi qatorida yoziladi —
// keyingi bo'sh kataklar yuqoridagi raqamni oladi.
export function parseContractsSheet(csv: string): ParsedContractLine[] {
  const rows = parseCsv(csv);
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'договор'));
  if (headerIdx < 0) throw new Error("Varaqda 'договор' sarlavhasi topilmadi");
  const header = rows[headerIdx].map(norm);
  const idx = (pred: (h: string) => boolean) => header.findIndex(pred);
  const col = {
    no: idx((h) => h === '№'),
    dog: idx((h) => h === 'договор'),
    name: idx((h) => h.startsWith('наим')),
    qty: idx((h) => h.startsWith('кол-во')),
    in: idx((h) => h === 'приход'),
    out: idx((h) => h === 'расход'),
  };
  if (col.name < 0) throw new Error("Varaqda nomlar ustuni topilmadi");
  const result: ParsedContractLine[] = [];
  let currentDog: string | null = null;
  for (const r of rows.slice(headerIdx + 1)) {
    const dog = col.dog >= 0 ? clean(r[col.dog]) : '';
    if (dog) currentDog = dog;
    const name = clean(r[col.name]);
    if (!name) continue;
    result.push({
      row_no: col.no >= 0 ? toQty(r[col.no]) : null,
      dogovor_number: currentDog,
      item_name: name,
      qty_contract: col.qty >= 0 ? toQty(r[col.qty]) : null,
      qty_in: col.in >= 0 ? toQty(r[col.in]) : null,
      qty_out: col.out >= 0 ? toQty(r[col.out]) : null,
    });
  }
  return result;
}

// Google Sheets havolasidan (yoki to'g'ridan-to'g'ri) jadval ID va gid ni ajratadi
export function parseSheetLink(input: string): { sheetId: string | null; gid: string | null } {
  const s = String(input || '').trim();
  const id = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? null;
  const gid = s.match(/[#?&]gid=(\d+)/)?.[1] ?? (/^\d+$/.test(s) ? s : null);
  return { sheetId: id, gid };
}
