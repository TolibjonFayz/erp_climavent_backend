import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Xodim keyingi bosqichga o'tish uchun tasdiq so'raydi
export class RequestApprovalDto {
  @ApiProperty({ example: 'in_progress', description: 'Requested status' })
  @IsIn(['in_progress', 'done'])
  status: string;

  @ApiProperty({ example: 'Mijoz hujjatlarni berdi', description: 'Optional note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
