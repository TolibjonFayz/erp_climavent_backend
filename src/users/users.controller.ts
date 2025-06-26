import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
} from '@nestjs/common';
import { LoginUserDto } from './dto/login-user.dto';
import { UsersService } from './users.service';
import { ApiProperty } from '@nestjs/swagger';
import { Response } from 'express';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './models/user.model';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  //Login user
  @ApiProperty({ description: 'Login user with username and password' })
  @Post('login')
  loginUser(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.usersService.loginUser(loginUserDto, res);
  }

  //Get user by id
  @ApiProperty({ description: 'Get user by id' })
  @Get('one/:id')
  getUserById(@Param('id') id: number) {
    return this.usersService.getUserById(id);
  }

  //Update user by id
  @ApiProperty({ description: 'Update user by id' })
  @Patch('update/:id')
  updateUserById(
    @Param('id') id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<any> {
    return this.usersService.updateUserById(id, updateUserDto);
  }
}
