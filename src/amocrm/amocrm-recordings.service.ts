import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { R2Service } from 'src/storage/r2.service';
import {
  AMO_RECORD_BATCH,
  AMO_RECORD_CONCURRENCY,
  AMO_RECORD_MAX_ATTEMPTS,
  AMO_RECORD_MAX_BYTES,
  AMO_RECORD_PREFIX,
  AMO_RECORD_TIMEOUT_MS,
} from './amocrm.constants';
import { AmoRecording, RecordStatus } from './models/amo-recording.model';
import { AmoSyncState } from './models/amo-sync-state.model';

const RETRY_BASE_MS = 30 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const EXT_BY_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/amr': 'amr',
};

const TYPE_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
  amr: 'audio/amr',
};

// Fayl boshidagi "sehrli" baytlar bo'yicha audio turini aniqlash —
// telefoniyalar ko'pincha application/octet-stream qaytaradi.
function sniffExt(buf: Buffer): string | null {
  const head = buf.subarray(0, 12).toString('latin1');
  if (head.startsWith('ID3')) return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return 'wav';
  if (head.startsWith('OggS')) return 'ogg';
  if (head.slice(4, 8) === 'ftyp') return 'm4a';
  if (head.startsWith('#!AMR')) return 'amr';
  return null;
}

function extFromUrl(link: string): string | null {
  try {
    const m = /\.([a-z0-9]{2,5})$/i.exec(new URL(link).pathname);
    const ext = m?.[1]?.toLowerCase();
    return ext && TYPE_BY_EXT[ext] ? ext : null;
  } catch {
    return null;
  }
}

interface PendingRow {
  hash: string;
  link: string;
  call_at: Date;
}

// Suhbat yozuvlarini telefoniyadan R2'ga ko'chirish va ularni berish.
// Telefoniya (Moi Zvonki, Sipuni) yozuvlarni vaqt o'tib o'chiradi, amoCRM'da
// esa faqat havola qoladi — fayl o'chsa, havola ham o'lik bo'lib qoladi.
@Injectable()
export class AmocrmRecordingsService {
  private readonly logger = new Logger('AmoRecordings');
  private archiving = false;

  constructor(
    private readonly sequelize: Sequelize,
    private readonly r2: R2Service,
    @InjectModel(AmoRecording) private readonly repo: typeof AmoRecording,
    @InjectModel(AmoSyncState) private readonly stateRepo: typeof AmoSyncState,
  ) {}

  get enabled(): boolean {
    return (
      this.r2.isConfigured && process.env.AMO_RECORDINGS_ARCHIVE !== 'false'
    );
  }

  get isArchiving() {
    return this.archiving;
  }

  // Hali arxivlanmagan yozuvlar — eng eskisidan boshlab (ular birinchi o'chadi)
  async archivePending(): Promise<void> {
    if (this.archiving || !this.enabled) return;
    this.archiving = true;
    try {
      const rows = await this.sequelize.query<PendingRow>(
        `SELECT a.record_hash AS hash, MIN(a.record_link) AS link,
                MIN(a.amo_created_at) AS call_at
         FROM amo_calls a
         LEFT JOIN amo_recordings r ON r.link_hash = a.record_hash
         WHERE a.record_hash IS NOT NULL
           AND (r.link_hash IS NULL OR (
             r.status = 'failed' AND r.attempts < :maxAttempts
             AND COALESCE(r.next_try_at, now()) <= now()
           ))
         GROUP BY a.record_hash
         ORDER BY call_at ASC
         LIMIT :limit`,
        {
          replacements: {
            limit: AMO_RECORD_BATCH,
            maxAttempts: AMO_RECORD_MAX_ATTEMPTS,
          },
          type: QueryTypes.SELECT,
        },
      );
      if (!rows.length) return;

      const done: Record<string, number> = {};
      let next = 0;
      const worker = async () => {
        while (next < rows.length) {
          const row = rows[next++];
          const status = await this.archiveOne(row);
          done[status] = (done[status] || 0) + 1;
        }
      };
      await Promise.all(
        Array.from({ length: AMO_RECORD_CONCURRENCY }, () => worker()),
      );
      this.logger.log(
        `Yozuvlar arxivi: ${Object.entries(done)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`,
      );
    } catch (err) {
      this.logger.error(`Arxivlash to'xtadi: ${(err as Error).message}`);
    } finally {
      this.archiving = false;
    }
  }

