// SAP mahsulotlar ro'yxati (Excel eksport) — kod va nom ustunlarini topish (sof funksiyalar).
import * as XLSX from 'xlsx';
import { SheetFormatError } from './sheet-parser';

export interface SapRow {
  code: string;
  name: string;
}

// SAP B1 eksport sarlavhalari turlicha bo'ladi (til, versiya, foydalanuvchi sozlamasi)
const CODE_HEADER =
  /^(номер позиции|номер товара|код позиции|код товара|код|артикул|item ?(no\.?|code|number)|itemcode|sap ?код|код ?sap|№ ?позиции)$/i;
const NAME_HEADER =
  /^(описание позиции|описание товара|наименование( товара| позиции)?|название|описание|item ?(name|description)|itemname|sap ?(name|nomi)|nomi)$/i;

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

// Nomlarni solishtirish kaliti: katta-kichik harf, ё/е, х/x/*/×, vergul/nuqta va
// bo'shliqlar farqi hisobga olinmaydi ("ВКП 60х30-4D28 1,35/1400" = "вкп 60x30-4d28 1.35/1400")
export function matchKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[хx*×]/g, 'x')
    .replace(/,/g, '.')
    .replace(/\s+/g, '');
}

export function parseSapWorkbook(buffer: Buffer): SapRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new SheetFormatError('SK_SAP_EMPTY', "Faylda varaq yo'q");
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  // Sarlavha qatori birinchi 15 qator ichidan qidiriladi (SAP eksportida tepada sarlavha bo'lishi mumkin)
  let headerIdx = -1;
  let codeCol = -1;
  let nameCol = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => clean(c));
    const c = cells.findIndex((h) => CODE_HEADER.test(h));
    const n = cells.findIndex((h) => NAME_HEADER.test(h));
    if (c >= 0 && n >= 0) {
      headerIdx = i;
      codeCol = c;
      nameCol = n;
      break;
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
  if (codeCol < 0 || nameCol < 0) {
    throw new SheetFormatError(
      'SK_SAP_NO_COLUMNS',
      "Faylda SAP kodi va nomi ustunlari topilmadi (masalan \"Номер позиции\" va \"Описание позиции\")",
    );
  }

  const out: SapRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const code = clean(r[codeCol]);
    const name = clean(r[nameCol]);
    if (code && name) out.push({ code, name });
  }
  if (!out.length) throw new SheetFormatError('SK_SAP_EMPTY', "Faylda SAP mahsulotlari topilmadi");
  return out;
}
