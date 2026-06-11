import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// Xodim faqat statusni o'zgartiradi
export class UpdateTaskStatusDto {
  @ApiProperty({ example: 'in_progress', description: 'todo | in_progress | done' })
  @IsIn(['todo', 'in_progress', 'done'])
  status: string;
}
