import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { OtgruzkaOrder } from './otgruzka-order.model';

export interface OtgruzkaLineAtr {
  row_no?: number | null;
  order_id?: number | null;
  dogovor_label?: string | null;
  client_label?: string | null;
  item_name: string;
  qty_contract?: number | null;
  qty_in?: number | null;
  qty_out?: number | null;
  note?: string | null;
}

// "Лист1" varag'i: shartnoma bo'yicha omborga kelgan (приход) va jo'natilgan (расход)
// tovarlar. Mirror rejimda har sinxronda to'liq almashtiriladi.
@Table({ tableName: 'otgruzka_lines', timestamps: true })
export class OtgruzkaLine extends Model<OtgruzkaLine, OtgruzkaLineAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare row_no: number | null;

  @ForeignKey(() => OtgruzkaOrder)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL' })
  declare order_id: number | null;

  @BelongsTo(() => OtgruzkaOrder, { foreignKey: 'order_id', as: 'order', constraints: false })
  declare order?: OtgruzkaOrder;

  // Varaqdagi "договор" ustuni (ba'zan "246 выстав", "345/346/347", "выставка")
  @Column({ type: DataType.STRING(64), allowNull: true })
  declare dogovor_label: string | null;

  // Varaqdagi B ustun: mijoz qisqa nomi yoki "запас", "ждем", "неизвестно"
  @Column({ type: DataType.STRING, allowNull: true })
  declare client_label: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare item_name: string;

  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare qty_contract: number | null;

  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare qty_in: number | null;

  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare qty_out: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note: string | null;
}
