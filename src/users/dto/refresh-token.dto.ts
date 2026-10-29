import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Login paytida berilgan refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
