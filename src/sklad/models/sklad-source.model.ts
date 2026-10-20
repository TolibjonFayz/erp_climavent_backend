import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

export interface SkladSourceAtr {
  kind: 'month' | 'contracts';
  sheet_id: string;
  gid: string;
  title?: string | null;
  period?: string | null;
  last_synced_at?: Date | null;
  last_result?: any;
}

// Sinxronlanadigan Google Sheets varaqlari (har oy yangi varaq qo'shiladi).
@Table({ tableName: 'sklad_sources', timestamps: true })
export class SkladSource extends Model<SkladSource, SkladSourceAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // month — oylik qoldiq varag'i, contracts — "договора на складе"
  @ApiProperty({ example: 'month' })
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare kind: 'month' | 'contracts';

  @Column({ type: DataType.STRING, allowNull: false })
  declare sheet_id: string;

  @ApiProperty({ example: '41866279' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare gid: string;

  @ApiProperty({ example: 'Октябрь2026' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare title: string | null;

  // Varaq sarlavhasidan aniqlangan oy ('2026-10')
  @ApiProperty({ example: '2026-10' })
  @Column({ type: DataType.STRING(7), allowNull: true })
  declare period: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare last_synced_at: Date | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare last_result: any;
}
