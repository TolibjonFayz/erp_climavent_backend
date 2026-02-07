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

interface PartnersAtr {
  partner_type: string;
  republic: string;
  viloyat: string;
  shahar_tuman: string;
  mijozturi: string;
  inn: string;
  phone_number: string;
  additional_phone_number: string;
  fullname: string;
  more_info: string;
  user_id: number;
}

@Table({ tableName: 'partners' })
export class Partners extends Model<Partners, PartnersAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 'Mantajnik', description: 'Partner type' })
  @Column({ type: DataType.STRING })
  partner_type: string;

  @ApiProperty({ example: "O'zbekiston", description: 'Republic' })
  @Column({ type: DataType.STRING })
  republic: string;

  @ApiProperty({ example: 'Toshkent viloyati', description: 'Viloyat' })
  @Column({ type: DataType.STRING })
  viloyat: string;

  @ApiProperty({ example: 'Toshkent shahri', description: 'Shahar/Tuman' })
  @Column({ type: DataType.STRING })
  shahar_tuman: string;

  @ApiProperty({ example: 'Yuridik shaxs', description: 'Mijoz turi' })
  @Column({ type: DataType.STRING })
  mijozturi: string;

  @ApiProperty({ example: '5456465446', description: 'Inn' })
  @Column({ type: DataType.STRING })
  inn: string;

  @ApiProperty({ example: '+998901234567', description: 'Phone number' })
  @Column({ type: DataType.STRING })
  phone_number: string;

  @ApiProperty({
    example: '+998901234567',
    description: 'Additional phone number',
  })
  @Column({ type: DataType.STRING })
  additional_phone_number: string;

  @ApiProperty({ example: 'John Doe', description: 'Full name' })
  @Column({ type: DataType.STRING })
  fullname: string;

  @ApiProperty({ example: 'Smt', description: 'More info about this partner' })
  @Column({ type: DataType.TEXT })
  more_info: string;

  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'User ID' })
  @Column({ type: DataType.INTEGER })
  user_id: number;
  @BelongsTo(() => User)
  user: User;
}
