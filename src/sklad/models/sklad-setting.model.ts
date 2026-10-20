import { Column, DataType, Model, Table } from 'sequelize-typescript';

export interface SkladSettingAtr {
  key: string;
  value: any;
}

// Ombor sozlamalari (kalit -> JSON). Hozircha: mode = 'mirror' | 'live'.
@Table({ tableName: 'sklad_settings', timestamps: true })
export class SkladSetting extends Model<SkladSetting, SkladSettingAtr> {
  @Column({ type: DataType.STRING(64), primaryKey: true })
  declare key: string;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare value: any;
}
