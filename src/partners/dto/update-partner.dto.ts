import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreatePartnerDto } from './create-partner.dto';

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {
  @ApiProperty({ example: 1, description: 'Unique id' })
  declare id: number;

  @ApiProperty({ example: 'Mantajnik', description: 'Partner type' })
  partner_type: string;

  @ApiProperty({ example: "O'zbekiston", description: 'Republic' })
  republic: string;

  @ApiProperty({ example: 'Toshkent viloyati', description: 'Viloyat' })
  viloyat: string;

  @ApiProperty({ example: 'Toshkent shahri', description: 'Shahar/Tuman' })
  shahar_tuman: string;

  @ApiProperty({ example: 'Yuridik shaxs', description: 'Mijoz turi' })
  mijozturi: string;

  @ApiProperty({ example: '5456465446', description: 'Inn' })
  inn: string;

  @ApiProperty({ example: '+998901234567', description: 'Phone number' })
  phone_number: string;

  @ApiProperty({
    example: '+998901234567',
    description: 'Additional phone number',
  })
  additional_phone_number: string;

  @ApiProperty({ example: 'John Doe', description: 'Full name' })
  fullname: string;

  @ApiProperty({ example: 'Smt', description: 'More info about this partner' })
  more_info: string;

  @ApiProperty({ example: 1, description: 'User ID' })
  user_id: number;
}
