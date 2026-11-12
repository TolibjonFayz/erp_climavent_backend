import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { FINAL_STATUSES } from '../models/otgruzka-order.model';
import { DIDOX_KINDS, DidoxKind } from '../models/otgruzka-didox-file.model';

// DIQQAT: global ValidationPipe `whitelist: true` — dekoratorsiz maydon jimgina
// tashlab yuboriladi. Har bir maydonga validator qo'yish shart.

export class OtgruzkaSettingsDto {
  @ApiProperty({ enum: ['mirror', 'live'] })
  @IsIn(['mirror', 'live'])
  mode: 'mirror' | 'live';
}

export class OrderItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500)
  name: string = '';

  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(32)
  unit?: string | null;

  @ApiProperty() @IsNumber() @Min(0)
  qty: number = 0;

  @ApiProperty() @IsNumber() @Min(0)
  price: number = 0;
}

// Mirror rejimda faqat `next_action*` va `items` qabul qilinadi; qolganlari — jadval bilan birga
export class UpdateOrderDto {
  @ApiPropertyOptional({ type: [OrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  next_action?: string | null;

  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  next_action_date?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64)
  dogovor_number?: string;

  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  dogovor_date?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  client_name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32)
  client_inn?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  client_contact?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  client_phone?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  manager_name?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  contract_sum?: number;

  @ApiPropertyOptional({ description: '0..1' }) @IsOptional() @IsNumber() @Min(0) @Max(1)
  ready_pct?: number;

  @ApiPropertyOptional({ description: '0..1' }) @IsOptional() @IsNumber() @Min(0) @Max(1)
  shipped_pct?: number;

  @ApiPropertyOptional({ description: 'null — kerak emas' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean()
  didox_contract?: boolean | null;

  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean()
  didox_poa?: boolean | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  invoice_numbers?: string | null;

  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  sgp_date?: string | null;

  @ApiPropertyOptional({ enum: FINAL_STATUSES })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(FINAL_STATUSES as unknown as string[])
  final_status?: (typeof FINAL_STATUSES)[number] | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  final_reason?: string | null;
}

export class CreateOrderDto extends UpdateOrderDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(64)
  dogovor_number: string = '';

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  client_name: string = '';
}

export class CreatePaymentDto {
  @ApiProperty({ example: 5000000, description: "Manfiy — tuzatish/qaytarish" })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: '2026-11-04' })
  @IsDateString()
  pay_date: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  comment?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  amount?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  pay_date?: string;

  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  comment?: string | null;
}

export class CreateNoteDto {
  @ApiProperty({ enum: ['note', 'call'] })
  @IsIn(['note', 'call'])
  kind: 'note' | 'call';

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000)
  text: string;
}

export class ScriptUrlDto {
  @ApiPropertyOptional({ example: 'https://script.google.com/macros/s/AKfy.../exec', description: "null — uzish" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  script_url?: string | null;
}

export class HookDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  secret: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ping?: boolean;
}

// Didox schyot-faktura fayli: multipart maydonlari matn bo'lib keladi — raqamga o'giriladi
const toNum = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? null : Number(String(value).replace(/\s/g, '').replace(',', '.'));
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

// Schyot-faktura tovarlari: JSON matn yoki massiv → tozalangan ro'yxat (noto'g'ri qatorlar tashlanadi)
const toDidoxItems = ({ value }: { value: unknown }) => {
  if (value === '' || value === null || value === undefined) return null;
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return 'invalid';
    }
  }
  if (!Array.isArray(list)) return 'invalid';
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return list
    .slice(0, 300)
    .map((i: any) => ({
      name: String(i?.name ?? '').trim().slice(0, 500),
      qty: num(i?.qty) ?? 0,
      unit: i?.unit ? String(i.unit).slice(0, 32) : null,
      total: num(i?.total),
    }))
    .filter((i) => i.name && Number.isFinite(i.qty) && (i.total === null || Number.isFinite(i.total)));
};

export class DidoxFileDto {
  @ApiPropertyOptional({ enum: DIDOX_KINDS, description: "invoice — schyot-faktura, poa — ishonchnoma (faqat yuklashda)" })
  @IsOptional()
  @IsIn(DIDOX_KINDS as unknown as string[])
  kind?: DidoxKind;

  @ApiPropertyOptional({ description: "Fayl ichida ko'rsatilgan summa" })
  @IsOptional()
  @Transform(toNum)
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  amount?: number | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(64)
  invoice_number?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString()
  invoice_date?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  comment?: string | null;

  @ApiPropertyOptional({ description: 'Didox.uz hujjat ID (PDF tepasida)' })
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(64)
  doc_id?: string | null;

  @ApiPropertyOptional({ description: 'Ishonchnoma amal qilish muddati' })
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString()
  poa_valid_until?: string | null;

  @ApiPropertyOptional({ description: 'Ishonchnoma bergan korxona' })
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(255)
  poa_company?: string | null;

  @ApiPropertyOptional({ description: 'Ishonchnoma bergan korxona INN' })
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(32)
  poa_inn?: string | null;

  @ApiPropertyOptional({ description: "Schyot-faktura tovarlari (JSON massiv: name, qty, unit, total) — multipart'da matn bo'lib keladi" })
  @IsOptional()
  @Transform(toDidoxItems)
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  items?: Array<{ name: string; qty: number; unit?: string | null; total?: number | null }> | null;
}

// Yuklashdan oldin dublikatni tekshirish (fayl o'qilgandan keyin darhol)
export class DidoxCheckDto {
  @ApiPropertyOptional({ enum: DIDOX_KINDS }) @IsOptional() @IsIn(DIDOX_KINDS as unknown as string[])
  kind?: DidoxKind;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(64)
  invoice_number?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString()
  invoice_date?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(64)
  doc_id?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(32)
  poa_inn?: string | null;
}

export class SkladCheckDto {
  @ApiPropertyOptional({ description: 'Ombor izohi (masalan: 2 ta yetishmaydi)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
