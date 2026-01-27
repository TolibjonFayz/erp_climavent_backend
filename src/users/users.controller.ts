import { Controller, Get, Post, Body, Patch, Param, Res } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UsersService } from './users.service';
import { ApiProperty } from '@nestjs/swagger';
import { Response } from 'express';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  //Register user
  @ApiProperty({ description: 'Register user with username and password' })
  @Post('register')
  registerUser(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.usersService.registerUser(createUserDto, res);
  }

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

  //Update user password by id
  @ApiProperty({ description: 'Update user password by id' })
  @Patch('update-password/:id')
  updateUserPasswordById(
    @Param('id') id: number,
    @Body() updateUserPasswordDto: UpdateUserPasswordDto,
  ): Promise<any> {
    return this.usersService.updateUserPasswordById(id, updateUserPasswordDto);
  }
}
