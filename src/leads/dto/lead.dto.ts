import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { LEAD_SOURCES, LEAD_STATUSES, LeadSource, LeadStatus } from '../models/lead.model';

export class LeadQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(LEAD_SOURCES as unknown as string[]) source?: LeadSource;
  @ApiPropertyOptional() @IsOptional() @IsIn(LEAD_STATUSES as unknown as string[]) status?: LeadStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() manager_id?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class CreateLeadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(LEAD_SOURCES as unknown as string[]) source?: LeadSource;
}

export class UpdateLeadDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(LEAD_STATUSES as unknown as string[]) status?: LeadStatus;
  @ApiPropertyOptional({ description: "null — mas'ulni olib tashlash" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  manager_id?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) note?: string;
}

export class SetWebhookDto {
  @ApiPropertyOptional({ example: 'https://erpclimaventbackend-production.up.railway.app' })
  @IsUrl({ require_tld: false })
  base_url: string;
}
