import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export const ATTENDANCE_STATUSES = [
  'direct_object',
  'office_then_object',
  'office',
  'absent',
  'dayoff',
];

export class CreateAttendanceDto {
  @ApiProperty({ example: 4, description: 'Employee id' })
  @IsInt()
  user_id: number;

  @ApiProperty({ example: '2026-06-11', description: 'Day (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiProperty({ example: 'office', description: 'Attendance status' })
  @IsOptional()
  @IsIn(ATTENDANCE_STATUSES)
  status?: string;

  @ApiProperty({ example: 8, description: 'Worked hours' })
  @IsOptional()
  @IsNumber()
  work_hours?: number;

  @ApiProperty({ example: '09:00', description: 'Check-in HH:mm' })
  @IsOptional()
  @IsString()
  check_in?: string;

  @ApiProperty({ example: '18:00', description: 'Check-out HH:mm' })
  @IsOptional()
  @IsString()
  check_out?: string;

  @ApiProperty({ example: 'Izoh', description: 'Note' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ example: 1, description: 'Admin id' })
  @IsOptional()
  @IsInt()
  created_by?: number;
}
