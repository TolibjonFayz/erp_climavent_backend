import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { R2Service } from 'src/storage/r2.service';
import { AppRelease } from './app-release.model';

// Yuklab olish havolasi muddati — APK katta bo'lishi mumkin, sekin internetda ham ulgursin
const LINK_TTL = 60 * 60;

const toJson = (r: AppRelease) => ({
  id: r.id,
  platform: r.platform,
  version_name: r.version_name,
  version_code: r.version_code,
  notes: r.notes,
  file_name: r.file_name,
  file_size: Number(r.file_size) || 0,
  createdAt: r.createdAt,
});

@Injectable()
export class AppReleasesService {
  constructor(
    @InjectModel(AppRelease) private readonly releases: typeof AppRelease,
    private readonly r2: R2Service,
  ) {}

  async latest(platform = 'android') {
    const r = await this.releases.findOne({
      where: { platform },
      order: [['version_code', 'DESC']],
    });
    if (!r) return null;
    const url = this.r2.isConfigured
      ? await this.r2.getDownloadUrl(r.file_key, r.file_name, LINK_TTL)
      : null;
    return { ...toJson(r), url };
  }

  async list() {
    const rows = await this.releases.findAll({ order: [['version_code', 'DESC']] });
    return rows.map(toJson);
  }

  async create(
    file: Express.Multer.File | undefined,
    body: { version_name?: string; version_code?: string | number; notes?: string; platform?: string },
    userId?: number,
  ) {
    if (!file) throw new BadRequestException('APK fayl yuborilmadi');
    const versionName = String(body.version_name || '').trim();
    const versionCode = Number(body.version_code);
    if (!/^\d+(\.\d+){0,3}$/.test(versionName)) {
      throw new BadRequestException("Versiya nomi noto'g'ri (masalan: 1.0.1)");
    }
    if (!Number.isInteger(versionCode) || versionCode < 1) {
      throw new BadRequestException("Versiya kodi butun son bo'lishi kerak (masalan: 2)");
    }
    const platform = body.platform === 'ios' ? 'ios' : 'android';
    const exists = await this.releases.findOne({ where: { platform, version_code: versionCode } });
    if (exists) throw new BadRequestException(`Versiya kodi ${versionCode} allaqachon yuklangan`);

    // APK zip formatida — "PK" bilan boshlanadi
    if (platform === 'android' && file.buffer.subarray(0, 2).toString('latin1') !== 'PK') {
      throw new BadRequestException('Fayl APK emas');
    }

    const fileName = `Climavent-ERP-${versionName}.apk`;
    const key = `app/${platform}/climavent-erp-${versionName}-${versionCode}.apk`;
    await this.r2.upload(key, file.buffer, 'application/vnd.android.package-archive');
    const row = await this.releases.create({
      platform,
      version_name: versionName,
      version_code: versionCode,
      notes: body.notes ? String(body.notes).trim().slice(0, 2000) : null,
      file_key: key,
      file_name: fileName,
      file_size: file.size,
      created_by: userId || null,
    });
    return toJson(row);
  }

  async remove(id: number) {
    const row = await this.releases.findByPk(id);
    if (!row) throw new NotFoundException('Versiya topilmadi');
    await this.r2.remove(row.file_key);
    await row.destroy();
    return { ok: true };
  }
}
