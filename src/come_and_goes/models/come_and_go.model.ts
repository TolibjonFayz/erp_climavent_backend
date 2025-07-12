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
import { LocationVideo } from 'src/location_videos/models/location_video.model';
import { User } from 'src/users/models/user.model';

interface ComeAndGoAtr {
  when_gone: Date;
  when_came: Date;
  whereto: string;
  lat: string;
  lng: string;
  locationname: string;
  dogovor_or_kp: string;
  dogovorkp_date: Date;
  dogovorkp_number: number;
  company_name: string;
  user_id: number;
}

@Table({ tableName: 'comeandgo' })
export class ComeAndGo extends Model<ComeAndGo, ComeAndGoAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({
    example: '18.05.2025 14:39',
    description: 'When user gone to a place (time)',
  })
  @Column({ type: DataType.DATE })
  when_gone: Date;

  @ApiProperty({
    example: '18.05.2025 15:21',
    description: 'When user come from a place (time)',
  })
  @Column({ type: DataType.DATE })
  when_came: Date;

  @ApiProperty({
    example: 'Tashkent',
    description: 'Where to user gone (place)',
  })
  @Column({ type: DataType.STRING })
  whereto: string;

  @ApiProperty({ example: 'Proyekt', description: 'Location latitude' })
  @Column({ type: DataType.STRING })
  lat: string;

  @ApiProperty({ example: 'Proyekt', description: 'Location longitude' })
  @Column({ type: DataType.STRING })
  lng: string;

  @ApiProperty({ example: 'Proyekt', description: 'Location name' })
  @Column({ type: DataType.STRING })
  locationname: string;

  @ApiProperty({ example: 'dogovor', description: 'Dogovor or kp' })
  @Column({ type: DataType.STRING })
  dogovor_or_kp: string;

  @ApiProperty({ example: '24.01.2019', description: 'Date of dagavor' })
  @Column({ type: DataType.DATE })
  dogovorkp_date: Date;

  @ApiProperty({ example: '24.01.2019', description: 'Date of dagavor' })
  @Column({ type: DataType.INTEGER })
  dogovorkp_number: number;

  @ApiProperty({ example: 'Man city', description: 'Company name' })
  @Column({ type: DataType.STRING })
  company_name: string;

  @ApiProperty({ example: 'Pistonchi', description: 'Client name' })
  @Column({ type: DataType.STRING })
  client_name: string;

  @ForeignKey(() => User)
  @ApiProperty({
    example: 1,
    description: 'Id of user who created this come and go',
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  user_id: number;
  @BelongsTo(() => User)
  user: User;

  @HasMany(() => LocationVideo)
  locationVideo: LocationVideo;
}
