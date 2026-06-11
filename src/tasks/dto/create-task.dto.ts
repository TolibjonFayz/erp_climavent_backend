import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Smeta tayyorlash', description: 'Task title' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Mijoz uchun...', description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'high', description: 'high | medium | low' })
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  priority?: string;

  @ApiProperty({ example: 'todo', description: 'todo | in_progress | done' })
  @IsOptional()
  @IsIn(['todo', 'in_progress', 'done'])
  status?: string;

  @ApiProperty({ example: '2026-06-20', description: 'Deadline (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiProperty({ example: 2, description: 'Employee id the task is assigned to' })
  @IsInt()
  assigned_to: number;

  @ApiProperty({ example: 1, description: 'Admin id who created the task' })
  @IsOptional()
  @IsInt()
  created_by?: number;
}
