import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import * as XLSX from 'xlsx';
import { User } from 'src/users/models/user.model';
import { CreateKpDto } from './dto/create-kp.dto';
import { UpdateKpDto } from './dto/update-kp.dto';
import { ImportResultDto } from './dto/import-result.dto';
import { Kp } from './models/kp.model';

export interface AuthPayload {
  user_id: number;
  is_admin: boolean;
}

// Kiritgan xodim o'z KP'sini shu muddat ichida tahrirlashi/o'chirishi mumkin
const EDIT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 kun

const creatorInclude = [
  {
    model: User,
    as: 'creator',
    attributes: ['id', 'firstname', 'lastname', 'username'],
  },
];

// Excel ustun sarlavhalari (rus tilida, manba tizimdan eksport qilinganidek)
const HEADER_MAP: Record<string, string> = {
  '#': 'kp_number',
  'менеджер продаж': 'manager_name',
  заказчик: 'client_name',
  'режим цены': 'kp_sum',
  примечания: 'comment',
  дата: 'kp_date',
  'статус документа': 'kp_status',
  'дата закрытия документа': 'closed_date',
};

// Manba tizimdagi status matnlarini bizning tizim qiymatlariga moslashtirish
const STATUS_MAP: Record<string, string> = {
  открыто: 'Open',
  закрыто: 'Closed',
  'в работе': 'Negotiation',
  переговоры: 'Negotiation',
  'в переговорах': 'Negotiation',
};

const BATCH_SIZE = 300;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

// "20.01.26" (DD.MM.YY) yoki Excel serial sana -> "2026-01-20"
function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  const str = String(value).trim();
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (match) {
    const [, d, m, yRaw] = match;
    const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const asDate = new Date(str);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toISOString().slice(0, 10);
  }
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

@Injectable()
export class KpService {
  constructor(@InjectModel(Kp) private readonly kpRepository: typeof Kp) {}

