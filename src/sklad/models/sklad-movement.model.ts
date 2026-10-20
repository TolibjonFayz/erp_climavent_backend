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
import { SkladItem } from './sklad-item.model';

// snapshot — qoldiqni aniq qiymatga o'rnatadi (oy boshi / inventarizatsiya).
// in — kirim, out — chiqim (otgruzka), reserve — band qilish (mavjuddan ayriladi,
// jadvaldagidek), release — banddan qaytarish, adjust — qo'lda tuzatish (+/-).
export const MOVEMENT_TYPES = [
  'snapshot',
  'in',
  'out',
  'reserve',
  'release',
  'adjust',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type MovementSource = 'sheet' | 'erp';

export interface SkladMovementAtr {
  item_id: number;
  type: MovementType;
  qty: number;
  move_date: string;
  dogovor_number?: string | null;
  counterparty?: string | null;
  doc_number?: string | null;
  trace_id?: string | null;
  comment?: string | null;
  source: MovementSource;
  source_period?: string | null;
  created_by?: number | null;
}

@Table({
  tableName: 'sklad_movements',
  timestamps: true,
  indexes: [
    { fields: ['item_id', 'move_date'] },
    { fields: ['move_date'] },
    { fields: ['source', 'source_period'] },
  ],
})
export class SkladMovement extends Model<SkladMovement, SkladMovementAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => SkladItem)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare item_id: number;

  @BelongsTo(() => SkladItem)
  declare item?: SkladItem;

  @ApiProperty({ example: 'out', enum: MOVEMENT_TYPES })
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare type: MovementType;

  // Doim musbat; faqat `adjust` manfiy bo'lishi mumkin
  @ApiProperty({ example: 5 })
  @Column({ type: DataType.DOUBLE, allowNull: false })
  declare qty: number;

  @ApiProperty({ example: '2026-10-20' })
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare move_date: string;

  @ApiProperty({ example: '30399', description: 'Shartnoma raqami' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare dogovor_number: string | null;

  @ApiProperty({ example: 'OOO Mijoz', description: 'Kimdan / kimga' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare counterparty: string | null;

  @ApiProperty({ example: 'NK-128', description: 'Nakladnoy / schet-faktura raqami' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare doc_number: string | null;

  // Liddan schet-fakturagacha yagona kuzatuv ID'si (kelajakdagi CRM bog'lanishi uchun)
  @ApiProperty({ example: null })
  @Column({ type: DataType.STRING(64), allowNull: true })
  declare trace_id: string | null;

  @ApiProperty({ example: 'Izoh' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare comment: string | null;

  // sheet — Google Sheets'dan import (qayta sinxronda o'chirib qayta yoziladi),
  // erp — ERP'da kiritilgan
  @ApiProperty({ example: 'erp' })
  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'erp' })
  declare source: MovementSource;

  // sheet yozuvlari qaysi oy varag'idan kelgani ('2026-10')
  @Column({ type: DataType.STRING(7), allowNull: true })
  declare source_period: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by: number | null;

  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator?: User;
}
