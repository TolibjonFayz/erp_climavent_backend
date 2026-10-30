import { AsyncLocalStorage } from 'async_hooks';

// Bitta HTTP so'rov davomida bazada nima o'zgargani shu yerga yig'iladi
// (Sequelize hook'lari yozadi, so'rov tugaganda jurnalga bitta qator bo'lib tushadi)
export type ActivityChange = {
  table: string;
  op: 'create' | 'update' | 'delete' | 'upsert' | 'bulk_create' | 'bulk_update' | 'bulk_delete';
  id?: number | string | null;
  label?: string | null;
  // update: { maydon: [eski, yangi] }; create/delete: yozuv nusxasi
  fields?: Record<string, unknown>;
  data?: Record<string, unknown>;
  where?: unknown;
  count?: number;
};

export type ActivityContext = {
  changes: ActivityChange[];
  dropped: number;
  error?: string;
  resultId?: number | string | null;
};

export const activityStore = new AsyncLocalStorage<ActivityContext>();

export const MAX_CHANGES = 40;

// Parol, token va h.k. hech qachon jurnalga ochiq yozilmaydi
const SECRET_KEY = /pass|token|secret|hash|otp|api_?key/i;
export const isSecretKey = (key: string) => SECRET_KEY.test(key);

const MAX_STR = 400;
const MAX_ARR = 10;
const MAX_DEPTH = 4;

export function clean(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') return value.length > MAX_STR ? value.slice(0, MAX_STR) + '…' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `[fayl ${value.length} bayt]`;
  if (typeof value !== 'object') return String(value);
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARR).map((v) => clean(v, depth + 1));
    if (value.length > MAX_ARR) out.push(`… yana ${value.length - MAX_ARR} ta`);
    return out;
  }
  const out: Record<string, unknown> = {};
  // Sequelize where'dagi Op.in kabi Symbol kalitlar ham ko'rinsin ("in")
  for (const key of Reflect.ownKeys(value)) {
    const k = typeof key === 'symbol' ? key.description || '?' : key;
    const v = (value as any)[key];
    if (typeof v === 'function') continue;
    out[k] = isSecretKey(k) ? '***' : clean(v, depth + 1);
  }
  return out;
}

// Yozuvni odam o'qiy oladigan nom bilan ko'rsatish uchun (birinchi bo'sh bo'lmagan maydon)
const LABEL_FIELDS = [
  'fullname',
  'name',
  'title',
  'company_name',
  'client_name',
  'kp_number',
  'dogovor_number',
  'username',
  'whereto',
  'locationname',
  'file_name',
  'original_name',
  'firstname',
];

export function pickLabel(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  for (const f of LABEL_FIELDS) {
    const v = data[f];
    if (v !== null && v !== undefined && String(v).trim()) {
      const s = String(v).trim();
      if (f === 'firstname' && data.lastname) return `${s} ${data.lastname}`.slice(0, 200);
      return s.slice(0, 200);
    }
  }
  return null;
}