  // Admin — cheklovsiz. Boshqa foydalanuvchi — faqat o'zi kiritgan va
  // yaratilganiga 2 kundan oshmagan KP'ni tahrirlashi/o'chirishi mumkin.
  private assertCanModify(kp: Kp, payload: AuthPayload) {
    if (payload.is_admin) return;

    if (kp.created_by == null || Number(kp.created_by) !== Number(payload.user_id)) {
      throw new ForbiddenException('Bu KPni faqat uni kiritgan xodim yoki admin tahrirlashi mumkin');
    }

    const createdAt = kp.get('createdAt') as Date;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new ForbiddenException(
        "Kiritilganiga 2 kundan oshgani uchun bu KPni faqat admin tahrirlashi/o'chirishi mumkin",
      );
    }
  }

  // admin_comment faqat admin tomonidan yozilishi/o'zgartirilishi kerak
  private stripAdminOnlyFields<T extends Record<string, any>>(dto: T, payload: AuthPayload): T {
    if (payload.is_admin) return dto;
    const { admin_comment, ...rest } = dto;
    return rest as T;
  }

  async create(createKpDto: CreateKpDto, payload: AuthPayload): Promise<Kp> {
    const data = this.stripAdminOnlyFields(createKpDto, payload);
    const created = await this.kpRepository.create({
      ...data,
      created_by: payload.user_id,
    } as any);
    return this.findOne(created.id);
  }

  // Admin — hammasini ko'radi. Oddiy xodim — faqat o'zi kiritganlarini
  // (kiritilgan/import qilingan created_by=NULL yozuvlar faqat adminga ko'rinadi).
  async findAll(payload: AuthPayload): Promise<Kp[]> {
    const where = payload.is_admin ? {} : { created_by: payload.user_id };
    return this.kpRepository.findAll({
      where,
      include: creatorInclude,
      order: [['createdAt', 'DESC']],
    });
  }

  // `payload` berilsa (tashqi so'rov) — ko'rish huquqi tekshiriladi.
  // `payload` berilmasa (create/update/remove ichidan qayta o'qish uchun) — tekshirilmaydi.
  async findOne(id: number, payload?: AuthPayload): Promise<Kp> {
    const kp = await this.kpRepository.findByPk(id, { include: creatorInclude });

    if (!kp) {
      throw new NotFoundException(`KP with id ${id} not found`);
    }

    if (payload && !payload.is_admin && Number(kp.created_by) !== Number(payload.user_id)) {
      throw new ForbiddenException('Bu KP sizga tegishli emas');
    }

    return kp;
  }

  async update(id: number, updateKpDto: UpdateKpDto, payload: AuthPayload): Promise<Kp> {
    const kp = await this.findOne(id);
    this.assertCanModify(kp, payload);
    const data = this.stripAdminOnlyFields(updateKpDto, payload);

    await this.kpRepository.update(data, {
      where: { id },
      returning: true,
    });

    return this.findOne(id);
  }

  async remove(id: number, payload: AuthPayload): Promise<{ message: string }> {
    const kp = await this.findOne(id);
    this.assertCanModify(kp, payload);

    await this.kpRepository.destroy({ where: { id } });

    return { message: `KP with id ${id} deleted successfully` };
  }

  // Excel (.xlsx/.xls) fayldan KP ro'yxatini import qilish.
  // kp_number bo'yicha upsert: mavjud hujjat yangilanadi, yangisi yaratiladi — qayta yuklashda dublikat bo'lmaydi.
  async importFromExcel(buffer: Buffer, userId: number): Promise<ImportResultDto> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    } catch {
      throw new BadRequestException("Excel faylni o'qib bo'lmadi. Fayl buzilgan yoki noto'g'ri formatda.");
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException("Excel faylda varaq (sheet) topilmadi.");
    }
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) {
      throw new BadRequestException("Excel faylda ma'lumot topilmadi.");
    }

    const headerRow = rows[0];
    const colIndex: Record<string, number> = {};
    headerRow.forEach((cell, idx) => {
      const key = HEADER_MAP[normalizeHeader(cell)];
      if (key) colIndex[key] = idx;
    });

    // Kamida mijoz va summa ustunlari topilishi shart, aks holda fayl formati mos emas
    if (colIndex.client_name === undefined || colIndex.kp_sum === undefined) {
      throw new BadRequestException(
        "Excel fayl ustunlari tanib bo'lmadi. 'Заказчик' va 'Режим цены' ustunlari borligiga ishonch hosil qiling.",
      );
    }

    const errors: string[] = [];
    const parsed: Record<string, any>[] = [];

    rows.slice(1).forEach((row, i) => {
      const rowNum = i + 2; // Excel qator raqami (1-based, header hisobga olib)
      const clientName = row[colIndex.client_name];
      // Butunlay bo'sh qatorlarni o'tkazib yuboramiz
      if (!clientName || String(clientName).trim() === '') return;

      const kpSumRaw = colIndex.kp_sum !== undefined ? row[colIndex.kp_sum] : null;
      const kpSum = typeof kpSumRaw === 'number' ? kpSumRaw : Number(kpSumRaw);
      if (Number.isNaN(kpSum)) {
        errors.push(`Qator ${rowNum}: summa noto'g'ri (${kpSumRaw})`);
        return;
      }

      const kpDate =
        colIndex.kp_date !== undefined ? parseExcelDate(row[colIndex.kp_date]) : null;
      if (!kpDate) {
        errors.push(`Qator ${rowNum}: sana noto'g'ri yoki bo'sh`);
        return;
      }

      const rawStatus =
        colIndex.kp_status !== undefined ? normalizeHeader(row[colIndex.kp_status]) : '';
      const kpStatus = STATUS_MAP[rawStatus] || 'Open';

      const kpNumberRaw = colIndex.kp_number !== undefined ? row[colIndex.kp_number] : null;
      const kpNumber =
        kpNumberRaw !== null && kpNumberRaw !== undefined && kpNumberRaw !== ''
          ? Number(kpNumberRaw)
          : null;

      parsed.push({
        kp_number: kpNumber && !Number.isNaN(kpNumber) ? kpNumber : null,
        client_name: String(clientName).trim(),
        manager_name:
          colIndex.manager_name !== undefined && row[colIndex.manager_name]
            ? String(row[colIndex.manager_name]).trim()
            : "Ko'rsatilmagan",
        kp_sum: kpSum,
        kp_status: kpStatus,
        kp_date: kpDate,
        closed_date:
          colIndex.closed_date !== undefined ? parseExcelDate(row[colIndex.closed_date]) : null,
        comment:
          colIndex.comment !== undefined && row[colIndex.comment]
            ? String(row[colIndex.comment]).trim()
            : null,
        created_by: userId,
      });
    });

    if (!parsed.length) {
      return {
        message: "Import qilinadigan yaroqli qator topilmadi.",
        total: rows.length - 1,
        imported: 0,
        updated: 0,
        skipped: rows.length - 1,
        errors,
      };
    }

    // kp_number bo'yicha mavjud yozuvlarni topib, upsert uchun ularning id sini biriktiramiz
    const numbers = parsed.map((r) => r.kp_number).filter((n): n is number => n !== null);
    const existing = numbers.length
      ? await this.kpRepository.findAll({
          where: { kp_number: { [Op.in]: numbers } },
          attributes: ['id', 'kp_number'],
        })
      : [];
    const idByNumber = new Map(existing.map((e) => [e.kp_number, e.id]));

    let updated = 0;
    let imported = 0;
    const records = parsed.map((r) => {
      const existingId = r.kp_number !== null ? idByNumber.get(r.kp_number) : undefined;
      if (existingId) {
        updated += 1;
        return { id: existingId, ...r };
      }
      imported += 1;
      return r;
    });

    for (const batch of chunk(records, BATCH_SIZE)) {
      await this.kpRepository.bulkCreate(batch as any[], {
        updateOnDuplicate: [
          'kp_number',
          'client_name',
          'manager_name',
          'kp_sum',
          'kp_status',
          'kp_date',
          'closed_date',
          'comment',
        ],
      });
    }

    return {
      message: 'Import muvaffaqiyatli yakunlandi',
      total: rows.length - 1,
      imported,
      updated,
      skipped: rows.length - 1 - parsed.length,
      errors: errors.slice(0, 20),
    };
  }
}
