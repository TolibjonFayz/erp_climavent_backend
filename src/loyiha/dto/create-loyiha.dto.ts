import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LOYIHA_STATUSES } from '../models/loyiha.model';

// DIQQAT: global ValidationPipe `whitelist: true` bilan ishlaydi —
// validator dekoratorisiz maydon tanadan jimgina olib tashlanadi.
export class CreateLoyihaDto {
  @ApiProperty({ example: 101, description: 'Loyiha id (odatda avtomatik)' })
  @IsInt()
  @IsOptional()
  order_number?: number;

  @ApiProperty({ example: 'in_progress', description: 'in_progress | done' })
  @IsIn(LOYIHA_STATUSES as unknown as string[], {
    message: "Holat faqat 'in_progress' yoki 'done' bo'lishi mumkin",
  })
  @IsOptional()
  status?: string;

  @ApiProperty({ example: 'Rasulov Jamshid', description: 'Loyihani bergan menejer' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  manager_name?: string;

  @ApiProperty({ example: 'Akmal aka', description: 'Boshqa (tashqi) manba ismi' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  other_source?: string;

  @ApiProperty({ example: "Qo'shimcha ma'lumot" })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiProperty({ example: '+998 90 123 45 67', description: 'Mijoz raqami' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  contact_phone?: string;

  @ApiProperty({ example: 'Toshkent sh., Chilonzor', description: 'Mijoz manzili' })
  @IsString()
  @IsOptional()
  contact_address?: string;

  @ApiProperty({ example: 'VRF', description: "O'rnatiladigan sistema" })
  @IsString()
  @IsOptional()
  system_info?: string;

  @ApiProperty({ example: 1250.5, description: 'Kvadratura (m2)' })
  @IsNumber()
  @IsOptional()
  area?: number;

  @ApiProperty({ example: 7, description: 'Daraja 1-10' })
  @IsInt()
  @Min(1, { message: "Daraja 1 dan 10 gacha bo'lishi kerak" })
  @Max(10, { message: "Daraja 1 dan 10 gacha bo'lishi kerak" })
  @IsOptional()
  difficulty?: number;

  // ─── KP ───
  @ApiProperty({ example: '30399', description: 'KP raqami' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  kp_number?: string;

  @ApiProperty({ example: 1189776, description: 'KP summasi' })
  @IsNumber()
  @IsOptional()
  kp_sum?: number;

  @ApiProperty({ example: '2026-07-24', description: 'KP sanasi' })
  @IsDateString()
  @IsOptional()
  kp_date?: string;

  // ─── Dogovor ───
  @ApiProperty({ example: '30399/7', description: 'Dogovor raqami' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  dogovor_number?: string;

  @ApiProperty({ example: 1189776, description: 'Dogovor summasi' })
  @IsNumber()
  @IsOptional()
  dogovor_sum?: number;

  @ApiProperty({ example: '2026-08-01', description: 'Dogovor sanasi' })
  @IsDateString()
  @IsOptional()
  dogovor_date?: string;
}
