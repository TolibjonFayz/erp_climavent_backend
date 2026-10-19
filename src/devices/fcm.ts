import { Logger } from '@nestjs/common';
import { createPrivateKey, createSign } from 'crypto';

/**
 * Firebase Cloud Messaging — HTTP v1 (do'kon backendidagi src/deliveries/push.ts dan
 * soddalashtirilgan nusxa).
 *
 * SOZLAMA: `FIREBASE_SERVICE_ACCOUNT` — Firebase'dan yuklab olingan servis hisobi
 * JSON'ining o'zi (bir qatorda, qo'shtirnoqqa o'ralgan yoki base64 bo'lsa ham o'qiladi).
 * Sozlanmagan bo'lsa hech narsa yuborilmaydi — faqat logga yoziladi.
 * QOIDA: push yuborilmasa asosiy amal buzilmaydi.
 */
const logger = new Logger('FCM');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const HTTP_TIMEOUT_MS = 10_000;

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let parsedFor: string | undefined;
let parsed: { sa: ServiceAccount | null; reason: string | null } = { sa: null, reason: null };
let cachedToken: { token: string; exp: number } | null = null;

function parseJson(raw: string): any | null {
  let text = raw.trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    try {
      const inner = JSON.parse(text);
      if (typeof inner === 'string') text = inner.trim();
    } catch {
      text = text.slice(1, -1).trim();
    }
  }
  if (!text.startsWith('{') && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) text = decoded;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (parsedFor === raw) return parsed.sa;
  parsedFor = raw;
  cachedToken = null;
  if (!raw.trim()) {
    parsed = { sa: null, reason: "FIREBASE_SERVICE_ACCOUNT o'rnatilmagan" };
    return null;
  }
  const j = parseJson(raw);
  if (!j?.project_id || !j?.client_email || !j?.private_key) {
    parsed = { sa: null, reason: "FIREBASE_SERVICE_ACCOUNT JSON sifatida o'qilmadi yoki maydonlar yetishmaydi" };
    return null;
  }
  const privateKey = String(j.private_key).split('\\n').join('\n');
  try {
    createPrivateKey(privateKey);
  } catch {
    parsed = { sa: null, reason: "private_key PEM kalit sifatida o'qilmadi" };
    return null;
  }
  parsed = {
    sa: { projectId: String(j.project_id), clientEmail: String(j.client_email), privateKey },
    reason: null,
  };
  return parsed.sa;
}

export const fcmConfigured = () => serviceAccount() !== null;

export function fcmStatus() {
  const sa = serviceAccount();
  return { configured: !!sa, project_id: sa?.projectId ?? null, reason: parsed.reason };
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const sa = serviceAccount();
  if (!sa) throw new Error('FCM sozlanmagan');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(sa.privateKey))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    throw new Error(`FCM OAuth ${res.status} ${body.error || ''} ${body.error_description || ''}`.trim());
  }
  const data: any = await res.json();
  cachedToken = { token: data.access_token, exp: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

export interface PushMessage {
  title: string;
  body: string;
  // Ilova qaysi sahifani ochishi kerak va h.k. (qiymatlar satr bo'lishi shart)
  data?: Record<string, string | number>;
}

export type SendOutcome = 'ok' | 'gone' | 'error';

/** Bitta tokenga yuborish. 'gone' — token eskirgan (ilova o'chirilgan), bazadan o'chirish kerak. */
export async function sendToToken(token: string, msg: PushMessage): Promise<{ status: SendOutcome; error?: string }> {
  const sa = serviceAccount();
  if (!sa) return { status: 'error', error: 'FCM sozlanmagan' };
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: Object.fromEntries(Object.entries(msg.data || {}).map(([k, v]) => [k, String(v)])),
          android: { priority: 'HIGH', notification: { channel_id: 'erp' } },
          apns: { payload: { aps: { sound: 'default' } } },
        },
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (res.ok) return { status: 'ok' };
    const text = await res.text().catch(() => '');
    let code = '';
    let message = text.slice(0, 200);
    try {
      const err = JSON.parse(text)?.error || {};
      code = String((err.details || []).map((d: any) => d?.errorCode).find(Boolean) || err.status || '');
      message = String(err.message || message).slice(0, 200);
    } catch {
      /* JSON emas */
    }
    const gone =
      res.status === 404 ||
      code === 'UNREGISTERED' ||
      (code === 'INVALID_ARGUMENT' && /registration token/i.test(message));
    return { status: gone ? 'gone' : 'error', error: `FCM ${res.status} ${code}: ${message}` };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}

export function logFcmStatus() {
  const s = fcmStatus();
  if (s.configured) logger.log(`FCM tayyor (project_id=${s.project_id})`);
  else logger.warn(`FCM sozlanmagan — push yuborilmaydi: ${s.reason}`);
}
