import { ApiProperty } from '@nestjs/swagger';

export class CreateComeAndGoDto {
  @ApiProperty({
    example: 1,
    description: 'Id of user who created this come and go',
  })
  user_id: number;
}
