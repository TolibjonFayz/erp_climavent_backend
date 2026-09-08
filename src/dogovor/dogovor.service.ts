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
import { CreateDogovorDto } from './dto/create-dogovor.dto';
import { UpdateDogovorDto } from './dto/update-dogovor.dto';
import { ImportResultDto } from './dto/import-result.dto';
import { Dogovor } from './models/dogovor.model';

export interface AuthPayload {
  user_id: number;
  is_admin: boolean;
}

// Kiritgan xodim o'z shartnomasini shu muddat ichida tahrirlashi/o'chirishi mumkin (KP bilan bir xil)
const EDIT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 kun

const creatorInclude = [
  {
    model: User,
    as: 'creator',
    attributes: ['id', 'firstname', 'lastname', 'username'],
  },
];

// Excel ustun sarlavhalari (manba tizim rus tilida eksport qiladi).
// DIQQAT: manba faylda "Долг/Лимит" ustunida aslida kontakt LAVOZIMI turadi
// ("Директор"), qarz emas — shuning uchun contact_position'ga bog'landi.
const HEADER_MAP: Record<string, string> = {
  'номер документа': 'dogovor_number',
  'дата создания': 'dogovor_date',
  'имя заказчика': 'client_name',
  'сумма заказа': 'dogovor_sum',
  'статус документа': 'dogovor_status',
  'инн заказчика': 'client_inn',
  'дата оплаты': 'payment_date',
  'первоначальный взнос': 'initial_payment',
  предоплата: 'prepayment_percent',
  'телефон заказчика': 'client_phone',
  'менеджер продаж': 'manager_name',
  'адрес (уд.)': 'client_address',
  адрес: 'client_address',
  'долг/лимит': 'contact_position',
  'фио контакта': 'contact_name',
};

const STATUS_MAP: Record<string, string> = {
  открыто: 'Open',
  'отгружено (закрыто)': 'Shipped',
  'отгружено частично': 'PartlyShipped',
  'закрыто вручную': 'Closed',
  закрыто: 'Closed',
};

const BATCH_SIZE = 300;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

// "08.09.26" (DD.MM.YY) yoki Excel serial sana -> "2026-09-08"
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
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10);
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
  return Number.isNaN(n) ? null : n;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

@Injectable()
export class DogovorService {
  constructor(
    @InjectModel(Dogovor) private readonly dogovorRepository: typeof Dogovor,
  ) {}

