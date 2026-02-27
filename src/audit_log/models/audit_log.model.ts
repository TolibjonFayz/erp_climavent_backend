import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  DataType,
  Model,
  Table,
  BelongsTo,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

interface AuditLogAtr {
  admin_id: number;
  action: string;
  target_id?: number;
  message: string;
  meta?: string;
  type?: string;
}

@Table({ tableName: 'audit_logs' })
export class AuditLog extends Model<AuditLog, AuditLogAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // ─── Kim bajardi (Admin) ───────────────────────────────
  @ForeignKey(() => User)
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, allowNull: false })
  admin_id: number;

  // ✅ as: 'admin' — alias majburiy, aks holda ikki BelongsTo conflict beradi
  @BelongsTo(() => User, { foreignKey: 'admin_id', as: 'admin' })
  admin: User;

  @ApiProperty({ example: 'role | block | unblock | export | view' })
  @Column({ type: DataType.STRING, allowNull: false })
  action: string;

  // ─── Kimga nisbatan (Target user) ─────────────────────
  @ForeignKey(() => User)
  @ApiProperty({ example: 2, required: false })
  @Column({ type: DataType.INTEGER, allowNull: true })
  target_id: number;

  // ✅ as: 'target' — alias majburiy
  @BelongsTo(() => User, { foreignKey: 'target_id', as: 'target' })
  target: User;

  @ApiProperty({ example: 'Ali admin qilindi' })
  @Column({ type: DataType.TEXT, allowNull: false })
  message: string;

  @ApiProperty({ example: '{"ip":"127.0.0.1"}', required: false })
  @Column({ type: DataType.TEXT, allowNull: true })
  meta: string;

  @ApiProperty({ example: 'info | success | warning | danger' })
  @Column({ type: DataType.STRING(20), defaultValue: 'info' })
  type: string;
}
