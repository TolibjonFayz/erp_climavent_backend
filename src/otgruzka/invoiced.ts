// Schyot-fakturalar bo'yicha otgruzka hisobi. Frontend (utils/didoxPdfImport.js → invoicedProgress)
// bilan bir xil mantiq: faktura qatori shartnoma mahsulotiga nom bo'yicha moslanadi.
// Faktura bo'yicha soni shartnomadagidan ko'p bo'lsa — "ortiqcha" deb belgilanadi.

interface CardItem {
  name?: string | null;
  unit?: string | null;
  qty?: number | null;
  shipped?: number | null;
}
interface InvoiceFile {
  kind?: string | null;
  invoice_number?: string | null;
  items?: Array<{ name?: string | null; qty?: number | null }> | null;
}

export interface OverItem {
  name: string;
  unit: string | null;
  /** Shartnomada */
  qty: number;
  /** Otgruzka (faktura yoki qo'lda kiritilgan) bo'yicha */
  shipped: number;
  /** Shartnomadan ortiqcha */
  over: number;
}

const normName = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`‘’“”]/g, '')
    .replace(
      /\b(mchj|мчж|ооо|llc|qk|xk|ok|mas'uliyati cheklangan jamiyati)\b/g,
      '',
    )
    .replace(/[^a-zа-я0-9ўқғҳ]+/g, ' ')
    .trim();
const compact = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-zа-я0-9]/g, '');
// Model kodlari: raqam qatnashgan so'zlar (JVI-080HS, RH35C …)
const codesOf = (s: unknown) =>
  (
    (String(s || '').match(/[A-Za-zА-Яа-я0-9]+(?:[-/][A-Za-zА-Яа-я0-9]+)*/g) ||
      []) as string[]
  )
    .filter(
      (w) =>
        /\d/.test(w) &&
        /[A-Za-zА-Яа-я]/.test(w) &&
        w.replace(/[^A-Za-zА-Яа-я0-9]/g, '').length >= 4,
    )
    .map(compact);
const words = (s: unknown) =>
  new Set(
    normName(s)
      .split(' ')
      .filter((w) => w.length > 2),
  );

export const nameScore = (a: unknown, b: unknown): number => {
  const ca = codesOf(a);
  if (ca.length && ca.some((c) => compact(b).includes(c))) return 1;
  const cb = codesOf(b);
  if (cb.length && cb.some((c) => compact(a).includes(c))) return 1;
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
};

/** Har bir shartnoma mahsuloti bo'yicha: fakturadan hisoblangan soni (`auto`) va ko'rsatiladigan soni (`shipped`) */
export function invoicedRows(card: CardItem[], files: InvoiceFile[]) {
  const invoices = files.filter((f) => (f.kind || 'invoice') === 'invoice');
  const auto = card.map(() => 0);
  for (const f of invoices) {
    for (const it of f.items || []) {
      const qty = Number(it.qty) || 0;
      let best = -1;
      let bestScore = 0;
      card.forEach((c, k) => {
        if (!c?.name) return;
        const s = nameScore(it.name, c.name);
        if (s < 0.5) return;
        const free = (Number(c.qty) || 0) - auto[k] > 0;
        const bestFree =
          best >= 0 && (Number(card[best].qty) || 0) - auto[best] > 0;
        if (s > bestScore || (s === bestScore && free && !bestFree)) {
          best = k;
          bestScore = s;
        }
      });
      if (best >= 0) auto[best] += qty;
    }
  }
  return card.map((c, k) => ({
    auto: auto[k],
    // Qo'lda kiritilgan son fakturadagidan ustun
    shipped: c?.shipped != null ? Number(c.shipped) || 0 : auto[k],
  }));
}

/** Shartnomadagidan ko'p otgruzka qilingan (fakturada yozilgan) mahsulotlar */
export function overItems(
  card: CardItem[] | null | undefined,
  files: InvoiceFile[],
): OverItem[] {
  if (!card?.length || !files.length) return [];
  const rows = invoicedRows(card, files);
  const out: OverItem[] = [];
  card.forEach((c, k) => {
    const qty = Number(c?.qty) || 0;
    const shipped = rows[k].shipped;
    if (c?.name && shipped - qty > 1e-6) {
      out.push({
        name: c.name,
        unit: c.unit || null,
        qty,
        shipped,
        over: Math.round((shipped - qty) * 1000) / 1000,
      });
    }
  });
  return out;
}
