import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginUserDto {
  @ApiProperty({ example: 'sherlock_me', description: 'Userame of user' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'qwerty123', description: 'Password of user' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
