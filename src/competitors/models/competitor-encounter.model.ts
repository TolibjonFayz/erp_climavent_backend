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
import { Partners } from 'src/partners/models/partner.model';
import { Competitor } from './competitor.model';

export const ENCOUNTER_OUTCOMES = ['won', 'lost', 'pending'] as const;
export type EncounterOutcome = (typeof ENCOUNTER_OUTCOMES)[number];

// Yutqazish/yutish sababi — hisobotda guruhlash uchun qat'iy ro'yxat, tafsiloti `note`da
export const ENCOUNTER_REASONS = ['price', 'deadline', 'quality', 'relationship', 'other'] as const;
export type EncounterReason = (typeof ENCOUNTER_REASONS)[number];

export interface CompetitorEncounterAtr {
  competitor_id: number;
  partner_id?: number | null;
  client_name?: string | null;
  kp_number?: number | null;
  encounter_date: string;
  their_price?: number | null;
  our_price?: number | null;
  outcome: EncounterOutcome;
  reason?: EncounterReason | null;
  note?: string | null;
  created_by: number;
}

// Bitta bitimda raqib bilan to'qnashuv: kimga, qancha narxda, nima bilan tugadi
@Table({ tableName: 'competitor_encounters', timestamps: true })
export class CompetitorEncounter extends Model<CompetitorEncounter, CompetitorEncounterAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => Competitor)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare competitor_id: number;

  @BelongsTo(() => Competitor, { onDelete: 'CASCADE' })
  declare competitor?: Competitor;

  // Mijoz ERP'da bo'lsa — bog'lanadi (mijoz kartasida ko'rinadi), bo'lmasa nomi matn bilan
  @ForeignKey(() => Partners)
  @Column({ type: DataType.INTEGER })
  declare partner_id: number | null;

  @BelongsTo(() => Partners, { onDelete: 'SET NULL' })
  declare partner?: Partners;

  @Column({ type: DataType.STRING(200) })
  declare client_name: string | null;

  @Column({ type: DataType.INTEGER })
  declare kp_number: number | null;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare encounter_date: string;

  @ApiProperty({ example: 120000000, description: "Raqib narxi (so'm)" })
  @Column({ type: DataType.DECIMAL(18, 2) })
  declare their_price: number | null;

  @ApiProperty({ example: 135000000, description: "Bizning narx (so'm)" })
  @Column({ type: DataType.DECIMAL(18, 2) })
  declare our_price: number | null;

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'pending' })
  declare outcome: EncounterOutcome;

  @Column({ type: DataType.STRING(16) })
  declare reason: EncounterReason | null;

  @Column({ type: DataType.TEXT })
  declare note: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare created_by: number;

  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator?: User;
}
