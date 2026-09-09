import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from 'src/users/models/user.model';
import { R2Service } from 'src/storage/r2.service';
import { CreateLoyihaDto } from './dto/create-loyiha.dto';
import { UpdateLoyihaDto } from './dto/update-loyiha.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { Loyiha } from './models/loyiha.model';
import { FILE_SECTIONS, LoyihaFile } from './models/loyiha-file.model';

export interface AuthPayload {
  user_id: number;
  is_admin: boolean;
}

const userAttrs = ['id', 'firstname', 'lastname', 'username'];

const includeAll = [
  { model: User, as: 'manager', attributes: userAttrs },
  { model: User, as: 'creator', attributes: userAttrs },
  {
    model: LoyihaFile,
    as: 'files',
    include: [{ model: User, as: 'uploader', attributes: userAttrs }],
  },
];

@Injectable()
export class LoyihaService {
  constructor(
    @InjectModel(Loyiha) private readonly loyihaRepository: typeof Loyiha,
    @InjectModel(LoyihaFile)
    private readonly fileRepository: typeof LoyihaFile,
    private readonly r2: R2Service,
  ) {}

  // Ko'rish ham, tahrirlash ham — faqat kiritgan xodim va admin
  // (KP/Dogovor bilan bir xil model, lekin vaqt chegarasisiz).
  private assertAccess(loyiha: Loyiha, payload: AuthPayload) {
    if (payload.is_admin) return;
    if (
      loyiha.created_by == null ||
      Number(loyiha.created_by) !== Number(payload.user_id)
    ) {
      throw new ForbiddenException('Bu loyiha sizga tegishli emas');
    }
  }

  async create(dto: CreateLoyihaDto, payload: AuthPayload): Promise<Loyiha> {
    const created = await this.loyihaRepository.create({
      ...dto,
      created_by: payload.user_id,
    } as any);
    return this.findOne(created.id, payload);
  }

  async findAll(payload: AuthPayload): Promise<Loyiha[]> {
    const where = payload.is_admin ? {} : { created_by: payload.user_id };
    return this.loyihaRepository.findAll({
      where,
      include: includeAll,
      order: [
        ['order_number', 'DESC NULLS LAST'],
        ['id', 'DESC'],
      ],
    });
  }

  async findOne(id: number, payload: AuthPayload): Promise<Loyiha> {
    const loyiha = await this.loyihaRepository.findByPk(id, {
      include: includeAll,
    });
    if (!loyiha) throw new NotFoundException(`Loyiha ${id} topilmadi`);
    this.assertAccess(loyiha, payload);
    return loyiha;
  }

  // Yangi yozuv uchun keyingi tartib raqamini taklif qiladi
  async nextOrderNumber(): Promise<{ next: number }> {
    const max = (await this.loyihaRepository.max('order_number')) as
      | number
      | null;
    return { next: (Number(max) || 0) + 1 };
  }

  async update(
    id: number,
    dto: UpdateLoyihaDto,
    payload: AuthPayload,
  ): Promise<Loyiha> {
    const loyiha = await this.findOne(id, payload);
    await loyiha.update(dto as any);
    return this.findOne(id, payload);
  }

  async remove(id: number, payload: AuthPayload): Promise<{ message: string }> {
    const loyiha = await this.findOne(id, payload);
    // Loyiha o'chsa fayllari ham R2 dan tozalanadi
    const files = await this.fileRepository.findAll({
      where: { loyiha_id: id },
    });
    for (const file of files) {
      await this.r2.remove(file.file_key);
    }
    await this.fileRepository.destroy({ where: { loyiha_id: id } });
    await loyiha.destroy();
    return { message: `Loyiha ${id} o'chirildi` };
  }

  // ─── Fayllar ────────────────────────────────────────────────────────

  async addFile(
    loyihaId: number,
    section: string,
    file: Express.Multer.File,
    payload: AuthPayload,
  ): Promise<LoyihaFile> {
    if (!FILE_SECTIONS.includes(section as any)) {
      throw new BadRequestException(
        `Noto'g'ri bo'lim: ${section}. Faqat 'archive' yoki 'working'`,
      );
    }
    await this.findOne(loyihaId, payload); // huquq tekshiruvi

    const key = this.r2.buildKey(
      `loyiha/${loyihaId}/${section}`,
      file.originalname,
    );
    await this.r2.upload(key, file.buffer, file.mimetype);

    const created = await this.fileRepository.create({
      loyiha_id: loyihaId,
      section,
      // Multer fayl nomini latin1 sifatida beradi — kirill nomlar buzilmasin
      file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      file_key: key,
      mime_type: file.mimetype,
      size_bytes: file.size,
      provider: 'r2',
      uploaded_by: payload.user_id,
    } as any);

    return this.getFile(created.id, payload);
  }

  private async getFileOr404(fileId: number): Promise<LoyihaFile> {
    const file = await this.fileRepository.findByPk(fileId, {
      include: [{ model: User, as: 'uploader', attributes: userAttrs }],
    });
    if (!file) throw new NotFoundException(`Fayl ${fileId} topilmadi`);
    return file;
  }

  async getFile(fileId: number, payload: AuthPayload): Promise<LoyihaFile> {
    const file = await this.getFileOr404(fileId);
    const loyiha = await this.loyihaRepository.findByPk(file.loyiha_id);
    if (loyiha) this.assertAccess(loyiha, payload);
    return file;
  }

  // Arxiv bo'limi ataylab o'zgarmas: yuklangan fayl va uning sanasi
  // dalil sifatida qoladi.
  private assertMutableFile(file: LoyihaFile) {
    if (file.section === 'archive') {
      throw new ForbiddenException(
        "Arxiv bo'limidagi faylni tahrirlab yoki o'chirib bo'lmaydi",
      );
    }
  }

  async updateFile(
    fileId: number,
    dto: UpdateFileDto,
    payload: AuthPayload,
  ): Promise<LoyihaFile> {
    const file = await this.getFile(fileId, payload);
    this.assertMutableFile(file);
    await file.update(dto as any);
    return this.getFile(fileId, payload);
  }

  async removeFile(
    fileId: number,
    payload: AuthPayload,
  ): Promise<{ message: string }> {
    const file = await this.getFile(fileId, payload);
    this.assertMutableFile(file);
    await this.r2.remove(file.file_key);
    await file.destroy();
    return { message: `Fayl ${fileId} o'chirildi` };
  }

  // Yuklab olish/ko'rish uchun qisqa muddatli havola
  async getFileLink(
    fileId: number,
    payload: AuthPayload,
    mode: 'download' | 'inline' = 'download',
  ): Promise<{ url: string; expiresIn: number }> {
    const file = await this.getFile(fileId, payload);
    const expiresIn = 300;
    const url =
      mode === 'inline'
        ? await this.r2.getInlineUrl(file.file_key, expiresIn)
        : await this.r2.getDownloadUrl(file.file_key, file.file_name, expiresIn);
    return { url, expiresIn };
  }

  get storageReady(): boolean {
    return this.r2.isConfigured;
  }
}
