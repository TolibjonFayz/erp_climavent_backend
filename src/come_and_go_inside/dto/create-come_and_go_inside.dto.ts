import { ApiProperty } from '@nestjs/swagger';

export class CreateComeAndGoInsideDto {
  @ApiProperty({
    example: '18.05.2025 15:21',
    description: 'When user come from a place (time)',
  })
  when_gone: Date;

  @ApiProperty({
    example: 'Tashkent',
    description: 'Where to user gone (place)',
  })
  when_came: Date;

  @ApiProperty({
    example: 'Tashkent',
    description: 'Where to user gone (place)',
  })
  whereto: string;

  @ApiProperty({ example: 'Proyekt', description: 'Location latitude' })
  lat: string;

  @ApiProperty({ example: 'Proyekt', description: 'Location longitude' })
  lng: string;

  @ApiProperty({ example: 'Proyekt', description: 'Location name' })
  locationname: string;

  @ApiProperty({ example: 'dogovor', description: 'Dogovor or kp' })
  dogovor_or_kp: string;

  @ApiProperty({ example: '24.01.2019', description: 'Date of dagavor' })
  dogovorkp_date: Date;

  @ApiProperty({ example: '24.01.2019', description: 'Number of dagavor' })
  dogovorkp_number: string;

  @ApiProperty({ example: 'Man city', description: 'Company name' })
  company_name: string;

  @ApiProperty({ example: 'Comment', description: 'More info' })
  more_info: string;

  @ApiProperty({
    example: 1,
    description: 'Id of user who created this come and go',
  })
  user_id: number;

  @ApiProperty({ example: 1, description: 'Father come and go id' })
  come_and_go_father_id: number;
}
