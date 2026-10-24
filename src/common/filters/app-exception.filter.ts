import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import {
  BaseError,
  ConnectionError,
  DatabaseError,
  ForeignKeyConstraintError,
  TimeoutError,
  UniqueConstraintError,
  ValidationError,
} from 'sequelize';

// Bazadan kelgan xatolar oldin "Internal server error" (500) bo'lib qaytardi —
// foydalanuvchi sababini bilmasdi. Bu filtr ularni tushunarli o'zbekcha xabar va
// to'g'ri statusga aylantiradi. HttpException'lar avvalgidek o'zgarishsiz o'tadi.

// Ustun nomi -> foydalanuvchiga ko'rinadigan nom
const FIELD_LABELS: Record<string, string> = {
  dogovor_number: 'Hujjat raqami',
  dogovor_date: 'Shartnoma sanasi',
  kp_number: 'KP raqami',
  username: 'Login',
  email: 'Email',
  phone: 'Telefon',
  code: 'Kod',
  name: 'Nomi',
  name_key: 'Mahsulot nomi',
  client_name: 'Mijoz nomi',
  client_inn: 'INN',
  token: 'Qurilma tokeni',
};

const label = (field: string) => FIELD_LABELS[field] || field;

const fmtValue = (value: unknown) => {
  if (value instanceof Date)
    return value.toISOString().slice(0, 10).split('-').reverse().join('.');
  const s = String(value ?? '');
  // 2026-10-24 yoki 2026-10-24T00:00:00 -> 24.10.2026
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
};

interface Mapped {
  status: number;
  message: string;
}

const uniqueMessage = (err: UniqueConstraintError): string => {
  const fields = (err.fields || {}) as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (keys.includes('dogovor_number') && keys.includes('dogovor_date')) {
    return `№${fields.dogovor_number} raqamli, ${fmtValue(fields.dogovor_date)} sanali shartnoma bazada allaqachon bor — raqam yoki sanani tekshiring`;
  }
  if (!keys.length) return 'Bunday yozuv bazada allaqachon bor';
  const parts = keys.map((k) => `${label(k)}: ${fmtValue(fields[k])}`);
  return `Bunday yozuv bazada allaqachon bor (${parts.join(', ')})`;
};

// Postgres xato kodlari: https://www.postgresql.org/docs/current/errcodes-appendix.html
const databaseMessage = (err: DatabaseError): Mapped | null => {
  const pg = (err as any).parent || (err as any).original || {};
  const column: string | undefined = pg.column;
  switch (pg.code) {
    case '22001': {
      const limit = String(pg.message || '').match(/\((\d+)\)/)?.[1];
      return {
        status: HttpStatus.BAD_REQUEST,
        message: limit
          ? `Matn juda uzun — ko'pi bilan ${limit} ta belgi kiritish mumkin`
          : 'Matn juda uzun — maydon chegarasidan oshdi',
      };
    }
    case '22P02':
      return {
        status: HttpStatus.BAD_REQUEST,
        message:
          "Qiymat formati noto'g'ri (son yoki sana o'rniga matn kiritilgan)",
      };
    case '22003':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Son juda katta — ruxsat etilgan chegaradan oshdi',
      };
    case '22007':
    case '22008':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Sana noto'g'ri kiritilgan",
      };
    case '23502':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: column
          ? `Majburiy maydon to'ldirilmagan: ${label(column)}`
          : "Majburiy maydon to'ldirilmagan",
      };
    case '23514':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Qiymat ruxsat etilgan chegaradan tashqarida',
      };
    default:
      return null;
  }
};

export const mapDbError = (exception: unknown): Mapped | null => {
  if (exception instanceof UniqueConstraintError) {
    return { status: HttpStatus.CONFLICT, message: uniqueMessage(exception) };
  }
  if (exception instanceof ForeignKeyConstraintError) {
    const detail = String((exception as any).parent?.detail || '');
    return {
      status: HttpStatus.CONFLICT,
      message: /still referenced/i.test(detail)
        ? "Bu yozuvga boshqa ma'lumotlar bog'langan — avval ularni o'chiring yoki o'zgartiring"
        : "Bog'langan yozuv topilmadi (u o'chirilgan bo'lishi mumkin)",
    };
  }
  if (exception instanceof ValidationError) {
    const messages = (exception.errors || []).map((e) =>
      e.type === 'notnull violation' || /cannot be null/i.test(e.message)
        ? `Majburiy maydon to'ldirilmagan: ${label(String(e.path))}`
        : e.message,
    );
    return {
      status: HttpStatus.BAD_REQUEST,
      message: messages.length
        ? messages.join('; ')
        : "Ma'lumotlar noto'g'ri kiritilgan",
    };
  }
  if (
    exception instanceof ConnectionError ||
    exception instanceof TimeoutError
  ) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message:
        "Ma'lumotlar bazasi bilan aloqa yo'q — birozdan keyin qayta urinib ko'ring",
    };
  }
  if (exception instanceof DatabaseError) return databaseMessage(exception);
  return null;
};

@Catch()
export class AppExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http' || exception instanceof HttpException) {
      return super.catch(exception, host);
    }

    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    const mapped = mapDbError(exception);

    if (mapped) {
      this.logger.warn(
        `${req?.method} ${req?.url} -> ${mapped.status}: ${mapped.message}`,
      );
      return res.status(mapped.status).json({
        statusCode: mapped.status,
        message: mapped.message,
        error: HttpStatus[mapped.status],
      });
    }

    // Kutilmagan xato — to'liq stack log'ga, foydalanuvchiga qisqa sabab
    const err = exception as Error;
    this.logger.error(
      `${req?.method} ${req?.url}: ${err?.message}`,
      err?.stack,
    );
    const reason =
      exception instanceof BaseError
        ? "ma'lumotlar bazasi xatosi"
        : err?.message;
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: reason
        ? `Serverda kutilmagan xatolik: ${String(reason).slice(0, 200)}`
        : 'Serverda kutilmagan xatolik',
      error: 'Internal Server Error',
    });
  }
}
