import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { LoginUserDto } from './login-user.dto';

export class UpdateUserPasswordDto extends PartialType(LoginUserDto) {
  @ApiProperty({ example: 'qwerty', description: 'Password of the user' })
  password: string;

  // O'z parolini almashtirganda majburiy (admin boshqaning parolini tiklaganda kerak emas)
  @ApiPropertyOptional({ description: 'Joriy parol' })
  @IsOptional()
  @IsString()
  old_password?: string;
}
