// Schyot-fakturalar bo'yicha otgruzka hisobi va "ortiqcha" tovarlar.
//
// Frontend (utils/didoxPdfImport.js → invoicedProgress) bilan AYNAN bir xil mantiq: faktura qatori
// karta mahsulotiga nom bo'yicha moslanadi (model kodi mos kelsa — aniq, aks holda so'zlar ulushi),
// fayllar bir xil tartibda (faktura sanasi, keyin id) ko'rib chiqiladi. Shuning uchun kartadagi
// "Отгружаемость" ustuni va bu yerdagi "ortiqcha" ro'yxati bir xil sonni ko'rsatadi.
//
// Ortiqcha — schyot-fakturalarda yozilgan soni shartnomadagidan ko'p bo'lgan mahsulot.
// Qo'lda kiritilgan otgruzka soni (item.shipped) bu solishtirishga ta'sir qilmaydi: savol aynan
// "fakturalarda shartnomadagidan ko'p yozilganmi".

export interface CardItem {
  name?: string | null;
  unit?: string | null;
  qty?: number | null;
  shipped?: number | null;
}

export interface InvoiceFile {
  id?: number;
  kind?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  items?: Array<{ name?: string | null; qty?: number | null; unit?: string | null }> | null;
}

/** Ortiqcha mahsulot yozilgan schyot-faktura */
export interface OverInvoice {
  file_id: number | null;
  invoice_number: string | null;
  invoice_date: string | null;
  /** Shu fakturada shu mahsulotdan nechta yozilgan */
  qty: number;
  /** Fakturadagi qator nomlari (kartadagidan farq qilishi mumkin) */
  names: string[];
}

/** Shu mahsulot yozilgan shartnoma (mijozning boshqa shartnomalari ham) */
export interface OverContract {
  order_id: number | null;
  dogovor_id: number | null;
  dogovor_number: string | null;
  dogovor_date: string | null;
  client_name: string | null;
  /** Shartnomada shu mahsulotdan nechta */
  qty: number;
  unit: string | null;
  names: string[];
  /** Ko'rib turilgan kartaning o'z shartnomasi */
  current: boolean;
}

export interface OverItem {
  /** Kartadagi mahsulot qatori tartib raqami (0 dan) */
  index: number;
  name: string;
  unit: string | null;
  /** Shartnomada */
  qty: number;
  /** Schyot-fakturalar bo'yicha */
  invoiced: number;
  /** Shartnomadan ortiqcha */
  over: number;
  invoices: OverInvoice[];
  contracts: OverContract[];
}

/** Mijozning shartnomasi (karta yoki ERP shartnomasi) — mahsulot qaysi shartnomalarda borligini topish uchun */
export interface ContractCandidate {
  order_id: number | null;
  dogovor_id: number | null;
  dogovor_number: string | null;
  dogovor_date: string | null;
  client_name: string | null;
  client_inn: string | null;
  items: CardItem[];
}

// Moslik chegarasi — frontend bilan bir xil
export const MATCH_MIN = 0.5;

