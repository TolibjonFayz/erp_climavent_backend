import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// DIQQAT: global ValidationPipe `whitelist: true` bilan ishlaydi —
// validator dekoratorisiz maydon tanadan jimgina olib tashlanadi.
export class DogovorItemDto {
  @ApiProperty({ example: 'Вентилятор канальный ВК-160С' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'шт' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  qty: number;

  @ApiProperty({ example: 1062300 })
  @IsNumber()
  price: number;
}

export class CreateDogovorDto {
  @ApiProperty({ example: 30399, description: 'Document number' })
  @IsInt()
  @IsOptional()
  dogovor_number?: number;

  @ApiProperty({ example: '2026-07-24', description: 'Contract date' })
  @IsDateString()
  @IsNotEmpty()
  dogovor_date: string;

  @ApiProperty({ example: 'BELPHARM MCHJ XK', description: 'Client name' })
  @IsString()
  @IsNotEmpty()
  client_name: string;

  @ApiProperty({ example: 1189776, description: 'Total sum' })
  @IsNumber()
  dogovor_sum: number;

  @ApiProperty({ example: 'Open', description: 'Contract status' })
  @IsString()
  @IsOptional()
  dogovor_status?: string;

  @ApiProperty({ example: '305954304' })
  @IsString()
  @IsOptional()
  client_inn?: string;

  @ApiProperty({ example: '2026-07-25' })
  @IsDateString()
  @IsOptional()
  payment_date?: string;

  @ApiProperty({ example: 11400 })
  @IsNumber()
  @IsOptional()
  initial_payment?: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsOptional()
  prepayment_percent?: number;

  @ApiProperty({ example: '+998 90 8085551' })
  @IsString()
  @IsOptional()
  client_phone?: string;

  @ApiProperty({ example: 'Расулов Жамшид' })
  @IsString()
  @IsOptional()
  manager_name?: string;

  @ApiProperty({ example: 'г. Ташкент, ...' })
  @IsString()
  @IsOptional()
  client_address?: string;

  @ApiProperty({ example: 'KURBANGALIYEV I.K.' })
  @IsString()
  @IsOptional()
  contact_name?: string;

  @ApiProperty({ example: 'Директор' })
  @IsString()
  @IsOptional()
  contact_position?: string;

  @ApiProperty({ example: 'Головной офис УзНацбанка' })
  @IsString()
  @IsOptional()
  client_bank?: string;

  @ApiProperty({ example: '20214000400970065001' })
  @IsString()
  @IsOptional()
  client_account?: string;

  @ApiProperty({ example: '00450' })
  @IsString()
  @IsOptional()
  client_mfo?: string;

  @ApiProperty({ example: '326030101348' })
  @IsString()
  @IsOptional()
  client_vat_code?: string;

  @ApiProperty({ type: [DogovorItemDto], description: 'Contract line items' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DogovorItemDto)
  items?: DogovorItemDto[];

  @ApiProperty({ example: 15, description: 'Production time in banking days' })
  @IsInt()
  @IsOptional()
  production_days?: number;

  @ApiProperty({ example: 'Izoh' })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiProperty({ example: 'Ichki eslatma', description: 'Admin-only note' })
  @IsString()
  @IsOptional()
  admin_comment?: string;
}
