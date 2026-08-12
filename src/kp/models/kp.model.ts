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

interface KPAtr {
  kp_number?: number;
  kp_status: string;
  client_name: string;
  kp_date: string;
  manager_name: string;
  kp_sum: number;
  dogovor_next?: string;
  closed_date?: string;
  comment?: string;
  admin_comment?: string;
  created_by?: number;
}

@Table({ tableName: 'kp', timestamps: true })
export class Kp extends Model<Kp, KPAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Tashqi tizimdagi (Excel) hujjat raqami — import qayta yuklanganda shu bo'yicha
  // eski yozuv yangilanadi, dublikat yaratilmaydi. Qo'lda kiritilgan KP'larda bo'sh qoladi.
  @ApiProperty({ example: 12000, description: 'External document number (from Excel import)' })
  @Column({ type: DataType.INTEGER, allowNull: true, unique: true })
  declare kp_number?: number;

  @ApiProperty({ example: 'Open', description: 'Status of KP' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare kp_status: string;

  @ApiProperty({ example: 'John Doe', description: 'Client name' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare client_name: string;

  @ApiProperty({ example: '2023-06-01', description: 'Date of KP' })
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare kp_date: string;

  @ApiProperty({ example: 'Jane Smith', description: 'Manager name' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare manager_name: string;

  @ApiProperty({ example: 1000, description: 'Sum of KP' })
  @Column({ type: DataType.FLOAT, allowNull: false })
  declare kp_sum: number;

  @ApiProperty({ example: '2023-07-01', description: 'Next contract date' })
  @Column({ type: DataType.STRING })
  declare dogovor_next?: string;

  @ApiProperty({ example: '2023-08-01', description: 'Date the document was closed' })
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare closed_date?: string;

  @ApiProperty({ example: 'This is a comment', description: 'Comment' })
  @Column({ type: DataType.TEXT })
  declare comment?: string;

  // Faqat admin yozadi/o'zgartiradi, faqat admin ko'radi. Vaqt cheklovi yo'q.
  @ApiProperty({ example: 'Ichki eslatma', description: 'Admin-only internal note' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare admin_comment?: string;

  // Kim kiritgan — 2 kunlik tahrirlash/o'chirish huquqini aniqlash uchun.
  // Import qilingan/eski yozuvlarda bo'sh bo'lishi mumkin (faqat admin boshqaradi).
  @ForeignKey(() => User)
  @ApiProperty({ example: 4, description: 'User who created this KP' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by?: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  creator?: User;
}
