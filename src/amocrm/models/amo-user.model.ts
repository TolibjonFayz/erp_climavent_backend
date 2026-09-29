import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoUserAtr {
  id: number;
  name: string;
  email?: string | null;
  is_active?: boolean;
}

// amoCRM foydalanuvchilari (menejerlar)
@Table({ tableName: 'amo_users', timestamps: true })
export class AmoUser extends Model<AmoUser, AmoUserAtr> {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare email?: string | null;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  declare is_active: boolean;
}
