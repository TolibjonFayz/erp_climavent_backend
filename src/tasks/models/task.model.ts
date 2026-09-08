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

// DIQQAT: har bir maydon `declare` bilan e'lon qilinishi SHART.
// tsconfig target ES2023 bo'lgani uchun `declare`siz maydon class field
// initializer'ga aylanadi va Sequelize'ning getter/setter'ini soyalab qo'yadi —
// natijada `task.status` kodda undefined bo'ladi (JSON'da esa to'g'ri ko'rinadi).
@Table({ tableName: 'tasks' })
export class Tasks extends Model<Tasks, TaskAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 'Smeta tayyorlash', description: 'Task title' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare title: string;

  @ApiProperty({ example: 'Mijoz uchun...', description: 'Task description' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string;

  @ApiProperty({ example: 'high', description: 'high | medium | low' })
  @Column({ type: DataType.STRING, defaultValue: 'medium' })
  declare priority: string;

  @ApiProperty({ example: 'todo', description: 'todo | in_progress | done' })
  @Column({ type: DataType.STRING, defaultValue: 'todo' })
  declare status: string;

  @ApiProperty({ example: '2026-06-20', description: 'Deadline date' })
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare deadline: string;

  // Vazifa biriktirilgan xodim
  @ForeignKey(() => User)
  @ApiProperty({ example: 2, description: 'Employee the task is assigned to' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare assigned_to: number;
  @BelongsTo(() => User, { foreignKey: 'assigned_to', as: 'assignee' })
  declare assignee: User;

  // Vazifani bergan admin
  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'Admin who created the task' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator: User;

  @ApiProperty({ example: '2026-06-19T10:00:00Z', description: 'Completed at' })
  @Column({ type: DataType.DATE, allowNull: true })
  declare completed_at: Date | null;

  // ─── Tasdiqlash oqimi ───────────────────────────────────────────────
  // Xodim keyingi bosqichga o'tmoqchi bo'lsa to'g'ridan-to'g'ri o'tolmaydi:
  // pending_status to'ladi va tasdiqlovchi (Gulshoda / admin) qaror qilguncha kutadi.

  @ApiProperty({
    example: 'in_progress',
    description: 'Requested next status, null = no pending request',
  })
  @Column({ type: DataType.STRING, allowNull: true })
  declare pending_status: string | null;

  @ApiProperty({ example: 'Mijoz hujjatlarni berdi', description: 'Employee note' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare approval_note: string | null;

  @ApiProperty({ description: 'When the employee asked for approval' })
  @Column({ type: DataType.DATE, allowNull: true })
  declare approval_requested_at: Date | null;

  @ForeignKey(() => User)
  @ApiProperty({ example: 7, description: 'Who approved/rejected last' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare approval_decided_by: number | null;
  @BelongsTo(() => User, { foreignKey: 'approval_decided_by', as: 'approver' })
  declare approver: User;

  @ApiProperty({ description: 'When the request was approved/rejected' })
  @Column({ type: DataType.DATE, allowNull: true })
  declare approval_decided_at: Date | null;

  @ApiProperty({ example: 'rejected', description: 'approved | rejected | null' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare approval_result: string | null;

  @ApiProperty({ example: 'Hujjat yetarli emas', description: 'Rejection reason' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare approval_reject_reason: string | null;
}
