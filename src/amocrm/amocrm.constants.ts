// amoCRM qo'ng'iroq statuslari (call_in / call_out izohlarining params.call_status)
export const AMO_CALL_STATUSES: Record<number, string> = {
  1: 'left_message', // Xabar qoldirildi
  2: 'call_back_later', // Keyinroq qayta qo'ng'iroq
  3: 'not_available', // Joyida yo'q
  4: 'answered', // Suhbat bo'ldi
  5: 'wrong_number', // Noto'g'ri raqam
  6: 'no_answer', // Javob bermadi
  7: 'busy', // Band
};

// Voronkadagi maxsus statuslar (har voronkada bir xil id)
export const AMO_STATUS_WON = 142;
export const AMO_STATUS_LOST = 143;

// Qo'ng'iroqlar biriktirilishi mumkin bo'lgan obyektlar
export const AMO_NOTE_ENTITIES = ['leads', 'contacts', 'companies'] as const;

// Birinchi importda qancha orqaga qaraymiz
export const AMO_HISTORY_DAYS = 365;

// Inkremental sinxronizatsiya oralig'i
export const AMO_SYNC_INTERVAL_MS = 10 * 60 * 1000;

// O'chirilgan sdelkalarni aniqlash uchun to'liq o'tish oralig'i
export const AMO_FULL_RECONCILE_MS = 24 * 60 * 60 * 1000;

// ─── "Mijoz emas" qoidalari ─────────────────────────────
// Postgres regex (~*). "Bizniki emas" ma'nosidagi yo'qotish sabablari.
export const AMO_NOT_OURS_RE =
  '(не\\s*наш|нецелев|не\\s*целев|спам|bizniki\\s*emas|maqsadsiz|not\\s*our)';
// Kontaktga amoCRM'da shu ma'nodagi teg qo'yilsa — mijoz emas
export const AMO_NOT_CLIENT_TAG_RE =
  '(не\\s*клиент|сотрудник|коллег|личн|знаком|xodim|hamkasb|shaxsiy|tanish|mijoz\\s*emas)';
// Shundan qisqa raqamlar — ichki (ofis ichidagi) qo'ng'iroqlar
export const AMO_INTERNAL_MAX_DIGITS = 6;
// "Shubhali raqamlar": oxirgi N kunda kamida M ta qo'ng'iroq
export const AMO_SUSPICIOUS_DAYS = 90;
export const AMO_SUSPICIOUS_MIN_CALLS = 20;

// ─── Xorijiy qo'ng'iroqlar ──────────────────────────────
// Xalqaro ko'rinishdagi raqam shundan qisqa bo'lsa — mahalliy (O'zbekiston)
// deb hisoblanadi: 9 xonali mobil, 8-90-... eski ko'rinish va h.k.
export const AMO_FOREIGN_MIN_DIGITS = 11;
export const AMO_HOME_COUNTRY = 'UZ';
export const AMO_UNKNOWN_COUNTRY = 'XX';
// Telefon kodi → davlat (ISO). Eng uzun mos kelgan kod yutadi:
// 77/76 — Qozog'iston, qolgan 7 — Rossiya.
export const AMO_COUNTRY_PREFIXES: Record<string, string> = {
  '7': 'RU',
  '76': 'KZ',
  '77': 'KZ',
  '992': 'TJ',
  '993': 'TM',
  '996': 'KG',
  '994': 'AZ',
  '995': 'GE',
  '374': 'AM',
  '375': 'BY',
  '380': 'UA',
  '373': 'MD',
  '90': 'TR',
  '86': 'CN',
  '852': 'HK',
  '886': 'TW',
  '82': 'KR',
  '81': 'JP',
  '84': 'VN',
  '66': 'TH',
  '60': 'MY',
  '62': 'ID',
  '65': 'SG',
  '91': 'IN',
  '92': 'PK',
  '93': 'AF',
  '880': 'BD',
  '98': 'IR',
  '971': 'AE',
  '966': 'SA',
  '974': 'QA',
  '965': 'KW',
  '968': 'OM',
  '973': 'BH',
  '962': 'JO',
  '964': 'IQ',
  '961': 'LB',
  '972': 'IL',
  '20': 'EG',
  '1': 'US',
  '44': 'GB',
  '49': 'DE',
  '33': 'FR',
  '39': 'IT',
  '34': 'ES',
  '31': 'NL',
  '32': 'BE',
  '41': 'CH',
  '43': 'AT',
  '48': 'PL',
  '420': 'CZ',
  '46': 'SE',
  '47': 'NO',
  '45': 'DK',
  '358': 'FI',
  '370': 'LT',
  '371': 'LV',
  '372': 'EE',
  '30': 'GR',
  '36': 'HU',
  '40': 'RO',
  '359': 'BG',
  '381': 'RS',
  '61': 'AU',
};

// ─── Ovozli yozuvlar arxivi ─────────────────────────────
// Yozuvlar telefoniyada (Moi Zvonki, Sipuni) turadi, amoCRM'da faqat havola.
// Telefoniya ularni vaqt o'tib o'chiradi — shuning uchun R2'ga ko'chiramiz.
export const AMO_RECORD_PREFIX = 'amocrm/recordings';
// Bitta ishga tushishda nechta yozuv ko'chiriladi (har sinxronizatsiyadan keyin)
export const AMO_RECORD_BATCH = 300;
export const AMO_RECORD_CONCURRENCY = 3;
export const AMO_RECORD_MAX_BYTES = 60 * 1024 * 1024;
export const AMO_RECORD_TIMEOUT_MS = 60_000;
// Vaqtinchalik xatoda nechta urinish (keyin "failed" bo'lib qoladi)
export const AMO_RECORD_MAX_ATTEMPTS = 5;
