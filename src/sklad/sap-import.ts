// SAP mahsulotlar ro'yxati (Excel) — kod, nom va qo'shimcha nom ustunlarini topish (sof funksiyalar).
// Ikki xil manba qo'llab-quvvatlanadi:
//   • SAP B1 eksporti: "Номер позиции" (kod) + "Описание позиции" (nom)
//   • Sayt katalogi eksporti (vigruzka): "SAP nomi" + "Model" + "Ichki model nomi" (kodsiz)
import * as XLSX from 'xlsx';
import { SheetFormatError } from './sheet-parser';

export interface SapRow {
  code: string | null;
  name: string;
  // Qo'shimcha nomlar (model, ichki nom) — ombor nomi shulardan biriga mos kelishi mumkin
  alts: string[];
}

const CODE_HEADER =
  /^(номер позиции|номер товара|код позиции|код товара|код|артикул|item ?(no\.?|code|number)|itemcode|sap ?(код|kodi|code)|код ?sap|№ ?позиции)$/i;
// Nom ustuni — ustuvorlik tartibida (SAP'ga xos nom birinchi)
const NAME_HEADERS = [
  /^(sap ?(nomi|name|наименование|название)|наименование ?sap)$/i,
  /^(описание позиции|описание товара|item ?(name|description)|itemname)$/i,
  /^(наименование( товара| позиции)?|название|описание|nomi)$/i,
];
const ALT_HEADER = /^(model|модель|ichki model nomi|внутренн(ее|яя) (наименование|модель))$/i;

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

// Lotin harflari bilan yozilgan, kirillchaga o'xshash harflar (С/C, Х/X, О/O ...) bir xil hisoblanadi
export const LOOKALIKE: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
  ё: 'е', '×': 'х', '*': 'х',
};

// Nomlarni solishtirish kaliti: registr, kirill/lotin o'xshash harflar, vergul/nuqta,
// bo'shliq, defis va boshqa belgilar farqi hisobga olinmaydi
// ("ВКК-КХ 80-5 3,0/1500" = "ВКК-КХ 80-5-3,0/1500", "RSK Ø125" = "RSK-125")
export function matchKey(name: string): string {
  return matchTokens(name).join('');
}

// Xuddi shu normallashtirish, lekin so'zlarga bo'lingan holda (oxiridagi so'zlar bo'yicha solishtirish uchun)
export function matchTokens(name: string): string[] {
  return String(name || '')
    .toLowerCase()
    .replace(/[a-z×*ё]/g, (ch) => LOOKALIKE[ch] ?? ch)
    .replace(/,/g, '.')
    .split(/[^0-9a-zа-я.]+/)
    .filter(Boolean);
}

export function parseSapWorkbook(buffer: Buffer): SapRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new SheetFormatError('SK_SAP_EMPTY', "Faylda varaq yo'q");
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  // Sarlavha qatori birinchi 15 qator ichidan qidiriladi
  let headerIdx = -1;
  let codeCol = -1;
  let nameCol = -1;
  let altCols: number[] = [];
  for (let i = 0; i < Math.min(rows.length, 15) && headerIdx < 0; i++) {
    const cells = rows[i].map((c) => clean(c));
    for (const re of NAME_HEADERS) {
      const n = cells.findIndex((h) => re.test(h));
      if (n >= 0) {
        headerIdx = i;
        nameCol = n;
        codeCol = cells.findIndex((h) => CODE_HEADER.test(h));
        altCols = cells.map((h, j) => (j !== n && ALT_HEADER.test(h) ? j : -1)).filter((j) => j >= 0);
        break;
      }
    }
  }
  // Sarlavhasiz ikki ustunli fayl: 1-ustun kod, 2-ustun nom
  if (headerIdx < 0) {
    const first = rows.find((r) => r.filter((c) => clean(c)).length >= 2);
    if (first && first.filter((c) => clean(c)).length === 2) {
      headerIdx = rows.indexOf(first) - 1;
      codeCol = first.findIndex((c) => clean(c));
      nameCol = first.findIndex((c, i) => i > codeCol && clean(c));
    }
  }
  if (nameCol < 0) {
    throw new SheetFormatError(
      'SK_SAP_NO_COLUMNS',
      "Faylda SAP nomi ustuni topilmadi (masalan \"SAP nomi\" yoki \"Описание позиции\")",
    );
  }

  const out: SapRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const name = clean(r[nameCol]);
    if (!name) continue;
    out.push({
      code: codeCol >= 0 ? clean(r[codeCol]) || null : null,
      name,
      alts: altCols.map((j) => clean(r[j])).filter((a) => a && a !== name),
    });
  }
  if (!out.length) throw new SheetFormatError('SK_SAP_EMPTY', 'Faylda SAP mahsulotlari topilmadi');
  return out;
}
