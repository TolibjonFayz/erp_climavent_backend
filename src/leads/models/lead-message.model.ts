import { ApiProperty } from '@nestjs/swagger';
import { BelongsTo, Column, DataType, ForeignKey, Index, Model, Table } from 'sequelize-typescript';
import { Lead } from './lead.model';

export interface LeadMessageAtr {
  lead_id: number;
  text: string;
  sent_at: Date;
  chat_id?: string | null;
  chat_title?: string | null;
  tg_message_id?: number | null;
  context?: string | null;
  link?: string | null;
}

// Lidning bitta xabari. (chat_id, tg_message_id) juftligi unikal — Telegram qayta yuborsa ikkilanmaydi
@Table({ tableName: 'lead_messages', timestamps: true })
export class LeadMessage extends Model<LeadMessage, LeadMessageAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => Lead)
  @Index('lead_messages_lead_idx')
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare lead_id: number;

  @BelongsTo(() => Lead, { onDelete: 'CASCADE' })
  declare lead?: Lead;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare text: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare sent_at: Date;

  @Index({ name: 'lead_messages_tg_uq', unique: true })
  @Column({ type: DataType.STRING(40), allowNull: true })
  declare chat_id: string | null;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare chat_title: string | null;

  @Index({ name: 'lead_messages_tg_uq', unique: true })
  @Column({ type: DataType.BIGINT, allowNull: true })
  declare tg_message_id: number | null;

  // Izoh bo'lsa — qaysi kanal postiga yozilgan (post matnining boshi)
  @Column({ type: DataType.TEXT, allowNull: true })
  declare context: string | null;

  // Telegram'da xabarni ochish havolasi (ommaviy guruh bo'lsa)
  @Column({ type: DataType.STRING(300), allowNull: true })
  declare link: string | null;
}