const normName = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`‘’“”]/g, '')
    .replace(/\b(mchj|мчж|ооо|llc|qk|xk|ok|mas'uliyati cheklangan jamiyati)\b/g, '')
    .replace(/[^a-zа-я0-9ўқғҳ]+/g, ' ')
    .trim();
const compact = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-zа-я0-9]/g, '');
// Model kodlari: raqam qatnashgan so'zlar (JVI-080HS, RH35C, JHYXE-VC01 …)
const codesOf = (s: unknown) =>
  ((String(s || '').match(/[A-Za-zА-Яа-я0-9]+(?:[-/][A-Za-zА-Яа-я0-9]+)*/g) || []) as string[])
    .filter((w) => /\d/.test(w) && /[A-Za-zА-Яа-я]/.test(w) && w.replace(/[^A-Za-zА-Яа-я0-9]/g, '').length >= 4)
    .map(compact);
const words = (s: unknown) => new Set(normName(s).split(' ').filter((w) => w.length > 2));

/** 0..1 — ikki tovar nomi qanchalik bir xil (1 — model kodi mos) */
export const nameScore = (a: unknown, b: unknown): number => {
  const ca = codesOf(a);
  const cbText = compact(b);
  if (ca.length && ca.some((c) => cbText.includes(c))) return 1;
  const cb = codesOf(b);
  const caText = compact(a);
  if (cb.length && cb.some((c) => caText.includes(c))) return 1;
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
};

const num = (v: unknown) => Number(v) || 0;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Fayllar tartibi — karta sahifasidagi bilan bir xil: faktura sanasi (bo'shlari oxirida), keyin id */
export function sortInvoices<T extends InvoiceFile>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const da = a.invoice_date ? String(a.invoice_date).slice(0, 10) : null;
    const db = b.invoice_date ? String(b.invoice_date).slice(0, 10) : null;
    if (da !== db) {
      if (da == null) return 1;
      if (db == null) return -1;
      return da < db ? -1 : 1;
    }
    return num(a.id) - num(b.id);
  });
}

/**
 * Har bir karta qatori bo'yicha: fakturalardan hisoblangan soni (`auto`) va qaysi fakturadan
 * nechtasi kelgani (`from`). Fayllar `sortInvoices` tartibida berilishi kerak.
 */
export function invoicedRows(card: CardItem[], files: InvoiceFile[]) {
  const invoices = files.filter((f) => (f.kind || 'invoice') === 'invoice' && Array.isArray(f.items) && f.items.length);
  const auto = card.map(() => 0);
  const from = card.map(() => new Map<InvoiceFile, OverInvoice>());
  for (const f of invoices) {
    for (const it of f.items || []) {
      const qty = num(it?.qty);
      let best = -1;
      let bestScore = 0;
      card.forEach((c, k) => {
        if (!c?.name) return;
        const s = nameScore(it?.name, c.name);
        if (s < MATCH_MIN) return;
        const free = num(c.qty) - auto[k] > 0;
        const bestFree = best >= 0 && num(card[best].qty) - auto[best] > 0;
        // Eng o'xshashi; teng bo'lsa — hali to'lmagan qator
        if (s > bestScore || (s === bestScore && free && !bestFree)) {
          best = k;
          bestScore = s;
        }
      });
      if (best < 0) continue;
      auto[best] += qty;
      const prev = from[best].get(f) || {
        file_id: f.id ?? null,
        invoice_number: f.invoice_number || null,
        invoice_date: f.invoice_date ? String(f.invoice_date).slice(0, 10) : null,
        qty: 0,
        names: [],
      };
      prev.qty = round3(prev.qty + qty);
      const nm = String(it?.name || '').trim();
      if (nm && !prev.names.includes(nm)) prev.names.push(nm);
      from[best].set(f, prev);
    }
  }
  return card.map((_, k) => ({ auto: round3(auto[k]), from: [...from[k].values()] }));
}

/** Fakturalarda shartnomadagidan ko'p yozilgan mahsulotlar (shartnomalar ro'yxatisiz) */
export function overItems(card: CardItem[] | null | undefined, files: InvoiceFile[]): OverItem[] {
  if (!card?.length || !files.length) return [];
  const rows = invoicedRows(card, sortInvoices(files));
  const out: OverItem[] = [];
  card.forEach((c, k) => {
    const qty = num(c?.qty);
    const invoiced = rows[k].auto;
    if (c?.name && invoiced - qty > 1e-6) {
      out.push({
        index: k,
        name: c.name,
        unit: c.unit || null,
        qty,
        invoiced,
        over: round3(invoiced - qty),
        invoices: rows[k].from,
        contracts: [],
      });
    }
  });
  return out;
}

/**
 * Mahsulot qaysi shartnomalarda va nechta yozilgan. Har shartnomada eng o'xshash qator(lar) olinadi
 * (bir xil darajadagi bir nechta qator bo'lsa — soni qo'shiladi).
 */
export function contractsWith(name: string, candidates: ContractCandidate[], currentOrderId: number | null): OverContract[] {
  const out: OverContract[] = [];
  for (const c of candidates) {
    let best = 0;
    let qty = 0;
    let unit: string | null = null;
    let names: string[] = [];
    for (const it of c.items || []) {
      if (!it?.name) continue;
      const s = nameScore(name, it.name);
      if (s < MATCH_MIN || s < best) continue;
      if (s > best) {
        best = s;
        qty = 0;
        names = [];
        unit = null;
      }
      qty += num(it.qty);
      unit = unit || it.unit || null;
      if (!names.includes(it.name)) names.push(it.name);
    }
    if (!best) continue;
    out.push({
      order_id: c.order_id,
      dogovor_id: c.dogovor_id,
      dogovor_number: c.dogovor_number,
      dogovor_date: c.dogovor_date ? String(c.dogovor_date).slice(0, 10) : null,
      client_name: c.client_name,
      qty: round3(qty),
      unit,
      names,
      current: currentOrderId != null && c.order_id === currentOrderId,
    });
  }
  // Ko'rib turilgan shartnoma birinchi, qolganlari — yangisi tepada
  return out.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return String(b.dogovor_date || '').localeCompare(String(a.dogovor_date || ''));
  });
}
