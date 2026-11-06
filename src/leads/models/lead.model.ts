import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, HasMany, Index, Model, Table } from 'sequelize-typescript';
import { LeadMessage } from './lead-message.model';

export const LEAD_SOURCES = [
  'telegram_group',
  'telegram_comment',
  'telegram_private',
  'email',
  'manual',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ['new', 'in_progress', 'won', 'lost', 'spam'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadAtr {
  external_key?: string | null;
  source: LeadSource;
  status?: LeadStatus;
  name?: string | null;
  username?: string | null;
  phone?: string | null;
  email?: string | null;
  chat_title?: string | null;
  manager_id?: number | null;
  note?: string | null;
  last_message_at?: Date | null;
  last_message_text?: string | null;
  messages_count?: number;
}

// Tashqi kanaldan (Telegram guruh/izoh, email) kelgan potensial mijoz.
// Bir odam = bitta lid (external_key: `tg:<telegram user id>` yoki `mail:<manzil>`)
@Table({ tableName: 'leads', timestamps: true })
export class Lead extends Model<Lead, LeadAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Index({ name: 'leads_external_key_uq', unique: true })
  @Column({ type: DataType.STRING(160), allowNull: true })
  declare external_key: string | null;

  @Column({ type: DataType.STRING(24), allowNull: false })
  declare source: LeadSource;

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'new' })
  declare status: LeadStatus;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare name: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare username: string | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare phone: string | null;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare email: string | null;

  // Oxirgi yozgan guruh/kanal nomi
  @Column({ type: DataType.STRING(200), allowNull: true })
  declare chat_title: string | null;

  // Mas'ul xodim (users.id)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare manager_id: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare last_message_at: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare last_message_text: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare messages_count: number;

  @HasMany(() => LeadMessage)
  declare messages?: LeadMessage[];
}
