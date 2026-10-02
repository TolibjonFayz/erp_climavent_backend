import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class HikDeviceDto {
  @ApiProperty({ example: 'DS-K1T341CMF20250224V030340ENGH4151011' })
  @IsString()
  device_serial: string;

  @ApiProperty({ example: '192.168.1.222' })
  @IsString()
  host: string;

  @ApiProperty({ example: 'in', description: 'in | out' })
  @IsIn(['in', 'out'])
  direction: string;

  @ApiProperty({ example: 1, description: 'Clock drift in seconds' })
  @IsOptional()
  @IsInt()
  clock_drift_sec?: number;
}

export class HikEmployeeDto {
  @ApiProperty({ example: '00000002' })
  @IsString()
  employee_no: string;

  @ApiProperty({ example: 'Fayzullayev Tolibjon' })
  @IsString()
  name: string;
}

export class HikEventDto {
  @ApiProperty({ example: 'DS-K1T341CMF20250224V030340ENGH4151011' })
  @IsString()
  device_serial: string;

  @ApiProperty({ example: 38056 })
  @IsInt()
  serial_no: number;

  @ApiProperty({ example: '00000002' })
  @IsString()
  employee_no: string;

  // Toshkent vaqti, zonasiz: terminal zonasi ilgari xato (+08:00) bo'lgani uchun agent uni tashlab yuboradi
  @ApiProperty({ example: '2026-10-02T09:02:18', description: 'Tashkent wall-clock time' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  time: string;
}

export class HikSyncDto {
  @ApiProperty({ type: [HikDeviceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HikDeviceDto)
  devices: HikDeviceDto[];

  @ApiProperty({ type: [HikEmployeeDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => HikEmployeeDto)
  employees: HikEmployeeDto[];

  @ApiProperty({ type: [HikEventDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => HikEventDto)
  events: HikEventDto[];
}

export class HikLinkDto {
  @ApiProperty({ example: 4, description: 'ERP user id, null = unlink' })
  @IsOptional()
  @IsInt()
  user_id: number | null;
}
