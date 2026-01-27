import { ApiProperty, PartialType } from '@nestjs/swagger';
import { LoginUserDto } from './login-user.dto';

export class UpdateUserPasswordDto extends PartialType(LoginUserDto) {
  @ApiProperty({ example: 'qwerty', description: 'Password of the user' })
  password: string;
}
