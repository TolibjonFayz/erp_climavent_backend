import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { SkladItem } from './sklad-item.model';

export interface SkladContractLineAtr {
  row_no?: number | null;
  dogovor_number?: string | null;
  item_name: string;
  item_id?: number | null;
  qty_contract?: number | null;
  qty_in?: number | null;
  qty_out?: number | null;
}

// "договора на складе" varag'i: shartnoma bo'yicha omborda saqlanayotgan tovarlar.
// Qayta sinxronda jadval to'liq almashtiriladi.
@Table({ tableName: 'sklad_contract_lines', timestamps: true })
export class SkladContractLine extends Model<
  SkladContractLine,
  SkladContractLineAtr
> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare row_no: number | null;

  @ApiProperty({ example: '198' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare dogovor_number: string | null;

  @ApiProperty({ example: 'Вентилятор ВР 6-45-8-О-5-18,5/1500/1100*' })
  @Column({ type: DataType.TEXT, allowNull: false })
  declare item_name: string;

  @ForeignKey(() => SkladItem)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL' })
  declare item_id: number | null;

  @BelongsTo(() => SkladItem)
  declare item?: SkladItem;

  @ApiProperty({ example: 1 })
  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare qty_contract: number | null;

  @ApiProperty({ example: 1 })
  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare qty_in: number | null;

  @ApiProperty({ example: 0 })
  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare qty_out: number | null;
}
