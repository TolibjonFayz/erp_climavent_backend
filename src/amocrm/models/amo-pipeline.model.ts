import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoPipelineAtr {
  id: number;
  name: string;
  sort?: number;
  is_main?: boolean;
  is_archive?: boolean;
}

// amoCRM voronkalari. id — amoCRM'dagi id (o'zimiz generatsiya qilmaymiz).
// DIQQAT: maydonlar `declare` bilan (tsconfig target ES2023).
@Table({ tableName: 'amo_pipelines', timestamps: true })
export class AmoPipeline extends Model<AmoPipeline, AmoPipelineAtr> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sort?: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare is_main: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare is_archive: boolean;
}
