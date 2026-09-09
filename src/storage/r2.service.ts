import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

// Cloudflare R2 (S3-mos API) bilan ishlash.
//
// MUHIM: bucket OMMAVIY EMAS. Biznes hujjatlari havolani bilgan har kimga
// ochiq bo'lmasligi kerak, shuning uchun yuklab olish har safar qisqa
// muddatli presigned havola orqali beriladi (backend avval huquqni tekshiradi).
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private client: S3Client | null = null;
  private readonly bucket = process.env.R2_BUCKET_NAME || '';

  // Sozlamalar bo'lmasa ilova ishga tushaveradi — faqat fayl yuklash ishlamaydi.
  // Shu tarzda R2 kalitlari qo'yilmagan muhitda ham qolgan modullar ishlayveradi.
  get isConfigured(): boolean {
    return Boolean(
      process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        this.bucket,
    );
  }

  private getClient(): S3Client {
    if (!this.isConfigured) {
      throw new InternalServerErrorException(
        "Fayl saqlash sozlanmagan: .env da R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY va R2_BUCKET_NAME bo'lishi kerak",
      );
    }
    if (!this.client) {
      // R2_ENDPOINT — ixtiyoriy override: lokal sinov (MinIO va sh.k.) uchun.
      // Berilmasa odatdagi Cloudflare R2 manzili ishlatiladi.
      const endpoint =
        process.env.R2_ENDPOINT ||
        `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
      this.client = new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: process.env.R2_FORCE_PATH_STYLE === 'true',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
        },
      });
    }
    return this.client;
  }

  // Kalit: loyiha/<loyiha_id>/<bo'lim>/<uuid>.<kengaytma>
  // Fayl nomi kalitga qo'shilmaydi (kirill/probel muammolari bo'lmasin) —
  // asl nom bazada saqlanadi.
  buildKey(prefix: string, originalName: string): string {
    const dot = originalName.lastIndexOf('.');
    const ext = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : ''; // fayl nomisiz kengaytma
    const safeExt = /^[a-z0-9]{1,10}$/.test(ext) ? `.${ext}` : '';
    return `${prefix}/${randomUUID()}${safeExt}`;
  }

  async upload(
    key: string,
    body: Buffer,
    contentType?: string,
  ): Promise<{ key: string; size: number }> {
    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType || 'application/octet-stream',
        }),
      );
      return { key, size: body.length };
    } catch (error) {
      this.logger.error(`R2 upload failed for ${key}: ${(error as Error).message}`);
      throw new InternalServerErrorException('Faylni saqlashda xatolik');
    }
  }

  // Yuklab olish uchun qisqa muddatli havola (default 5 daqiqa).
  // downloadName berilsa, brauzer faylni asl nomi bilan saqlaydi.
  async getDownloadUrl(
    key: string,
    downloadName?: string,
    expiresIn = 300,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(downloadName
        ? {
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
              downloadName,
            )}`,
          }
        : {}),
    });
    return getSignedUrl(this.getClient(), command, { expiresIn });
  }

  // Ko'rish uchun (PDF/rasm brauzerda ochilsin) — yuklab olishga majburlamaydi
  async getInlineUrl(key: string, expiresIn = 300): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.getClient(), command, { expiresIn });
  }

  // Fayl o'chirilsa R2 da ham qolib ketmasin.
  // Xato bo'lsa ham yozuvni o'chirishga to'sqinlik qilmaymiz — faqat log.
  async remove(key: string): Promise<void> {
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`R2 delete failed for ${key}: ${(error as Error).message}`);
    }
  }
}
