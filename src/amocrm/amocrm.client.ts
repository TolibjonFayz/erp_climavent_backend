import { Injectable, Logger } from '@nestjs/common';

type ParamValue = string | number | (string | number)[];
export type AmoParams = Record<string, ParamValue>;

export class AmoAuthError extends Error {
  constructor() {
    super('amoCRM token yaroqsiz yoki muddati tugagan (401)');
  }
}

export class AmoBlockedError extends Error {
  constructor() {
    super("amoCRM so'rovlarni rad etdi (403) — IP bloklangan bo'lishi mumkin");
  }
}

// amoCRM limiti — 7 so'rov/soniya. Zaxira bilan 5 tadan oshirmaymiz.
const MIN_INTERVAL_MS = 200;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;
export const AMO_PAGE_LIMIT = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// amoCRM API v4 bilan past darajadagi ish: token, limit, qayta urinish.
// Barcha so'rovlar bitta navbatdan ketadi, shuning uchun parallel chaqiruvlar
// ham limitdan oshmaydi.
@Injectable()
export class AmocrmClient {
  private readonly logger = new Logger('AmocrmClient');
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  get isConfigured(): boolean {
    return Boolean(process.env.AMO_BASE_URL && process.env.AMO_TOKEN);
  }

  // Bo'sh natijada (204) null qaytaradi
  get<T = any>(path: string, params: AmoParams = {}): Promise<T | null> {
    const run = this.queue.then(() => this.request<T>(path, params));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private buildUrl(path: string, params: AmoParams): string {
    const base = String(process.env.AMO_BASE_URL).replace(/\/+$/, '');
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((v) => qs.append(key, String(v)));
      } else if (value !== undefined && value !== null) {
        qs.append(key, String(value));
      }
    }
    const query = qs.toString();
    return `${base}/api/v4/${path}${query ? `?${query}` : ''}`;
  }

  private async request<T>(path: string, params: AmoParams): Promise<T | null> {
    const url = this.buildUrl(path, params);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${process.env.AMO_TOKEN}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        // Tarmoq xatosi / timeout — biroz kutib qayta urinamiz
        this.logger.warn(`${path}: tarmoq xatosi (${(err as Error).message})`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      if (res.status === 204) return null;
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401) throw new AmoAuthError();
      if (res.status === 403) throw new AmoBlockedError();
      if (res.status === 429 || res.status >= 500) {
        this.logger.warn(
          `${path}: ${res.status}, qayta urinish ${attempt + 1}`,
        );
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      const body = (await res.text()).slice(0, 300);
      throw new Error(`amoCRM ${res.status} (${path}): ${body}`);
    }
    throw new Error(
      `amoCRM: ${path} — ${MAX_ATTEMPTS} urinishdan keyin ham javob yo'q`,
    );
  }
}
