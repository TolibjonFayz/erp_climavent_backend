import { ApiProperty } from '@nestjs/swagger';

export class CreateLocationVideoDto {
  @ApiProperty({ example: 1, description: 'Unique id' })
  declare id: number;

  @ApiProperty({
    example: 'video_link.mp4',
    description: 'Link to the video file',
  })
  video_link: string;

  @ApiProperty({
    example: 'video_text',
    description: 'Caption text of the video file',
  })
  video_text: string;

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
