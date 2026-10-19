import { connect } from 'http2';
import { createPrivateKey, sign } from 'crypto';
import { PushMessage, SendOutcome } from './fcm';

/**
 * iPhone uchun push — Apple Push Notification service (APNs), to'g'ridan-to'g'ri.
 * Ilova iOS'da APNs tokenini beradi (Firebase SDK'siz), shuning uchun FCM emas.
 *
 * SOZLAMA (Apple Developer → Keys → "Apple Push Notifications service" kaliti):
 *   APNS_KEY        — .p8 fayl mazmuni (\n bilan bir qatorda bo'lsa ham bo'ladi)
 *   APNS_KEY_ID     — kalit ID (10 belgi)
 *   APNS_TEAM_ID    — Team ID (10 belgi)
 *   APNS_BUNDLE_ID  — ilova bundle ID (standart: uz.climavent.erp)
 *   APNS_SANDBOX    — 'true' bo'lsa sinov serveri (Xcode'dan to'g'ridan-to'g'ri o'rnatilgan ilova uchun);
 *                     TestFlight/App Store uchun bo'sh qoldiring.
 */
let cachedJwt: { token: string; exp: number } | null = null;

function config() {
  const key = String(process.env.APNS_KEY || '').split('\\n').join('\n').trim();
  const keyId = String(process.env.APNS_KEY_ID || '').trim();
  const teamId = String(process.env.APNS_TEAM_ID || '').trim();
  if (!key || !keyId || !teamId) return null;
  return {
    key,
    keyId,
    teamId,
    topic: String(process.env.APNS_BUNDLE_ID || 'uz.climavent.erp').trim(),
    host: process.env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com',
  };
}

export const apnsConfigured = () => config() !== null;

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// Apple tokenni 20–60 daqiqada yangilashni talab qiladi
function providerToken(cfg: NonNullable<ReturnType<typeof config>>): string {
  if (cachedJwt && cachedJwt.exp > Date.now()) return cachedJwt.token;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(cfg.key),
    dsaEncoding: 'ieee-p1363',
  });
  const token = `${header}.${claims}.${b64url(signature)}`;
  cachedJwt = { token, exp: Date.now() + 40 * 60 * 1000 };
  return token;
}

export function sendToApns(deviceToken: string, msg: PushMessage): Promise<{ status: SendOutcome; error?: string }> {
  const cfg = config();
  if (!cfg) return Promise.resolve({ status: 'error', error: 'APNs sozlanmagan' });
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { status: SendOutcome; error?: string }) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {
        /* yopilgan */
      }
      resolve(r);
    };
    const client = connect(cfg.host);
    client.on('error', (e) => done({ status: 'error', error: `APNs: ${e.message}` }));
    client.setTimeout(10_000, () => done({ status: 'error', error: 'APNs: timeout' }));

    let req;
    try {
      req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken(cfg)}`,
        'apns-topic': cfg.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
    } catch (e) {
      done({ status: 'error', error: `APNs: ${(e as Error).message}` });
      return;
    }
    let status = 0;
    let body = '';
    req.on('response', (headers) => (status = Number(headers[':status'])));
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (status === 200) return done({ status: 'ok' });
      let reason = '';
      try {
        reason = JSON.parse(body).reason || '';
      } catch {
        /* bo'sh */
      }
      // 410 — ilova o'chirilgan; BadDeviceToken — boshqa muhit/yaroqsiz token
      const gone = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
      done({ status: gone ? 'gone' : 'error', error: `APNs ${status} ${reason}` });
    });
    req.on('error', (e) => done({ status: 'error', error: `APNs: ${e.message}` }));
    req.end(
      JSON.stringify({
        aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' },
        ...Object.fromEntries(Object.entries(msg.data || {}).map(([k, v]) => [k, String(v)])),
      }),
    );
  });
}
