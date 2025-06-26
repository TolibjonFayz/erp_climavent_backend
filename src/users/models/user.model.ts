import { ApiProperty } from '@nestjs/swagger';
import { Table, Model, Column, DataType } from 'sequelize-typescript';

interface UserAtr {
  firstname: string;
  lastname: string;
  phone_number: string;
  email: string;
  username: string;
  password: string;
  is_admin: boolean;
  access_token: string;
  refresh_token: string;
}

@Table({ tableName: 'users' })
export class User extends Model<User, UserAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 'John', description: 'Firstname of the user' })
  @Column({ type: DataType.STRING, allowNull: false })
  firstname: string;

  @ApiProperty({ example: 'Doe', description: 'Lastname of the user' })
  @Column({ type: DataType.STRING, allowNull: false })
  lastname: string;

  @ApiProperty({
    example: '+998908150412',
    description: 'Phone number of the user',
  })
  @Column({ type: DataType.STRING, allowNull: false })
  phone_number: string;

  @ApiProperty({ example: 'john@gmail.com', description: 'Email of the user' })
  @Column({ type: DataType.STRING, allowNull: false })
  email: string;

  @ApiProperty({ example: 'sherlock_me', description: 'Userame of user' })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  username: string;

  @ApiProperty({ example: 'qwerty123', description: 'Password of user' })
  @Column({ type: DataType.STRING, allowNull: false })
  password: string;

  @ApiProperty({ example: 'false', description: 'Is this user - admin' })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  is_admin: boolean;

  @ApiProperty({ example: 'access_token', description: 'Access token of user' })
  @Column({ type: DataType.STRING, allowNull: true })
  access_token: string;

  @ApiProperty({
    example: 'refreshtoken',
    description: 'Refresh token of user',
  })
  @Column({ type: DataType.STRING, allowNull: true })
  refresh_token: string;
}
