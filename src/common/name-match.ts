// Mijoz nomini solishtirish uchun "skelet": kirill → lotin, yuridik shakl (MChJ, ООО, ХК...),
// qo'shtirnoq va belgilar olib tashlanadi. "SERVER SERVIS PLYUS ХК" va "Server Servis Plyus MChJ"
// bir xil skeletga keladi. KP/shartnoma manbalarida nom 1C dan, mijozlarda esa xodim qo'lda yozgan.
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

// So'z sifatida turgan yuridik shakllar (transliteratsiyadan keyin)
const LEGAL_FORMS = new Set([
  'ooo', 'mchj', 'xk', 'qk', 'ok', 'chp', 'ip', 'llc', 'ltd', 'pte', 'pu', 'ao', 'zao', 'oao',
  'aj', 'xususiy', 'korxona', 'firma', 'kompaniya', 'company', 'inc',
]);

export function nameSkeleton(value: unknown): string {
  const latin = String(value ?? '')
    .toLowerCase()
    .split('')
    .map((ch) => CYR[ch] ?? ch)
    .join('');
  return latin
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !LEGAL_FORMS.has(w))
    .join('');
}

// Telefon: oxirgi 9 raqam (998 kodi bilan ham, kodsiz ham bir xil)
export function phoneKey(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

export function innKey(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits : '';
}