  private async archiveOne(row: PendingRow): Promise<RecordStatus> {
    const prev = await this.repo.findByPk(row.hash);
    const attempts = (prev?.attempts || 0) + 1;
    const save = async (
      status: RecordStatus,
      values: Partial<AmoRecording>,
    ) => {
      await this.repo.upsert({
        link_hash: row.hash,
        link: row.link,
        call_at: row.call_at,
        status,
        attempts,
        last_error: null,
        next_try_at: null,
        ...values,
      } as any);
      return status;
    };

    try {
      const res = await fetch(row.link, {
        headers: this.authHeaders(row.link),
        signal: AbortSignal.timeout(AMO_RECORD_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (res.status === 404 || res.status === 410) {
        return save('gone', { last_error: `HTTP ${res.status}` });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const declared = Number(res.headers.get('content-length')) || 0;
      if (declared > AMO_RECORD_MAX_BYTES) {
        return save('invalid', {
          last_error: `Juda katta fayl: ${declared} bayt`,
        });
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const type = (res.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();

      const sniffed = sniffExt(buf);
      const looksText = /^\s*[<{[]/.test(
        buf.subarray(0, 64).toString('latin1'),
      );
      const isAudio =
        buf.length > 0 &&
        (sniffed !== null ||
          type.startsWith('audio/') ||
          (/octet-stream/.test(type) && !looksText && buf.length > 1024));
      if (!isAudio) {
        const preview = buf
          .subarray(0, 160)
          .toString('utf8')
          .replace(/\s+/g, ' ');
        return save('invalid', {
          last_error: `Audio emas (${type || "turi noma'lum"}, ${buf.length} bayt): ${preview}`,
        });
      }

      const ext = EXT_BY_TYPE[type] || sniffed || extFromUrl(row.link) || 'mp3';
      const d = new Date(row.call_at);
      const key = `${AMO_RECORD_PREFIX}/${d.getUTCFullYear()}/${String(
        d.getUTCMonth() + 1,
      ).padStart(2, '0')}/${row.hash}.${ext}`;
      const contentType = type.startsWith('audio/') ? type : TYPE_BY_EXT[ext];
      await this.r2.upload(key, buf, contentType);

      return save('archived', {
        r2_key: key,
        size: buf.length,
        content_type: contentType,
        archived_at: new Date(),
      });
    } catch (err) {
      const message = (err as Error).message || String(err);
      return save('failed', {
        last_error: message.slice(0, 1000),
        next_try_at: new Date(Date.now() + RETRY_BASE_MS * 2 ** (attempts - 1)),
      });
    }
  }

  // Yozuv amoCRM'ning o'z serverida bo'lsa — token bilan so'raymiz
  private authHeaders(link: string): Record<string, string> {
    try {
      const amoHost = new URL(String(process.env.AMO_BASE_URL)).host;
      if (process.env.AMO_TOKEN && new URL(link).host === amoHost) {
        return { Authorization: `Bearer ${process.env.AMO_TOKEN}` };
      }
    } catch {
      /* noto'g'ri URL — sarlavhasiz so'raymiz */
    }
    return {};
  }

  // ─── Ko'rsatish ─────────────────────────────────────────

  async summary() {
    const [[counts], byStatus, problems, history] = await Promise.all([
      this.sequelize.query<any>(
        `SELECT COUNT(*)::int AS total,
                MIN(call_at) AS oldest_call,
                COUNT(*) FILTER (WHERE call_at < now() - interval '365 days')::int AS old_total
         FROM (
           SELECT record_hash, MIN(amo_created_at) AS call_at
           FROM amo_calls WHERE record_hash IS NOT NULL GROUP BY record_hash
         ) x`,
        { type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{
        status: RecordStatus;
        count: number;
        size: string;
        old: number;
      }>(
        `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(size), 0) AS size,
                COUNT(*) FILTER (WHERE call_at < :yearAgo)::int AS old
         FROM amo_recordings GROUP BY status`,
        {
          replacements: { yearAgo: new Date(Date.now() - YEAR_MS) },
          type: QueryTypes.SELECT,
        },
      ),
      // Nima uchun ko'chmayapti — eng ko'p uchragan sabablar
      this.sequelize.query<any>(
        `SELECT status, left(COALESCE(last_error, ''), 200) AS error, COUNT(*)::int AS count
         FROM amo_recordings WHERE status <> 'archived'
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5`,
        { type: QueryTypes.SELECT },
      ),
      this.stateRepo.findByPk('calls_history'),
    ]);

    const stat = (s: RecordStatus) => byStatus.find((r) => r.status === s);
    const tried = byStatus.reduce((a, r) => a + r.count, 0);
    const failed = stat('failed');
    return {
      enabled: this.enabled,
      r2_configured: this.r2.isConfigured,
      archiving: this.archiving,
      total: counts?.total || 0,
      oldest_call: counts?.oldest_call || null,
      archived: stat('archived')?.count || 0,
      archived_size: Number(stat('archived')?.size || 0),
      gone: stat('gone')?.count || 0,
      invalid: stat('invalid')?.count || 0,
      failed: failed?.count || 0,
      // Hali urinib ko'rilmaganlar (xatolar — failed'da, ular ham qayta urinadi)
      pending: Math.max(0, (counts?.total || 0) - tried),
      // 1 yildan eski qo'ng'iroqlar: nechta havola bor va nechtasi saqlab qolindi
      older_than_year: {
        total: counts?.old_total || 0,
        archived: stat('archived')?.old || 0,
        lost: (stat('gone')?.old || 0) + (stat('invalid')?.old || 0),
      },
      problems,
      history: history
        ? {
            last_run_at: history.last_run_at,
            last_status: history.last_status,
            last_error: history.last_error,
            items: history.items_synced,
          }
        : null,
    };
  }

  // Tinglash / yuklab olish havolasi. Arxivda bo'lsa — R2 (qisqa muddatli),
  // bo'lmasa — telefoniyadagi asl havola.
  async getUrl(hash: string, download: boolean) {
    const [call] = await this.sequelize.query<any>(
      `SELECT record_link, phone, direction, amo_created_at
       FROM amo_calls WHERE record_hash = :hash
       ORDER BY amo_created_at LIMIT 1`,
      { replacements: { hash }, type: QueryTypes.SELECT },
    );
    if (!call) throw new NotFoundException('Yozuv topilmadi');

    const rec = await this.repo.findByPk(hash);
    if (rec?.status === 'archived' && rec.r2_key && this.r2.isConfigured) {
      const ext = rec.r2_key.split('.').pop();
      const url = download
        ? await this.r2.getDownloadUrl(rec.r2_key, this.fileName(call, ext))
        : await this.r2.getInlineUrl(rec.r2_key, 3600);
      return { url, archived: true };
    }
    return {
      url: call.record_link,
      archived: false,
      status: rec?.status || null,
    };
  }

  private fileName(call: any, ext?: string) {
    const d = new Date(
      new Date(call.amo_created_at).getTime() + 5 * 3600 * 1000,
    );
    const stamp = d
      .toISOString()
      .slice(0, 16)
      .replace('T', '_')
      .replace(':', '-');
    const phone =
      String(call.phone || '').replace(/[^0-9+]/g, '') || 'raqamsiz';
    const dir = call.direction === 'in' ? 'kiruvchi' : 'chiquvchi';
    return `${stamp}_${dir}_${phone}.${ext || 'mp3'}`;
  }
}
