import { CreateComeAndGoDto } from './create-come_and_go.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class UpdateComeAndGoDto extends PartialType(CreateComeAndGoDto) {
  @ApiProperty({
    example: 1,
    description: 'Id of user who created this come and go',
  })
  user_id: number;
}
