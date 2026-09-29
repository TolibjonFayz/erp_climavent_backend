import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoCallAtr {
  id: number;
  entity_type: string;
  entity_id: number;
  direction: string;
  uniq?: string | null;
  call_status?: number | null;
  call_result?: string | null;
  duration?: number;
  phone?: string | null;
  responsible_user_id?: number | null;
  amo_created_at: Date;
  amo_updated_at: Date;
}

// Qo'ng'iroqlar — amoCRM'dagi call_in / call_out izohlari (notes).
// Qo'ng'iroq sdelka, kontakt yoki kompaniyaga biriktirilgan bo'lishi mumkin,
// shuning uchun kalit = (id, entity_type).
@Table({
  tableName: 'amo_calls',
  timestamps: true,
  indexes: [
    { fields: ['amo_created_at'] },
    { fields: ['call_status'] },
    { fields: ['responsible_user_id'] },
  ],
})
export class AmoCall extends Model<AmoCall, AmoCallAtr> {
  @Column({ type: DataType.BIGINT, primaryKey: true })
  declare id: number;

  // leads | contacts | companies
  @Column({ type: DataType.STRING(16), primaryKey: true })
  declare entity_type: string;

  @Column({ type: DataType.BIGINT, allowNull: false })
  declare entity_id: number;

  // in | out
  @Column({ type: DataType.STRING(8), allowNull: false })
  declare direction: string;

  // Telefoniyadagi qo'ng'iroq id'si. Bitta qo'ng'iroq ham kontaktga, ham
  // sdelkaga yozilishi mumkin — statistikada shu bo'yicha takrorlar olib tashlanadi.
  @Column({ type: DataType.STRING(255), allowNull: true })
  declare uniq?: string | null;

  // 1..7 — AMO_CALL_STATUSES ga qarang
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare call_status?: number | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare call_result?: string | null;

  // soniyada
  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare duration: number;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare phone?: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare responsible_user_id?: number | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare amo_created_at: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare amo_updated_at: Date;
}
