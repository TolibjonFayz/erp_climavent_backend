import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Model,
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

interface AnnouncementAtr {
  title: string;
  message: string;
  created_by?: number;
}

@Table({ tableName: 'announcements' })
export class Announcement extends Model<Announcement, AnnouncementAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 'Muhim e\'lon', description: 'Title' })
  @Column({ type: DataType.STRING, allowNull: false })
  title: string;

  @ApiProperty({ example: 'Ertaga majlis...', description: 'Message' })
  @Column({ type: DataType.TEXT, allowNull: false })
  message: string;

  @ForeignKey(() => User)
  @ApiProperty({ example: 16, description: 'Boss id' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  created_by: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'author' })
  author: User;
}
