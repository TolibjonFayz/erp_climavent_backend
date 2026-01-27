import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Model,
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
  HasMany,
} from 'sequelize-typescript';
import { ComeAndGoInside } from 'src/come_and_go_inside/models/come_and_go_inside.model';
import { User } from 'src/users/models/user.model';

interface ComeAndGoAtr {
  user_id: number;
}

@Table({ tableName: 'comeandgo' })
export class ComeAndGo extends Model<ComeAndGo, ComeAndGoAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @ApiProperty({
    example: 1,
    description: 'Id of user who made this come and go',
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  user_id: number;
  @BelongsTo(() => User)
  user: User;

  @HasMany(() => ComeAndGoInside)
  comeAndGoInsides: ComeAndGoInside;
}
