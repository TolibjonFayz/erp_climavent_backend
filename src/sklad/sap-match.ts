// Ombor nomini SAP/katalog nomiga "aqlli" moslashtirish (sof funksiyalar).
// Ikki tomonning nomi 1:1 bir xil bo'lmaydi: bir tomonda izoh ("покуп", "нержавейка"), qoplama harfi
// (Ц/О), tartib raqami ("-1-"), dvigatel ma'lumoti yo'q yoki boshqacha yozilgan ("2,0" / "2", "06" / "6").
// Qoida: MAHSULOT OILASI (ВЦ, РВР, ДКСп ...) va BARCHA RAQAMLAR (o'lcham, quvvat, aylanish) mos bo'lishi shart —
// "РВР-1 1800х200" hech qachon "РВР-1 200х200" ga bog'lanmaydi. Farq faqat harf/izoh darajasida bo'lsa moslanadi.
import { LOOKALIKE } from './sap-import';

interface Tok {
  t: string; // normallashgan token
  num: boolean;
  raw: string; // asl yozilishi (registr bilan)
}

export interface NameSig {
  fam: string; // mahsulot oilasi (ВЦ, РВР ...), normallashgan
  famRaw: string; // asl registrda — "АВКв" dagi kichik harfni aniqlash uchun
  letters: string[]; // oiladan boshqa harf tokenlari
  nums: string[]; // barcha raqamlar
  nums1: string[]; // tartib raqami ("-О-1-" dagi 1) tashlab yuborilgan raqamlar
}

// Oila nomi bo'lmaydigan umumiy so'zlar ("Вентилятор ВК-100П" → oila ВК)
const MAX_FAMILY_LEN = 7; // "канальный", "вентилятор" — tavsif so'zi; modellar oilasi qisqa (ВКПП, ДКСп, JVFC)
const GENERIC = new Set([
  'вентилятор', 'вентилиятор', 'дефлектор', 'воздуховод', 'гибкая', 'гибкий', 'люк', 'часть', 'монтажный',
  'промышленный', 'кондиционер', 'пульт', 'теплообменник', 'рабочее', 'колесо', 'чиллер', 'клапан', 'зонт',
  'решетка', 'решетки', 'фланец',
]);

// Mahsulotni jiddiy o'zgartiradigan belgilar: ombor nomida bo'lib, SAP nomida bo'lmasa — bu boshqa mahsulot
// (нержавейка, ДУ — dud chiqarish, К/ВК — korroziyabardosh, взрывозащищённый)
const CONTRADICTION = /^(нерж|взрыв|искро|ду$|к$|вк$)/;

const LETTERS: Record<string, string> = { ...LOOKALIKE, d: 'д' };
const TOKEN = /\d+(?:[.,]\d+)?|[a-zа-яё]+/gi;

const normLetters = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[a-z]/g, (ch) => LETTERS[ch] ?? ch);

export function nameSig(name: string): NameSig {
  // Qavs ichidagi izohlar ("(с электроприводом)", "(год выпуск2021г)") hisobga olinmaydi
  const text = String(name || '').replace(/\([^)]*\)/g, ' ');
  const raw: Tok[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const s = m[0];
    if (/^\d/.test(s)) raw.push({ t: String(Number(s.replace(',', '.'))), num: true, raw: s });
    else raw.push({ t: normLetters(s), num: false, raw: s });
  }
  // "70х40" dagi o'lcham ajratuvchi "х" — harf emas
  const toks = raw.filter((tk, i) => !(tk.t === 'х' && raw[i - 1]?.num && raw[i + 1]?.num));

  // Uzun so'z — tavsif, lekin "нержавейка" kabi jiddiy belgi tashlab yuborilmaydi
  const isGeneric = (t: string) => !CONTRADICTION.test(t) && (GENERIC.has(t) || t.length > MAX_FAMILY_LEN);
  const famIdx = toks.findIndex((tk) => !tk.num && !isGeneric(tk.t));
  const fam = famIdx >= 0 ? toks[famIdx] : null;
  const letters = toks.filter((tk, i) => !tk.num && i !== famIdx && !isGeneric(tk.t)).map((tk) => tk.t);
  const nums = toks.filter((tk) => tk.num).map((tk) => tk.t);
  // "-О-1-0,75/1000": harfdan keyingi yagona "1" — ijro tartibi, boshqa tomonda yozilmagan bo'lishi mumkin.
  // Oila nomidan keyingi "1" ("РВР-1") esa haqiqiy raqam — tashlanmaydi.
  const nums1 = toks
    .filter((tk, i) => tk.num && !(tk.t === '1' && i > 0 && !toks[i - 1].num && i - 1 !== famIdx))
    .map((tk) => tk.t);
  return { fam: fam?.t ?? '', famRaw: fam?.raw ?? '', letters, nums, nums1 };
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// "АВК" ↔ "АВКв": oila nomining oxiriga kichik harf qo'shilgan bo'lsa (variant belgisi) — yaqin oila
function looseFamily(w: NameSig, c: NameSig): boolean {
  const [a, b] = w.fam.length <= c.fam.length ? [w, c] : [c, w];
  if (a.fam.length < 2 || b.fam.length !== a.fam.length + 1 || !b.fam.startsWith(a.fam)) return false;
  const extra = b.famRaw.slice(-1);
  return extra !== extra.toUpperCase();
}

