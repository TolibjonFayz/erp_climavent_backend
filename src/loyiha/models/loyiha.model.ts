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

interface LoyihaAtr {
  order_number?: number;
  manager_name?: string;
  other_source?: string;
  comment?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_address?: string;
  system_info?: string;
  area?: number;
  difficulty?: number;
  created_by?: number;
}

// DIQQAT: har bir maydon `declare` bilan — tsconfig target ES2023 bo'lgani uchun
// `declare`siz maydon Sequelize getter/setter'ini soyalab qo'yadi.
@Table({ tableName: 'loyiha', timestamps: true })
export class Loyiha extends Model<Loyiha, LoyihaAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 101, description: 'Tartib raqami' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare order_number?: number;

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

  @ApiProperty({ example: '+998 90 123 45 67' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare contact_phone?: string;

  @ApiProperty({ example: 'info@example.uz' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare contact_email?: string;

  @ApiProperty({ example: 'Toshkent sh., Chilonzor 5-kvartal' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare contact_address?: string;

  @ApiProperty({ example: 'VRF, kanalli ventilyatsiya', description: 'Sistema' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare system_info?: string;

  @ApiProperty({ example: 1250.5, description: 'Kvadratura (m2)' })
  @Column({ type: DataType.FLOAT, allowNull: true })
  declare area?: number;

  // 1 dan 10 gacha — loyihaning og'irlik/murakkablik bahosi
  @ApiProperty({ example: 7, description: 'Difficulty rating 1-10' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare difficulty?: number;

  @ForeignKey(() => User)
  @ApiProperty({ example: 4, description: 'User who created this record' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by?: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator?: User;

  @HasMany(() => LoyihaFile, { foreignKey: 'loyiha_id', as: 'files' })
  declare files?: LoyihaFile[];
}
