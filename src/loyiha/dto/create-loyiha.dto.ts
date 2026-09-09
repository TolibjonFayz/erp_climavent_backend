import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// DIQQAT: global ValidationPipe `whitelist: true` bilan ishlaydi —
// validator dekoratorisiz maydon tanadan jimgina olib tashlanadi.
export class CreateLoyihaDto {
  @ApiProperty({ example: 101, description: 'Tartib raqami' })
  @IsInt()
  @IsOptional()
  order_number?: number;

  @ApiProperty({ example: 5, description: 'Loyihani bergan menejer (bizning xodim)' })
  @IsInt()
  @IsOptional()
  manager_id?: number;

  @ApiProperty({ example: 'Akmal aka', description: 'Boshqa (tashqi) manba ismi' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  other_source?: string;

  @ApiProperty({ example: "Qo'shimcha ma'lumot" })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiProperty({ example: '+998 90 123 45 67' })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  contact_phone?: string;

  @ApiProperty({ example: 'info@example.uz' })
  @IsEmail({}, { message: "Email formati noto'g'ri" })
  @IsOptional()
  contact_email?: string;

  @ApiProperty({ example: 'Toshkent sh., Chilonzor' })
  @IsString()
  @IsOptional()
  contact_address?: string;

  @ApiProperty({ example: 'VRF, kanalli ventilyatsiya' })
  @IsString()
  @IsOptional()
  system_info?: string;

  @ApiProperty({ example: 1250.5, description: 'Kvadratura (m2)' })
  @IsNumber()
  @IsOptional()
  area?: number;

  @ApiProperty({ example: 7, description: "Og'irlik darajasi 1-10" })
  @IsInt()
  @Min(1, { message: "Baho 1 dan 10 gacha bo'lishi kerak" })
  @Max(10, { message: "Baho 1 dan 10 gacha bo'lishi kerak" })
  @IsOptional()
  difficulty?: number;
}
