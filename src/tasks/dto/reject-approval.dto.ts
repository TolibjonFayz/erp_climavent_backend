import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Tasdiqlovchi so'rovni rad etadi
export class RejectApprovalDto {
  @ApiProperty({ example: 'Hujjatlar yetarli emas', description: 'Rejection reason' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
