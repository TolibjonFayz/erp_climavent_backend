import { Column, DataType, Model, Table } from 'sequelize-typescript';

export const RECORD_STATUSES = [
  'archived', // R2'ga ko'chirildi — endi telefoniyaga bog'liq emas
  'failed', // vaqtinchalik xato, keyinroq qayta urinamiz
  'gone', // telefoniyada o'chib ketgan (404/410)
  'invalid', // havola audio emas (HTML/xato sahifasi qaytdi)
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

interface AmoRecordingAtr {
  link_hash: string;
  link: string;
  status: RecordStatus;
  r2_key?: string | null;
  size?: number | null;
  content_type?: string | null;
  attempts?: number;
  last_error?: string | null;
  next_try_at?: Date | null;
  archived_at?: Date | null;
  call_at?: Date | null;
}

// Suhbat yozuvlarining bizdagi arxivi (Cloudflare R2). Kalit — havolaning md5'i
// (amo_calls.record_hash): bitta qo'ng'iroq kontakt va sdelkaga yozilsa ham
// fayl bir marta saqlanadi. Hali urinilmagan yozuvlarning bu yerda qatori yo'q.
@Table({
  tableName: 'amo_recordings',
  timestamps: true,
  indexes: [{ fields: ['status'] }],
})
export class AmoRecording extends Model<AmoRecording, AmoRecordingAtr> {
  @Column({ type: DataType.STRING(32), primaryKey: true })
  declare link_hash: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare link: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: RecordStatus;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare r2_key?: string | null;

  // baytda
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare size?: number | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare content_type?: string | null;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare attempts: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare last_error?: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare next_try_at?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare archived_at?: Date | null;

  // Qo'ng'iroq vaqti (fayl R2'da yil/oy papkasiga tushadi)
  @Column({ type: DataType.DATE, allowNull: true })
  declare call_at?: Date | null;
}
