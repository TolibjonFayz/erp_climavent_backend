import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoStatusAtr {
  id: number;
  pipeline_id: number;
  name: string;
  color?: string;
  sort?: number;
  type?: number;
}

// Voronka bosqichlari. 142 (yutilgan) va 143 (yo'qotilgan) har voronkada
// takrorlanadi, shuning uchun kalit = (id, pipeline_id).
@Table({ tableName: 'amo_statuses', timestamps: true })
export class AmoStatus extends Model<AmoStatus, AmoStatusAtr> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.INTEGER, primaryKey: true })
  declare pipeline_id: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare color?: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sort?: number;

  // 0 — oddiy, 1 — "Неразобранное"
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare type?: number;
}
