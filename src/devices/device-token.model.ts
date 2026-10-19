import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

interface DeviceTokenAtr {
  user_id: number;
  token: string;
  platform: string;
  lang?: string;
  app_version?: string | null;
}

// Mobil ilova qurilmalari — push-bildirishnoma (FCM) tokenlari.
// Jadval birinchi deploy'da sequelize sync orqali yaratiladi.
// DIQQAT: maydonlar `declare` bilan (tsconfig ES2023 — aks holda getter soyalanadi).
@Table({ tableName: 'device_tokens' })
export class DeviceToken extends Model<DeviceToken, DeviceTokenAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare user_id: number;

  @BelongsTo(() => User)
  declare user: User;

  // Bitta qurilma — bitta token; boshqa hisob bilan kirilsa egasi almashadi
  @Column({ type: DataType.TEXT, allowNull: false, unique: true })
  declare token: string;

  // android | ios
  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'android' })
  declare platform: string;

  // Bildirishnoma tili: uz | ru (ilovadagi til)
  @Column({ type: DataType.STRING(4), allowNull: false, defaultValue: 'uz' })
  declare lang: string;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare app_version: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare last_sent_at: Date | null;
}
