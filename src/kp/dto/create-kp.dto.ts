import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateKpDto {
  @ApiProperty({ example: 12000, description: 'External document number' })
  @IsInt()
  @IsOptional()
  kp_number?: number;

  @ApiProperty({ example: 'Open', description: 'Status of KP' })
  @IsString()
  @IsNotEmpty()
  kp_status: string;

  @ApiProperty({ example: 'John Doe', description: 'Client name' })
  @IsString()
  @IsNotEmpty()
  client_name: string;

  @ApiProperty({ example: '2023-06-01', description: 'Date of KP' })
  @IsDateString()
  @IsNotEmpty()
  kp_date: string;

  @ApiProperty({ example: 'Jane Smith', description: 'Manager name' })
  @IsString()
  @IsNotEmpty()
  manager_name: string;

  @ApiProperty({ example: 1000, description: 'Sum of KP' })
  @IsNumber()
  @IsNotEmpty()
  kp_sum: number;

  @ApiProperty({ example: '2023-07-01', description: 'Next contract date' })
  @IsString()
  @IsOptional()
  dogovor_next?: string;

  @ApiProperty({ example: '2023-08-01', description: 'Date the document was closed' })
  @IsDateString()
  @IsOptional()
  closed_date?: string;

  @ApiProperty({ example: 'This is a comment', description: 'Comment' })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiProperty({ example: 'Ichki eslatma', description: 'Admin-only internal note' })
  @IsString()
  @IsOptional()
  admin_comment?: string;
}
