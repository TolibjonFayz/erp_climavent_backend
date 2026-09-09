import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Faqat "working" bo'limidagi fayl uchun — arxiv fayllari tahrirlanmaydi
export class UpdateFileDto {
  @ApiProperty({ example: 'Yakuniy versiya', description: 'File label' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ example: 'Chizma-2.pdf', description: 'Display file name' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  file_name?: string;
}
