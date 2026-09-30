import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EXCLUDE_REASONS } from '../models/amo-excluded-phone.model';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// clients — faqat mijozlar (standart), all — hammasi, excluded — faqat mijoz emaslar
export const CALL_SCOPES = ['clients', 'all', 'excluded'] as const;
export type CallScope = (typeof CALL_SCOPES)[number];

export class StatsQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Davr boshi (YYYY-MM-DD). Default: shu oyning 1-kuni',
  })
  @IsOptional()
  @Matches(DAY, { message: "from YYYY-MM-DD formatida bo'lishi kerak" })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-28',
    description: 'Davr oxiri (YYYY-MM-DD, shu kun ham kiradi). Default: bugun',
  })
  @IsOptional()
  @Matches(DAY, { message: "to YYYY-MM-DD formatida bo'lishi kerak" })
  to?: string;

  @ApiPropertyOptional({ description: 'amoCRM menejer id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsible_user_id?: number;

  @ApiPropertyOptional({ description: 'amoCRM voronka id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pipeline_id?: number;

  @ApiPropertyOptional({ enum: CALL_SCOPES, default: 'clients' })
  @IsOptional()
  @IsIn(CALL_SCOPES as unknown as string[])
  scope?: CallScope;
}

class PagedQueryDto extends StatsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

// Qo'ng'iroqlar guruhi:
//  in_answered — kiruvchi, suhbat bo'ldi; in_missed — kiruvchi, biz javob bermadik;
//  out_answered — chiquvchi, suhbat bo'ldi; out_no_answer — chiquvchi, mijoz javob bermadi
export const CALL_KINDS = [
  'all',
  'answered',
  'in',
  'in_answered',
  'in_missed',
  'out',
  'out_answered',
  'out_no_answer',
] as const;
export type CallKind = (typeof CALL_KINDS)[number];

export class CallsListQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: CALL_KINDS, default: 'all' })
  @IsOptional()
  @IsIn(CALL_KINDS as unknown as string[])
  kind?: CallKind;

  @ApiPropertyOptional({
    description: 'amoCRM call_status (1..7), 0 — belgilanmagan',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(7)
  status?: number;

  @ApiPropertyOptional({ description: "phone — raqam bo'yicha guruhlash" })
  @IsOptional()
  @IsIn(['phone'])
  group?: 'phone';

  @ApiPropertyOptional({
    description: 'true — faqat qayta aloqa qilinmaganlar (in_missed uchun)',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  not_called_back?: string;

  @ApiPropertyOptional({
    description: "Telefoniya manbasi; bo'sh satr — noma'lum",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @ApiPropertyOptional({
    description:
      'Chiqarish sababi: manual | staff | amo_tag | not_ours | internal',
  })
  @IsOptional()
  @IsIn(['manual', 'staff', 'amo_tag', 'not_ours', 'internal'])
  reason?: string;
}

export class SuspiciousQueryDto {
  @ApiPropertyOptional({ default: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(1000)
  min_calls?: number;
}

export class ExcludePhoneDto {
  @ApiPropertyOptional({ example: '+998 90 123 45 67' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/\d/, { message: 'Telefon raqami kiritilishi kerak' })
  phone: string;

  @ApiPropertyOptional({ enum: EXCLUDE_REASONS })
  @IsIn(EXCLUDE_REASONS as unknown as string[])
  reason: string;

  @ApiPropertyOptional({ example: 'Omborchi Akmal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class LeadsListQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({
    description: "Bosqich id (142 — yutilgan, 143 — yo'qotilgan)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  status_id?: number;

  @ApiPropertyOptional({
    description: "Yo'qotish sababi id, 0 — sabab ko'rsatilmagan",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  loss_reason_id?: number;
}
