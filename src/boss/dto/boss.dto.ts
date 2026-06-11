import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTargetDto {
  @ApiProperty({ example: 4 })
  @IsInt()
  user_id: number;

  @ApiProperty({ example: '2026-06' })
  @IsString()
  month: string;

  @ApiProperty({ example: 'contracts' })
  @IsOptional()
  @IsIn(['contracts', 'trips', 'tasks'])
  metric?: string;

  @ApiProperty({ example: 10 })
  @IsOptional()
  @IsInt()
  target_value?: number;

  @ApiProperty({ example: 16 })
  @IsOptional()
  @IsInt()
  created_by?: number;
}

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Muhim e\'lon' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Ertaga majlis soat 9da' })
  @IsString()
  message: string;

  @ApiProperty({ example: 16 })
  @IsOptional()
  @IsInt()
  created_by?: number;
}

export class PromoteDto {
  @ApiProperty({ example: true, description: 'Make admin or not' })
  @IsBoolean()
  is_admin: boolean;
}
