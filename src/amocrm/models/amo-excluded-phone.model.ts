import { Column, DataType, Model, Table } from 'sequelize-typescript';

export const EXCLUDE_REASONS = [
  'colleague',
  'acquaintance',
  'supplier',
  'other',
] as const;

interface AmoExcludedPhoneAtr {
  phone_key: string;
  phone: string;
  reason: string;
  note?: string | null;
  created_by?: number | null;
}

// Admin/boss "Mijoz emas" deb belgilagan raqamlar. Statistikada butun tarix
// bo'yicha sanalmaydi. Kalit — raqamning oxirgi 9 raqami (amo_calls.phone_key).
@Table({ tableName: 'amo_excluded_phones', timestamps: true })
export class AmoExcludedPhone extends Model<
  AmoExcludedPhone,
  AmoExcludedPhoneAtr
> {
  @Column({ type: DataType.STRING(16), primaryKey: true })
  declare phone_key: string;

  // Ko'rsatish uchun (belgilangan paytdagi ko'rinishi)
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare phone: string;

  // colleague | acquaintance | supplier | other
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare reason: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare note?: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by?: number | null;
}
