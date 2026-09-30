import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoContactAtr {
  id: number;
  name?: string | null;
  responsible_user_id?: number | null;
  tags?: string[];
  amo_updated_at?: Date | null;
  is_deleted?: boolean;
}

// amoCRM kontaktlari — qo'ng'iroqlar deyarli hammasi kontaktga yoziladi.
// Nomi (hamkasbni tanib olish uchun) va teglari ("Не клиент" va h.k.) kerak.
@Table({ tableName: 'amo_contacts', timestamps: true })
export class AmoContact extends Model<AmoContact, AmoContactAtr> {
  @Column({ type: DataType.BIGINT, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare name?: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare responsible_user_id?: number | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare tags?: string[];

  @Column({ type: DataType.DATE, allowNull: true })
  declare amo_updated_at?: Date | null;

  // amoCRM'dan so'ralganda topilmadi (o'chirilgan) — qayta so'ramaslik uchun
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare is_deleted: boolean;
}
