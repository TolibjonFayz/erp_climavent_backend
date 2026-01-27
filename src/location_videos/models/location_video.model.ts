import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Model,
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';
import { User } from 'src/users/models/user.model';

interface LocationVideoAtr {
  video_link: string;
  video_name: string;
  comeandgo_id: number;
  user_id: number;
}

@Table({ tableName: 'location_videos' })
export class LocationVideo extends Model<LocationVideo, LocationVideoAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({
    example: 'video_link.mp4',
    description: 'Link to the video file',
  })
  @Column({ type: DataType.STRING })
  video_link: string;

  @ApiProperty({
    example: 'video_name',
    description: 'Caption text of the video file',
  })
  @Column({ type: DataType.STRING })
  video_name: string;

  @ForeignKey(() => User)
  @ApiProperty({
    example: 1,
    description: 'Id of user who created this come and go',
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  user_id: number;
  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => ComeAndGo)
  @ApiProperty({
    example: 1,
    description: 'Id of comeandgo that this video belongs to',
  })
  @Column({ type: DataType.INTEGER, allowNull: true })
  comeandgo_id: number;
  @BelongsTo(() => ComeAndGo)
  comeandgo: ComeAndGo;
}