export interface SigMatch {
  score: number;
  // Faqat yozilish farqi (2,0 = 2, 06 = 6, registr) — haqiqiy "taxminiy" emas
  exact: boolean;
}

// w — ombor nomi, c — SAP/katalog nomi, known — katalogda shu oilada uchragan harf belgilari.
// null — mos emas.
export function compareSig(w: NameSig, c: NameSig, known?: Set<string>): SigMatch | null {
  if (!w.fam || !c.fam || !w.nums.length || !c.nums.length) return null;

  let penalty = 0;
  let exact = true;
  if (w.fam !== c.fam) {
    // Oila teng bo'lishi shart (ВКП ≠ ВКПП); istisnolar: oxiriga kichik variant harfi qo'shilgani
    // yoki SAP oilasi ombor nomida boshqa so'z ortidan kelgani ("Вентилятор ВК MF-150" ↔ "MF-150P")
    if (looseFamily(w, c)) penalty += 6;
    else if (w.letters.includes(c.fam)) penalty += 8;
    else return null;
    exact = false;
  }

  if (same(w.nums, c.nums)) {
    // raqamlar aynan teng
  } else if (same(w.nums1, c.nums1)) {
    penalty += 1;
    exact = false;
  } else if (
    // Ombor nomida dvigatel ma'lumoti ortiqcha: "ВКП 70х40-4D35,5 3/1400" ↔ "ВКП 70х40-4D35,5"
    c.nums1.length >= 3 &&
    w.nums1.length > c.nums1.length &&
    w.nums1.length - c.nums1.length <= 2 &&
    c.nums1.every((n, i) => w.nums1[i] === n)
  ) {
    penalty += 3 * (w.nums1.length - c.nums1.length);
    exact = false;
  } else {
    return null;
  }

  const wLetters = w.letters.filter((l) => l !== c.fam);
  const extraC = c.letters.filter((l) => !wLetters.includes(l));
  const extraW = wLetters.filter((l) => !c.letters.includes(l));
  // Raqamlar kam bo'lsa (JVI-140 HS ↔ JVI-140CR) mahsulotni faqat harflar ajratadi — harf farqi bo'lsa moslanmaydi
  if (c.nums1.length <= 2 && extraC.length) return null;
  for (const l of extraW) {
    // Katalogning o'zi bu harfni shu oilada alohida variant deb biladi, yoki u jiddiy o'zgarish belgisi
    if (CONTRADICTION.test(l) || known?.has(l)) return null;
  }
  if (extraC.length || extraW.length) exact = false;
  return { score: 100 - penalty - 4 * extraC.length - extraW.length, exact };
}

export interface SapCandidate {
  name: string; // SAP nomi (natijada yoziladigan)
  code: string | null;
  sigs: NameSig[]; // shu qatorning solishtiriladigan nomlari (SAP nomi, ichki model nomi)
}

export interface SapIndex {
  rows: SapCandidate[];
  known: Map<string, Set<string>>; // oila → katalogda uchragan harf belgilari
}

export function buildSapIndex(rows: SapCandidate[]): SapIndex {
  const known = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const sig of row.sigs) {
      if (!sig.fam) continue;
      const set = known.get(sig.fam) ?? new Set<string>();
      sig.letters.forEach((l) => set.add(l));
      known.set(sig.fam, set);
    }
  }
  return { rows, known };
}

export interface FuzzyResult {
  row: SapCandidate;
  score: number;
  exact: boolean;
}

const MIN_SCORE = 70;

/**
 * Ombor nomiga eng yaxshi mos SAP qatorini topadi.
 * Bir xil ball bilan ikki xil SAP nomi chiqsa — taxmin qilinmaydi (ambiguous: true).
 */
export function findFuzzy(
  itemName: string,
  index: SapIndex,
): { result?: FuzzyResult; ambiguous: boolean } {
  const w = nameSig(itemName);
  let best: FuzzyResult | undefined;
  let tied = false;
  for (const row of index.rows) {
    let m: SigMatch | null = null;
    for (const sig of row.sigs) {
      // Katalog harflari — faqat ombor nomi so'zlariga tegishli emas, SAP qatorining o'ziniki hisoblanmaydi
      const known = new Set(index.known.get(sig.fam));
      sig.letters.forEach((l) => known.delete(l));
      const r = compareSig(w, sig, known);
      if (r && (!m || r.score > m.score)) m = r;
    }
    if (!m || m.score < MIN_SCORE) continue;
    if (!best || m.score > best.score) {
      best = { row, score: m.score, exact: m.exact };
      tied = false;
    } else if (m.score === best.score && row.name !== best.row.name) {
      tied = true;
    }
  }
  return tied ? { ambiguous: true } : { result: best, ambiguous: false };
}
