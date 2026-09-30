import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
