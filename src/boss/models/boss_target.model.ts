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

interface BossTargetAtr {
  user_id: number;
  month: string;
  metric?: string;
  target_value?: number;
  created_by?: number;
}

@Table({ tableName: 'boss_targets' })
export class BossTarget extends Model<BossTarget, BossTargetAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @ApiProperty({ example: 4, description: 'Employee id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  user_id: number;
  @BelongsTo(() => User, { foreignKey: 'user_id', as: 'employee' })
  employee: User;

  @ApiProperty({ example: '2026-06', description: 'Month (YYYY-MM)' })
  @Column({ type: DataType.STRING, allowNull: false })
  month: string;

  // contracts | trips | tasks
  @ApiProperty({ example: 'contracts', description: 'Metric' })
  @Column({ type: DataType.STRING, defaultValue: 'contracts' })
  metric: string;

  @ApiProperty({ example: 10, description: 'Target value' })
  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  target_value: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  created_by: number;
}