  // Admin — cheklovsiz. Boshqa foydalanuvchi — faqat o'zi kiritgan va
  // yaratilganiga 2 kundan oshmagan shartnomani tahrirlashi/o'chirishi mumkin.
  private assertCanModify(dogovor: Dogovor, payload: AuthPayload) {
    if (payload.is_admin) return;

    if (
      dogovor.created_by == null ||
      Number(dogovor.created_by) !== Number(payload.user_id)
    ) {
      throw new ForbiddenException(
        'Bu shartnomani faqat uni kiritgan xodim yoki admin tahrirlashi mumkin',
      );
    }

    const createdAt = dogovor.get('createdAt') as Date;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new ForbiddenException(
        "Kiritilganiga 2 kundan oshgani uchun bu shartnomani faqat admin tahrirlashi/o'chirishi mumkin",
      );
    }
  }

  // admin_comment faqat admin tomonidan yozilishi/o'zgartirilishi kerak
  private stripAdminOnlyFields<T extends Record<string, any>>(
    dto: T,
    payload: AuthPayload,
  ): T {
    if (payload.is_admin) return dto;
    const { admin_comment, ...rest } = dto;
    return rest as T;
  }

  async create(dto: CreateDogovorDto, payload: AuthPayload): Promise<Dogovor> {
    const data = this.stripAdminOnlyFields(dto, payload);
    const created = await this.dogovorRepository.create({
      ...data,
      created_by: payload.user_id,
    } as any);
    return this.findOne(created.id);
  }

  // Admin — hammasini ko'radi. Oddiy xodim — faqat o'zi kiritganlarini
  // (import qilingan created_by=NULL yozuvlar faqat adminga ko'rinadi).
  // Eng katta dogovor_number tepada.
  async findAll(payload: AuthPayload): Promise<Dogovor[]> {
    const where = payload.is_admin ? {} : { created_by: payload.user_id };
    return this.dogovorRepository.findAll({
      where,
      include: creatorInclude,
      order: [['dogovor_number', 'DESC NULLS LAST']],
    });
  }

  async findOne(id: number, payload?: AuthPayload): Promise<Dogovor> {
    const dogovor = await this.dogovorRepository.findByPk(id, {
      include: creatorInclude,
    });
    if (!dogovor) {
      throw new NotFoundException(`Dogovor with id ${id} not found`);
    }
    if (
      payload &&
      !payload.is_admin &&
      Number(dogovor.created_by) !== Number(payload.user_id)
    ) {
      throw new ForbiddenException('Bu shartnoma sizga tegishli emas');
    }
    return dogovor;
  }

  async update(
    id: number,
    dto: UpdateDogovorDto,
    payload: AuthPayload,
  ): Promise<Dogovor> {
    const dogovor = await this.findOne(id);
    this.assertCanModify(dogovor, payload);
    const data = this.stripAdminOnlyFields(dto, payload);
    await dogovor.update(data as any);
    return this.findOne(id);
  }

  async remove(id: number, payload: AuthPayload): Promise<{ message: string }> {
    const dogovor = await this.findOne(id);
    this.assertCanModify(dogovor, payload);
    await dogovor.destroy();
    return { message: `Dogovor with id ${id} deleted successfully` };
  }

  // ─── Excel import ───────────────────────────────────────────────────
  // Kalit: dogovor_number + dogovor_date. Raqam yolg'iz o'zi unikal emas —
  // manba tizimda raqamlar har yili qaytadan boshlanadi.
  async importFromExcel(
    buffer: Buffer,
    userId: number,
  ): Promise<ImportResultDto> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Excel faylda varaq topilmadi.');
    }
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
    });

    if (rows.length < 2) {
      throw new BadRequestException("Excel faylda ma'lumot topilmadi.");
    }

    const headerRow = rows[0];
    const colIndex: Record<string, number> = {};
    headerRow.forEach((cell, idx) => {
      const key = HEADER_MAP[normalizeHeader(cell)];
      if (key) colIndex[key] = idx;
    });

    if (
      colIndex.client_name === undefined ||
      colIndex.dogovor_date === undefined
    ) {
      throw new BadRequestException(
        "Excel fayl ustunlari tanib bo'lmadi. 'Имя заказчика' va 'Дата создания' ustunlari borligiga ishonch hosil qiling.",
      );
    }

    const errors: string[] = [];
    const parsed: Record<string, any>[] = [];
    const col = (row: unknown[], key: string) =>
      colIndex[key] !== undefined ? row[colIndex[key]] : null;

    rows.slice(1).forEach((row, i) => {
      const rowNum = i + 2; // Excel qator raqami (sarlavha hisobga olinib)
      const clientName = col(row, 'client_name');
      if (!clientName || String(clientName).trim() === '') return;

      const dogovorDate = parseExcelDate(col(row, 'dogovor_date'));
      if (!dogovorDate) {
        errors.push(`Qator ${rowNum}: sana noto'g'ri yoki bo'sh`);
        return;
      }

      const rawStatus = normalizeHeader(col(row, 'dogovor_status'));
      const number = toNumber(col(row, 'dogovor_number'));

      parsed.push({
        dogovor_number: number,
        dogovor_date: dogovorDate,
        client_name: String(clientName).trim(),
        dogovor_sum: toNumber(col(row, 'dogovor_sum')) ?? 0,
        dogovor_status: STATUS_MAP[rawStatus] || 'Open',
        client_inn: toText(col(row, 'client_inn')),
        payment_date: parseExcelDate(col(row, 'payment_date')),
        initial_payment: toNumber(col(row, 'initial_payment')),
        prepayment_percent: toNumber(col(row, 'prepayment_percent')),
        client_phone: toText(col(row, 'client_phone')),
        manager_name: toText(col(row, 'manager_name')),
        client_address: toText(col(row, 'client_address')),
        contact_position: toText(col(row, 'contact_position')),
        contact_name: toText(col(row, 'contact_name')),
        created_by: userId,
      });
    });

    if (!parsed.length) {
      return {
        message: 'Import qilinadigan yaroqli qator topilmadi.',
        total: rows.length - 1,
        imported: 0,
        updated: 0,
        skipped: rows.length - 1,
        errors,
      };
    }

    // Mavjud yozuvlarni raqam+sana bo'yicha topib, upsert uchun id biriktiramiz
    const numbers = parsed
      .map((r) => r.dogovor_number)
      .filter((n): n is number => n !== null && n !== undefined);
    const existing = numbers.length
      ? await this.dogovorRepository.findAll({
          where: { dogovor_number: { [Op.in]: numbers } },
          attributes: ['id', 'dogovor_number', 'dogovor_date'],
        })
      : [];
    const keyOf = (num: unknown, date: unknown) => `${num}|${date}`;
    const idByKey = new Map(
      existing.map((e) => [keyOf(e.dogovor_number, e.dogovor_date), e.id]),
    );

    let updated = 0;
    let imported = 0;
    const records = parsed.map((r) => {
      const existingId =
        r.dogovor_number !== null
          ? idByKey.get(keyOf(r.dogovor_number, r.dogovor_date))
          : undefined;
      if (existingId) {
        updated += 1;
        return { id: existingId, ...r };
      }
      imported += 1;
      return r;
    });

    // created_by va createdAt ATAYLAB yangilanmaydi — qayta import qilinganda
    // yozuvni kim kiritgani va qachon yaratilgani saqlanib qoladi.
    for (const batch of chunk(records, BATCH_SIZE)) {
      await this.dogovorRepository.bulkCreate(batch as any[], {
        updateOnDuplicate: [
          'dogovor_number',
          'dogovor_date',
          'client_name',
          'dogovor_sum',
          'dogovor_status',
          'client_inn',
          'payment_date',
          'initial_payment',
          'prepayment_percent',
          'client_phone',
          'manager_name',
          'client_address',
          'contact_position',
          'contact_name',
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
