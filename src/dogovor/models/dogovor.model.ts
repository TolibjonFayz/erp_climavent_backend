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

// Shartnoma bandi (PDF jadvali uchun) — Excel importda bo'lmaydi, qo'lda kiritiladi
export interface DogovorItem {
  name: string;
  unit?: string;
  qty: number;
  price: number;
}

interface DogovorAtr {
  dogovor_number?: number;
  dogovor_date: string;
  client_name: string;
  dogovor_sum: number;
  dogovor_status?: string;
  client_inn?: string;
  payment_date?: string;
  initial_payment?: number;
  prepayment_percent?: number;
  client_phone?: string;
  manager_name?: string;
  client_address?: string;
  contact_name?: string;
  contact_position?: string;
  client_bank?: string;
  client_account?: string;
  client_mfo?: string;
  client_vat_code?: string;
  items?: DogovorItem[];
  production_days?: number;
  comment?: string;
  admin_comment?: string;
  created_by?: number;
}

// DIQQAT: har bir maydon `declare` bilan — tsconfig target ES2023 bo'lgani uchun
// `declare`siz maydon Sequelize getter/setter'ini soyalab qo'yadi.
@Table({ tableName: 'dogovor', timestamps: true })
export class Dogovor extends Model<Dogovor, DogovorAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Manba tizimdagi hujjat raqami. YAKKA O'ZI UNIKAL EMAS — raqamlar har yili
  // qaytadan boshlanadi, shuning uchun import kaliti = raqam + sana.
  @ApiProperty({ example: 30399, description: 'Document number' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare dogovor_number?: number;

  @ApiProperty({ example: '2026-07-24', description: 'Contract date' })
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare dogovor_date: string;

  @ApiProperty({ example: 'BELPHARM MCHJ XK', description: 'Client name' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare client_name: string;

  @ApiProperty({ example: 1189776, description: 'Total sum' })
  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
  declare dogovor_sum: number;

  @ApiProperty({
    example: 'Open',
    description: 'Open | Shipped | PartlyShipped | Closed',
  })
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'Open' })
  declare dogovor_status: string;

  @ApiProperty({ example: '305954304', description: 'Client INN' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare client_inn?: string;

  @ApiProperty({ example: '2026-07-25', description: 'Payment date' })
  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare payment_date?: string;

  @ApiProperty({ example: 11400, description: 'Initial payment amount' })
  @Column({ type: DataType.FLOAT, allowNull: true })
  declare initial_payment?: number;

  @ApiProperty({ example: 100, description: 'Prepayment percent' })
  @Column({ type: DataType.FLOAT, allowNull: true })
  declare prepayment_percent?: number;

  @ApiProperty({ example: '+998 90 8085551', description: 'Client phone' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare client_phone?: string;

  @ApiProperty({ example: 'Расулов Жамшид', description: 'Sales manager' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare manager_name?: string;

  @ApiProperty({ example: 'г. Ташкент, ...', description: 'Client address' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare client_address?: string;

  @ApiProperty({ example: 'KURBANGALIYEV I.K.', description: 'Contact person' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare contact_name?: string;

  @ApiProperty({ example: 'Директор', description: 'Contact position' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare contact_position?: string;

  // ─── Shartnoma hujjati (PDF) uchun qo'shimcha rekvizitlar ───
  @ApiProperty({ example: 'Головной офис УзНацбанка', description: 'Client bank' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare client_bank?: string;

  @ApiProperty({ example: '20214000400970065001', description: 'Client bank account' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare client_account?: string;

  @ApiProperty({ example: '00450', description: 'Client MFO' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare client_mfo?: string;

  @ApiProperty({ example: '326030101348', description: 'VAT payer registration code' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare client_vat_code?: string;

  @ApiProperty({ description: 'Contract line items for the PDF table' })
  @Column({ type: DataType.JSONB, allowNull: true })
  declare items?: DogovorItem[];

  @ApiProperty({ example: 15, description: 'Production time in banking days' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare production_days?: number;

  @ApiProperty({ example: 'Izoh', description: 'Comment' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare comment?: string;

  // Faqat admin ko'radi va o'zgartiradi (KP'dagi kabi)
  @ApiProperty({ example: 'Ichki eslatma', description: 'Admin-only internal note' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare admin_comment?: string;

  @ForeignKey(() => User)
  @ApiProperty({ example: 4, description: 'User who created this contract' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by?: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  declare creator?: User;
}
