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
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';
import { LocationVideo } from 'src/location_videos/models/location_video.model';
import { User } from 'src/users/models/user.model';

interface ComeAndGoInsideAtr {
  when_gone: Date;
  when_came: Date;
  whereto: string;
  lat: string;
  lng: string;
  locationname: string;
  dogovor_or_kp: string;
  dogovorkp_date: Date;
  dogovorkp_number: string;
  company_name: string;
  more_info: string;
  user_id: number;
  come_and_go_father_id: number;
}

@Table({ tableName: 'comeandgoinside' })
export class ComeAndGoInside extends Model<
  ComeAndGoInside,
  ComeAndGoInsideAtr
> {
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
  @Column({ type: DataType.STRING })
  dogovorkp_number: string;

  @ApiProperty({ example: 'Man city', description: 'Company name' })
  @Column({ type: DataType.STRING })
  company_name: string;

  @ApiProperty({ example: 'Pistonchi', description: 'Client name' })
  @Column({ type: DataType.STRING })
  client_name: string;

  @ApiProperty({ example: 'Comment', description: 'More info' })
  @Column({ type: DataType.TEXT })
  more_info: string;

  @ForeignKey(() => ComeAndGo)
  @ApiProperty({
    example: 1,
    description: 'Father come and go id',
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  come_and_go_father_id: number;
  @BelongsTo(() => ComeAndGo)
  come_and_go_father: ComeAndGo;
}
