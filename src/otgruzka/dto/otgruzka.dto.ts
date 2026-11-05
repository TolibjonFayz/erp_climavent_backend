import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
