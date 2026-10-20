import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// DIQQAT: global ValidationPipe `whitelist: true` — dekoratorsiz maydon jimgina
// tashlab yuboriladi. Har bir maydonga validator qo'yish shart.

export const MANUAL_MOVEMENT_TYPES = ['in', 'out', 'reserve', 'release', 'adjust'] as const;

export class CreateMovementDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  item_id: number;

  @ApiProperty({ example: 'out', enum: MANUAL_MOVEMENT_TYPES })
  @IsIn(MANUAL_MOVEMENT_TYPES as unknown as string[])
  type: (typeof MANUAL_MOVEMENT_TYPES)[number];

  @ApiProperty({ example: 3, description: "Musbat; faqat 'adjust' manfiy bo'lishi mumkin" })
  @IsNumber()
  qty: number;

  @ApiPropertyOptional({ example: '2026-10-20' })
  @IsOptional()
  @IsDateString()
  move_date?: string;

  @ApiPropertyOptional({ example: '30399' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  dogovor_number?: string;

  @ApiPropertyOptional({ example: 'OOO Mijoz' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  counterparty?: string;

  @ApiPropertyOptional({ example: 'NK-128' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doc_number?: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  trace_id?: string;

  @ApiPropertyOptional({ example: 'Izoh' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  // Admin qoldiqdan ko'p chiqim/rezervga ruxsat bera oladi
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class CreateItemDto {
  @ApiProperty({ example: 'ВКП 70х40-4D35,5 3/1400' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string;

  @ApiPropertyOptional({ example: 'Вентильяторы' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  group_name?: string;

  @ApiPropertyOptional({ example: 'dona' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sap_code?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  min_qty?: number;
}

export class UpdateItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  group_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sap_code?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  min_qty?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class AddSourceDto {
  @ApiProperty({
    example: 'https://docs.google.com/spreadsheets/d/<id>/edit#gid=41866279',
    description: 'Varaq havolasi (gid bilan) yoki faqat gid',
  })
  @IsString()
  @IsNotEmpty()
  link: string;

  @ApiProperty({ example: 'month', enum: ['month', 'contracts'] })
  @IsIn(['month', 'contracts'])
  kind: 'month' | 'contracts';

  @ApiPropertyOptional({ example: 'Ноябрь2026' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;
}

export class SyncDto {
  @ApiPropertyOptional({ example: 2, description: "Bo'lmasa — barcha manbalar" })
  @IsOptional()
  @IsInt()
  source_id?: number;
}

export class UpdateSettingsDto {
  @ApiProperty({ example: 'mirror', enum: ['mirror', 'live'] })
  @IsIn(['mirror', 'live'])
  mode: 'mirror' | 'live';
}
