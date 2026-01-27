import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'John', description: 'Firstname of user' })
  firstname: string;

  @ApiProperty({ example: 'Doe', description: 'Lastname of user' })
  lastname: string;

  @ApiProperty({
    example: '+998908150412',
    description: 'Phone number of user',
  })
  phone_number: string;

  @ApiProperty({
    example: 'sherlock_me@gmail.com',
    description: 'Email of user',
  })
  email: string;

  @ApiProperty({ example: 'profile.jpg', description: 'Profile image of user' })
  profile_image: string;

  @ApiProperty({ example: 'sherlock_me', description: 'Userame of user' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'qwerty123', description: 'Password of user' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
