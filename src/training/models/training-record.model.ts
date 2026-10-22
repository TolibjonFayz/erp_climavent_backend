import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

export interface TrainingRecordAtr {
  user_id: number;
  module: string;
  kind: 'tutorial' | 'quiz';
  quiz_version?: number | null;
  correct?: number | null;
  total?: number | null;
  score_pct?: number | null;
  passed?: boolean | null;
  duration_sec?: number | null;
  details?: any;
}

// Xodimni o'qitish dalillari: yo'riqnomani oxirigacha ko'rgani va test urinishlari.
// O'ZGARMAS jurnal — tahrirlash/o'chirish endpointi yo'q (xodim "menga o'rgatishmagan"
// desa, shu yozuvlar isbot bo'ladi). Har urinishda savollar va tanlangan javoblar saqlanadi.
@Table({
  tableName: 'training_records',
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ['module', 'user_id'] }],
})
export class TrainingRecord extends Model<TrainingRecord, TrainingRecordAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare user_id: number;

  @BelongsTo(() => User, { foreignKey: 'user_id', as: 'user' })
  declare user?: User;

  @ApiProperty({ example: 'sklad' })
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare module: string;

  // tutorial — yo'riqnoma oxirigacha ko'rildi; quiz — test urinishi
  @ApiProperty({ example: 'quiz' })
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare kind: 'tutorial' | 'quiz';

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare quiz_version: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare correct: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare total: number | null;

  @ApiProperty({ example: 90 })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare score_pct: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare passed: boolean | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare duration_sec: number | null;

  // tutorial: { steps } ; quiz: { lang, answers: [{ q, chosen, ok }] }
  @Column({ type: DataType.JSONB, allowNull: true })
  declare details: any;
}
