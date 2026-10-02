import { ApiProperty } from '@nestjs/swagger';
import { Table, Model, Column, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

// Terminaldagi xodim raqami -> ERP xodimi bog'lanishi.
// Ism va raqamni agent yangilaydi, user_id ni admin ERP'da tanlaydi.

export interface HikEmployeeAtr {
  employee_no: string;
  name: string;
  user_id?: number | null;
}

@Table({ tableName: 'hik_employees' })
export class HikEmployee extends Model<HikEmployee, HikEmployeeAtr> {
  @ApiProperty({ example: '00000002', description: 'Employee number on the terminal' })
  @Column({ type: DataType.STRING, primaryKey: true })
  declare employee_no: string;

  @ApiProperty({ example: 'Fayzullayev Tolibjon', description: 'Name on the terminal' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @ForeignKey(() => User)
  @ApiProperty({ example: 4, description: 'Linked ERP user id' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare user_id: number | null;
  @BelongsTo(() => User, { foreignKey: 'user_id', as: 'user', onDelete: 'SET NULL' })
  declare user: User;
}
