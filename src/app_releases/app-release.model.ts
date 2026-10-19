import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AppReleaseAtr {
  platform: string;
  version_name: string;
  version_code: number;
  notes?: string | null;
  file_key: string;
  file_name: string;
  file_size: number;
  created_by?: number | null;
}

// Mobil ilova versiyalari (APK R2'da). Ilova ishga tushganda eng yangisini
// tekshiradi va undan yangi bo'lsa yangilashni taklif qiladi.
// DIQQAT: maydonlar `declare` bilan (tsconfig ES2023).
@Table({ tableName: 'app_releases' })
export class AppRelease extends Model<AppRelease, AppReleaseAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // android (iOS yangilanishlari App Store/TestFlight orqali)
  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'android' })
  declare platform: string;

  // Ko'rinadigan versiya: 1.0.1
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare version_name: string;

  // Android versionCode — taqqoslash shu bo'yicha
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare version_code: number;

  // "Nima yangi" matni
  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare file_key: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare file_name: string;

  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare file_size: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by: number | null;
}
