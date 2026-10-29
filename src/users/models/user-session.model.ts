import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from './user.model';

interface UserSessionAtr {
  user_id: number;
  token_hash: string;
  user_agent?: string | null;
  ip?: string | null;
  last_used_at?: Date;
  expires_at?: Date | null;
  revoked_at?: Date | null;
}

// Har bir qurilmadagi kirish — alohida sessiya. Avval users.refresh_token bitta edi va
// har login uni almashtirardi (sayt va telefon bir-birini "chiqarib yuborardi").
// Refresh token bazada faqat sha256 ko'rinishida saqlanadi.
@Table({ tableName: 'user_sessions' })
export class UserSession extends Model<UserSession, UserSessionAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare user_id: number;

  @BelongsTo(() => User, { onDelete: 'CASCADE' })
  declare user: User;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare token_hash: string;

  @Column({ type: DataType.STRING(255) })
  declare user_agent: string | null;

  @Column({ type: DataType.STRING(64) })
  declare ip: string | null;

  @Column({ type: DataType.DATE })
  declare last_used_at: Date;

  @Column({ type: DataType.DATE })
  declare expires_at: Date | null;

  @Column({ type: DataType.DATE })
  declare revoked_at: Date | null;
}
