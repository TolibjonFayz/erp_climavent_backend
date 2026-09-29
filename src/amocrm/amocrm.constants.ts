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
