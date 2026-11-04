import { Column, DataType, Model, Table } from 'sequelize-typescript';

export interface OtgruzkaSettingAtr {
  key: string;
  value: any;
}

// Otgruzka sozlamalari (kalit -> JSON): mode, last_sync.
@Table({ tableName: 'otgruzka_settings', timestamps: true })
export class OtgruzkaSetting extends Model<OtgruzkaSetting, OtgruzkaSettingAtr> {
  @Column({ type: DataType.STRING(64), primaryKey: true })
  declare key: string;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare value: any;
}
