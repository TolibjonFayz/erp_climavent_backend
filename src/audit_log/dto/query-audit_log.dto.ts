import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryAuditLogDto {
  @ApiPropertyOptional({ example: 'role | block | export' })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsNumber()
  @Type(() => Number) // ← query param string keladi, numberi ga o'giradi
  @IsOptional()
  target_id?: number;

  @ApiPropertyOptional({ example: 'Ali' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  offset?: number;
}
