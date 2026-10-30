import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Res,
  Req,
  UseGuards,
  ForbiddenException,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UsersService } from './users.service';
import { ApiProperty } from '@nestjs/swagger';
import { Response } from 'express';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';
import { UserSelfOrAdminGuard } from 'src/guards/user_self_or_admin.guard';
import { SessionsService } from './sessions.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';

// Sessiya yozuvi uchun qurilma ma'lumoti (trust proxy yoqilgan — req.ip haqiqiy manzil)
const clientInfo = (req: any) => ({
  userAgent: String(req?.headers?.['user-agent'] || ''),
  ip: String(req?.ip || ''),
  origin: String(req?.headers?.origin || ''),
});

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
  ) {}

  //Register user — faqat admin yangi xodim qo'sha oladi (ochiq ro'yxatdan o'tish yo'q)
  @UseGuards(AdminGuard)
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
    @Req() req: any,
  ) {
    return this.usersService.loginUser(loginUserDto, res, clientInfo(req));
  }

  //Refresh — muddati o'tgan access token o'rniga yangisi (refresh token aylantiriladi)
  @ApiProperty({ description: 'Exchange a refresh token for new tokens' })
  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto, @Req() req: any) {
    return this.sessions.refresh(body.refreshToken, clientInfo(req));
  }

  //Logout — shu qurilma sessiyasini serverda yopadi
  @ApiProperty({ description: 'Revoke the session of this refresh token' })
  @Post('logout')
  logout(@Body() body: RefreshTokenDto, @Req() req: any) {
    return this.sessions.logout(body.refreshToken, clientInfo(req));
  }

  //Get user by id
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Get user by id' })
  @Get('one/:id')
  getUserById(@Param('id') id: number) {
    return this.usersService.getUserById(id);
  }

  //Get all users for admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Get all users' })
  @Get('all')
  getAllUser() {
    return this.usersService.getAllUsers();
  }

  //Update user by id
  @UseGuards(UserSelfOrAdminGuard)
  @ApiProperty({ description: 'Update user by id' })
  @Patch('update/:id')
  async updateUserById(
    @Param('id') id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ): Promise<any> {
    const loggedInUserId = req?.user?.user_id;
    if (loggedInUserId == id) {
      if (updateUserDto.is_admin !== undefined || updateUserDto.is_blocked !== undefined) {
        throw new ForbiddenException("O'zingizni admin qilish, adminlikdan olish yoki bloklash mumkin emas!");
      }
    }
    // Parol faqat update-password orqali (u hash'laydi) — bu yerda ochiq matn bazaga tushardi
    delete updateUserDto.password;
    // Ruxsatlarni (shu jumladan permissions.boss) faqat admin o'zgartiradi
    if (!req?.user?.is_admin && updateUserDto.permissions !== undefined) {
      throw new ForbiddenException("Ruxsatlarni faqat admin o'zgartira oladi");
    }
    const result = await this.usersService.updateUserById(id, updateUserDto);
    // Bloklangan xodimning barcha qurilmalardagi sessiyalari yopiladi
    if (updateUserDto.is_blocked === true) await this.sessions.revokeAll(Number(id));
    return result;
  }

  //Delete user — faqat admin, o'zini emas; ish ma'lumoti bo'lsa 409 (bloklash taklif qilinadi)
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Delete a user without business records' })
  @Delete('delete/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const actor = this.actorId(req);
    if (actor === id) throw new ForbiddenException("O'zingizni o'chira olmaysiz");
    return this.usersService.deleteUserById(id);
  }

  // AdminGuard req.payload qo'ymaydi — token'dan o'qiymiz
  private actorId(req: any): number | null {
    const token = String(req?.headers?.authorization || '').split(' ')[1];
    const payload = token ? (this.jwt.decode(token) as { user_id?: number } | null) : null;
    return payload?.user_id ?? null;
  }

  //Update user password by id
  @UseGuards(UserSelfOrAdminGuard)
  @ApiProperty({ description: 'Update user password by id' })
  @Patch('update-password/:id')
  async updateUserPasswordById(
    @Param('id') id: number,
    @Body() updateUserPasswordDto: UpdateUserPasswordDto,
    @Req() req: any,
  ): Promise<any> {
    const self = Number(req?.user?.user_id) === Number(id);
    // O'z parolini almashtirish — joriy parol bilan (ochiq qolgan telefon/brauzerdan
    // begona odam parolni o'zgartirib, akkauntni egallab ololmasin)
    if (self) await this.usersService.assertPassword(id, updateUserPasswordDto.old_password);
    const result = await this.usersService.updateUserPasswordById(id, updateUserPasswordDto);
    // Parol almashdi — boshqa qurilmalar qayta kirsin. O'zi almashtirsa, joriy sessiya qoladi
    await this.sessions.revokeAll(Number(id), self ? req.user.sid : undefined);
    return result;
  }
}
