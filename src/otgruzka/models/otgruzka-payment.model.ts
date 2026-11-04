import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { OtgruzkaOrder } from './otgruzka-order.model';

export interface OtgruzkaPaymentAtr {
  order_id: number;
  amount: number;
  pay_date: string;
  comment?: string | null;
  source?: 'sheet' | 'erp';
  created_by?: number | null;
}

// To'lovlar jurnali. Mirror rejimda varaqdagi "оплаченная сумма" o'zgarganda farq
// shu kunning sanasi bilan avtomatik yoziladi (comment = 'sys:opening' | 'sys:sheet_diff');
// sanani keyin ERP'da haqiqiy to'lov sanasiga to'g'rilash mumkin.
@Table({ tableName: 'otgruzka_payments', timestamps: true })
export class OtgruzkaPayment extends Model<OtgruzkaPayment, OtgruzkaPaymentAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => OtgruzkaOrder)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare order_id: number;

  @BelongsTo(() => OtgruzkaOrder, { foreignKey: 'order_id', as: 'order' })
  declare order?: OtgruzkaOrder;

  // Musbat — to'lov, manfiy — tuzatish/qaytarish
  @Column({ type: DataType.DOUBLE, allowNull: false })
  declare amount: number;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare pay_date: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare comment: string | null;

  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'erp' })
  declare source: 'sheet' | 'erp';

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by: number | null;

  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator', constraints: false })
  declare creator?: User;
}
