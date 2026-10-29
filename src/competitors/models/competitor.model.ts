import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { CompetitorEncounter } from './competitor-encounter.model';

export interface CompetitorAtr {
  name: string;
  brands?: string | null;
  website?: string | null;
  phone?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  note?: string | null;
  created_by?: number | null;
}

// Raqib kompaniyalar katalogi — barcha xodimlar uchun umumiy (bir raqib bir marta yoziladi)
@Table({ tableName: 'competitors', timestamps: true })
export class Competitor extends Model<Competitor, CompetitorAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 'Vent Klimat Kontrol' })
  @Column({ type: DataType.STRING(160), allowNull: false, unique: true })
  declare name: string;

  @ApiProperty({ example: 'Systemair, Salda', description: 'Sotadigan brendlari' })
  @Column({ type: DataType.STRING(300) })
  declare brands: string | null;

  @Column({ type: DataType.STRING(200) })
  declare website: string | null;

  @Column({ type: DataType.STRING(64) })
  declare phone: string | null;

  @Column({ type: DataType.TEXT })
  declare strengths: string | null;

  @Column({ type: DataType.TEXT })
  declare weaknesses: string | null;

  @Column({ type: DataType.TEXT })
  declare note: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER })
  declare created_by: number | null;

  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator?: User;

  @HasMany(() => CompetitorEncounter)
  declare encounters?: CompetitorEncounter[];
}
