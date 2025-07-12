import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateLocationVideoDto } from './create-location_video.dto';

export class UpdateLocationVideoDto extends PartialType(
  CreateLocationVideoDto,
) {
  @ApiProperty({ example: 1, description: 'Unique id' })
  declare id: number;

  @ApiProperty({
    example: '18.05.2025 14:39',
    description: 'When user gone to a place (time)',
  })
  video_link: string;

  @ApiProperty({
    example: 'video_text',
    description: 'Caption text of the video file',
  })
  video_name: string;

  @ApiProperty({
    example: 1,
    description: 'Id of user who created this come and go',
  })
  user_id: number;

  @ApiProperty({
    example: 1,
    description: 'Id of comeandgo that this video belongs to',
  })
  comeandgo_id: number;
}
