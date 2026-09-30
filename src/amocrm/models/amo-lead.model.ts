import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoLeadAtr {
  id: number;
  name?: string | null;
  price?: number;
  pipeline_id: number;
  status_id: number;
  responsible_user_id?: number;
  amo_created_at: Date;
  amo_updated_at: Date;
  amo_closed_at?: Date | null;
  loss_reason_id?: number | null;
  tags?: string[];
  is_deleted?: boolean;
  synced_at: Date;
}

// amoCRM sdelkalari. Faqat o'qish uchun nusxa — manba amoCRM.
@Table({
  tableName: 'amo_leads',
  timestamps: true,
  indexes: [
    { fields: ['pipeline_id', 'status_id'] },
    { fields: ['responsible_user_id'] },
    { fields: ['amo_created_at'] },
    { fields: ['amo_updated_at'] },
  ],
})
export class AmoLead extends Model<AmoLead, AmoLeadAtr> {
  @Column({ type: DataType.BIGINT, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare name?: string | null;

  @Column({ type: DataType.DECIMAL(18, 2), allowNull: true })
  declare price?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pipeline_id: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare status_id: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare responsible_user_id?: number;

  @Column({ type: DataType.DATE, allowNull: false })
  declare amo_created_at: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare amo_updated_at: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare amo_closed_at?: Date | null;

  // Yo'qotish sababi (amo_loss_reasons). Faqat 143 bosqichida to'ldiriladi.
  // Eski bazalarda ustun AmocrmSyncService.ensureSchema() orqali qo'shiladi.
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare loss_reason_id?: number | null;

  // Teg nomlari
  @Column({ type: DataType.JSONB, allowNull: true })
  declare tags?: string[];

  // amoCRM'da o'chirilgan (tungi solishtirishda aniqlanadi). Jismonan o'chirmaymiz.
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare is_deleted: boolean;

  @Column({ type: DataType.DATE, allowNull: false })
  declare synced_at: Date;
}
