import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class StatsQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Davr boshi (YYYY-MM-DD). Default: shu oyning 1-kuni',
  })
  @IsOptional()
  @Matches(DAY, { message: "from YYYY-MM-DD formatida bo'lishi kerak" })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-28',
    description: 'Davr oxiri (YYYY-MM-DD, shu kun ham kiradi). Default: bugun',
  })
  @IsOptional()
  @Matches(DAY, { message: "to YYYY-MM-DD formatida bo'lishi kerak" })
  to?: string;

  @ApiPropertyOptional({ description: 'amoCRM menejer id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsible_user_id?: number;

  @ApiPropertyOptional({ description: 'amoCRM voronka id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pipeline_id?: number;
}
