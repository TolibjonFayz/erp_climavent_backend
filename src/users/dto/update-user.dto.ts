import { ApiProperty, PartialType } from '@nestjs/swagger';
import { LoginUserDto } from './login-user.dto';
import { IsOptional, IsBoolean, IsObject } from 'class-validator';

export class UpdateUserDto extends PartialType(LoginUserDto) {
  @ApiProperty({ example: 'John', description: 'Firstname of the user' })
  firstname: string;

  @ApiProperty({ example: 'Doe', description: 'Lastname of the user' })
  lastname: string;

  @ApiProperty({
    example: '+998908150412',
    description: 'Phone number of the user',
  })
  phone_number: string;

  @ApiProperty({ example: 'john@gmail.com', description: 'Email of the user' })
  email: string;

  @ApiProperty({
    example: 'profile_image.jpg',
    description: 'Profile image of the user',
  })
  profile_image: string;

  @ApiProperty({ example: 'sherlock_me', description: 'Userame of user' })
  username: string;

  @ApiProperty({ example: 'qwerty123', description: 'Password of user' })
  @IsOptional()
  password?: string;

  @ApiProperty({ example: true, description: 'Is admin' })
  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;

  @ApiProperty({ example: false, description: 'Is blocked' })
  @IsOptional()
  @IsBoolean()
  is_blocked?: boolean;

  @ApiProperty({ example: {}, description: 'Permissions object' })
  @IsOptional()
  @IsObject()
  permissions?: any;
}
