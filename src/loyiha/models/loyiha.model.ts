import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { LoyihaFile } from './loyiha-file.model';

// Loyiha holati: ish davom etyaptimi yoki tugaganmi
export const LOYIHA_STATUSES = ['in_progress', 'done'] as const;

interface LoyihaAtr {
  order_number?: number;
  status?: string;
  manager_name?: string;
  other_source?: string;
  comment?: string;
  contact_phone?: string;
  contact_address?: string;
  system_info?: string;
  area?: number;
  difficulty?: number;
  kp_number?: string;
  kp_sum?: number;
  kp_date?: string;
  dogovor_number?: string;
  dogovor_sum?: number;
  dogovor_date?: string;
  created_by?: number;
}

// DIQQAT: har bir maydon `declare` bilan — tsconfig target ES2023 bo'lgani uchun
// `declare`siz maydon Sequelize getter/setter'ini soyalab qo'yadi.
@Table({ tableName: 'loyiha', timestamps: true })
export class Loyiha extends Model<Loyiha, LoyihaAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Loyiha id — avtomatik beriladi, UI'da nol bilan to'ldirilib ko'rsatiladi (0001)
  @ApiProperty({ example: 101, description: 'Loyiha id (tartib raqami)' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare order_number?: number;

  @ApiProperty({ example: 'in_progress', description: 'in_progress | done' })
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'in_progress' })
  declare status: string;

  // Loyihani bergan menejer — qo'lda yoziladi (ro'yxatdan tanlanmaydi)
  @ApiProperty({ example: 'Rasulov Jamshid', description: 'Manager who brought the project' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare manager_name?: string;

  // Loyihani menejerlarimizdan boshqa odam bergan bo'lsa — shu yerga ismi
  @ApiProperty({ example: 'Akmal aka (tanish arxitektor)', description: 'External source' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare other_source?: string;

  @ApiProperty({ example: "Obyekt bo'yicha qo'shimcha ma'lumot", description: 'Comment' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare comment?: string;

  // Mijoz raqami
  @ApiProperty({ example: '+998 90 123 45 67' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare contact_phone?: string;

  // Mijoz manzili
  @ApiProperty({ example: 'Toshkent sh., Chilonzor 5-kvartal' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare contact_address?: string;

  @ApiProperty({ example: 'VRF, kanalli ventilyatsiya', description: 'Sistema' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare system_info?: string;

  @ApiProperty({ example: 1250.5, description: 'Kvadratura (m2)' })
  @Column({ type: DataType.FLOAT, allowNull: true })
  declare area?: number;

  // 1 dan 10 gacha — loyihaning darajasi (murakkabligi)
  @ApiProperty({ example: 7, description: 'Level 1-10' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare difficulty?: number;

  // ─── KP ma'lumotlari ───
  @ApiProperty({ example: '30399', description: 'KP raqami' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare kp_number?: string;

  @ApiProperty({ example: 1189776, description: 'KP summasi' })
  @Column({ type: DataType.FLOAT, allowNull: true })
  declare kp_sum?: number;

  @ApiProperty({ example: '2026-07-24', description: 'KP sanasi' })
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare kp_date?: string;

  // ─── Dogovor ma'lumotlari ───
  @ApiProperty({ example: '30399/7', description: 'Dogovor raqami' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare dogovor_number?: string;

  @ApiProperty({ example: 1189776, description: 'Dogovor summasi' })
  @Column({ type: DataType.FLOAT, allowNull: true })
  declare dogovor_sum?: number;

  @ApiProperty({ example: '2026-08-01', description: 'Dogovor sanasi' })
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare dogovor_date?: string;

  @ForeignKey(() => User)
  @ApiProperty({ example: 4, description: 'User who created this record' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by?: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator?: User;

  @HasMany(() => LoyihaFile, { foreignKey: 'loyiha_id', as: 'files' })
  declare files?: LoyihaFile[];
}
