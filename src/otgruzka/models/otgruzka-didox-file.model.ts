import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { OtgruzkaOrder } from './otgruzka-order.model';

// invoice — schyot-faktura (summasi bilan), poa — ishonchnoma (summasiz)
export const DIDOX_KINDS = ['invoice', 'poa'] as const;
export type DidoxKind = (typeof DIDOX_KINDS)[number];

export interface OtgruzkaDidoxFileAtr {
  order_id: number;
  kind?: DidoxKind;
  file_name: string;
  file_key: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  amount?: number | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  comment?: string | null;
  uploaded_by?: number | null;
}

// Didox: otgruzka kartasiga biriktirilgan schyot-faktura va ishonchnoma fayllari (Cloudflare R2'da).
// `amount` — fayl (schyot-faktura) ichida ko'rsatilgan summa, yuklashda kiritiladi.
@Table({ tableName: 'otgruzka_didox_files', timestamps: true })
export class OtgruzkaDidoxFile extends Model<OtgruzkaDidoxFile, OtgruzkaDidoxFileAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => OtgruzkaOrder)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare order_id: number;

  @BelongsTo(() => OtgruzkaOrder, { foreignKey: 'order_id', as: 'order' })
  declare order?: OtgruzkaOrder;

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'invoice' })
  declare kind: DidoxKind;

  @Column({ type: DataType.STRING, allowNull: false })
  declare file_name: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare file_key: string;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare mime_type: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare size_bytes: number | null;

  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare amount: number | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare invoice_number: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare invoice_date: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare comment: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare uploaded_by: number | null;

  @BelongsTo(() => User, { foreignKey: 'uploaded_by', as: 'uploader', constraints: false })
  declare uploader?: User;
}
