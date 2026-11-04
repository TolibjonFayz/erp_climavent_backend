import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { OtgruzkaOrder } from './otgruzka-order.model';

export type OtgruzkaNoteKind = 'note' | 'call' | 'change';

export interface OtgruzkaNoteAtr {
  order_id: number;
  kind: OtgruzkaNoteKind;
  text?: string | null;
  data?: Record<string, unknown> | null;
  source?: 'sheet' | 'erp';
  created_by?: number | null;
}

// Karta tarixi: izohlar, qo'ng'iroqlar va avtomatik o'zgarish yozuvlari.
// `change` yozuvida matn yo'q — `data` = {field, from, to}; frontend tilga qarab ko'rsatadi.
@Table({ tableName: 'otgruzka_notes', timestamps: true })
export class OtgruzkaNote extends Model<OtgruzkaNote, OtgruzkaNoteAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => OtgruzkaOrder)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare order_id: number;

  @BelongsTo(() => OtgruzkaOrder, { foreignKey: 'order_id', as: 'order' })
  declare order?: OtgruzkaOrder;

  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'note' })
  declare kind: OtgruzkaNoteKind;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare text: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare data: Record<string, unknown> | null;

  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'erp' })
  declare source: 'sheet' | 'erp';

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by: number | null;

  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator', constraints: false })
  declare creator?: User;
}
