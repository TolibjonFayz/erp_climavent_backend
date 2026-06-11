import { ApiProperty } from '@nestjs/swagger';

import {
  Table,
  Model,
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

interface TaskAtr {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  deadline?: string;
  assigned_to: number;
  created_by?: number;
  completed_at?: Date | null;
}

@Table({ tableName: 'tasks' })
export class Tasks extends Model<Tasks, TaskAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 'Smeta tayyorlash', description: 'Task title' })
  @Column({ type: DataType.STRING, allowNull: false })
  title: string;

  @ApiProperty({ example: 'Mijoz uchun...', description: 'Task description' })
  @Column({ type: DataType.TEXT, allowNull: true })
  description: string;

  @ApiProperty({ example: 'high', description: 'high | medium | low' })
  @Column({ type: DataType.STRING, defaultValue: 'medium' })
  priority: string;

  @ApiProperty({ example: 'todo', description: 'todo | in_progress | done' })
  @Column({ type: DataType.STRING, defaultValue: 'todo' })
  status: string;

  @ApiProperty({ example: '2026-06-20', description: 'Deadline date' })
  @Column({ type: DataType.DATEONLY, allowNull: true })
  deadline: string;

  // Vazifa biriktirilgan xodim
  @ForeignKey(() => User)
  @ApiProperty({ example: 2, description: 'Employee the task is assigned to' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  assigned_to: number;
  @BelongsTo(() => User, { foreignKey: 'assigned_to', as: 'assignee' })
  assignee: User;

  // Vazifani bergan admin
  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'Admin who created the task' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  created_by: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  creator: User;

  @ApiProperty({ example: '2026-06-19T10:00:00Z', description: 'Completed at' })
  @Column({ type: DataType.DATE, allowNull: true })
  completed_at: Date | null;
}
