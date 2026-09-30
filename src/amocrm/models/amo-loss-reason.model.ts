import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoLossReasonAtr {
  id: number;
  name: string;
  sort?: number;
}

// Sdelka yo'qotilganda (143) ko'rsatiladigan sabablar ("Причины отказа")
@Table({ tableName: 'amo_loss_reasons', timestamps: true })
export class AmoLossReason extends Model<AmoLossReason, AmoLossReasonAtr> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sort?: number;
}
