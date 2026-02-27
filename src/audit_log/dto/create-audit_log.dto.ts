import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAuditLogDto {
  @ApiProperty({ example: 1, description: 'Admin ID' })
  @IsNumber()
  admin_id: number;

  @ApiProperty({
    example: 'role | block | unblock | export | view',
    description: 'Action type',
  })
  @IsString()
  action: string;

  @ApiProperty({ example: 2, description: 'Target user ID', required: false })
  @IsNumber()
  @IsOptional()
  target_id?: number;

  @ApiProperty({
    example: 'Ali admin qilindi',
    description: 'Human-readable message',
  })
  @IsString()
  message: string;

  @ApiProperty({ example: '{"ip":"127.0.0.1"}', required: false })
  @IsString()
  @IsOptional()
  meta?: string;

  @ApiProperty({ example: 'info | success | warning | danger' })
  @IsString()
  @IsIn(['info', 'success', 'warning', 'danger'])
  @IsOptional()
  type?: string;
}
