import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ENCOUNTER_OUTCOMES,
  ENCOUNTER_REASONS,
  EncounterOutcome,
  EncounterReason,
} from '../models/competitor-encounter.model';

export class CreateCompetitorDto {
  @ApiProperty({ example: 'Vent Klimat Kontrol' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'Systemair, Salda' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  brands?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  weaknesses?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCompetitorDto extends PartialType(CreateCompetitorDto) {}

export class CreateEncounterDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  competitor_id: number;

  @ApiPropertyOptional({ description: "ERP'dagi mijoz" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  partner_id?: number;

  @ApiPropertyOptional({ description: "Mijoz ERP'da bo'lmasa — nomi" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  client_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  kp_number?: number;

  @ApiProperty({ example: '2026-10-29' })
  @IsDateString()
  encounter_date: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  their_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  our_price?: number;

  @ApiProperty({ enum: ENCOUNTER_OUTCOMES })
  @IsIn(ENCOUNTER_OUTCOMES as unknown as string[])
  outcome: EncounterOutcome;

  @ApiPropertyOptional({ enum: ENCOUNTER_REASONS })
  @IsOptional()
  @IsIn(ENCOUNTER_REASONS as unknown as string[])
  reason?: EncounterReason;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateEncounterDto extends PartialType(CreateEncounterDto) {}

export class EncounterQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  competitor_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  partner_id?: number;
}
