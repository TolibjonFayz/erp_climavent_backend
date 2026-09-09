import { ApiProperty } from '@nestjs/swagger';
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { Loyiha } from './loyiha.model';

// Ikkita fayl bo'limi:
//  - ARCHIVE: yuklangan sana bilan qotib qoladi, tahrirlab/o'chirib bo'lmaydi
//  - WORKING: odatiy ishchi fayllar, tahrirlash va o'chirish mumkin
export const FILE_SECTIONS = ['archive', 'working'] as const;
export type FileSection = (typeof FILE_SECTIONS)[number];

interface LoyihaFileAtr {
  loyiha_id: number;
  section: string;
  file_name: string;
  file_key: string;
  mime_type?: string;
  size_bytes?: number;
  title?: string;
  provider?: string;
  uploaded_by?: number;
}

@Table({ tableName: 'loyiha_file', timestamps: true })
export class LoyihaFile extends Model<LoyihaFile, LoyihaFileAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => Loyiha)
  @ApiProperty({ example: 3, description: 'Project id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare loyiha_id: number;
  @BelongsTo(() => Loyiha, { foreignKey: 'loyiha_id', as: 'loyiha' })
  declare loyiha?: Loyiha;

  @ApiProperty({ example: 'archive', description: 'archive | working' })
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'working' })
  declare section: string;

  // Foydalanuvchi yuklagan asl nom (kirill/probel bo'lishi mumkin)
  @ApiProperty({ example: 'Loyiha chizmasi.pdf' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare file_name: string;

  // R2 dagi obyekt kaliti — bucket ommaviy emas, yuklab olish presigned havola orqali
  @ApiProperty({ example: 'loyiha/3/archive/uuid.pdf' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare file_key: string;

  @ApiProperty({ example: 'application/pdf' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare mime_type?: string;

  @ApiProperty({ example: 245678 })
  @Column({ type: DataType.BIGINT, allowNull: true })
  declare size_bytes?: number;

  // Faqat "working" bo'limida tahrirlanadi — faylga qo'yiladigan izoh/nom
  @ApiProperty({ example: 'Yakuniy versiya' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare title?: string;

  // Storage almashtirilsa (R2 -> boshqa) migratsiya uchun kerak
  @ApiProperty({ example: 'r2', description: 'Storage provider' })
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'r2' })
  declare provider: string;

  @ForeignKey(() => User)
  @ApiProperty({ example: 4 })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare uploaded_by?: number;
  @BelongsTo(() => User, { foreignKey: 'uploaded_by', as: 'uploader' })
  declare uploader?: User;
}
