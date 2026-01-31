import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Injectable } from '@nestjs/common';
import { User } from './models/user.model';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private readonly UsersRepository: typeof User,
    private readonly jwtservice: JwtService,
  ) {}
  // Register user
  async registerUser(createUserDto: CreateUserDto, res: Response) {
    //Check if user exists
    const existingUser = await this.UsersRepository.findOne({
      where: { username: createUserDto.username },
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: 'Foydalanuvchi nomi band', status: res.statusCode });
    }

    //Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 7);

    //Create new user
    const newUser = await this.UsersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      is_admin: false,
      refresh_token: '',
    });

    //Generate tokens
    const tokens = await this.getTokens(newUser);
    const hashed_refresh_token = await bcrypt.hash(tokens.refreshToken, 7);
    const updateUser = await this.UsersRepository.update(
      { refresh_token: hashed_refresh_token },
      { where: { id: newUser.id }, returning: true },
    );

    //Cookie setting
    res.cookie('refresh_token', tokens.refreshToken, {
      maxAge: 15 * 24 * 60 * 60 * 10000,
      httpOnly: true,
    });

    return {
      message: "Foydalanuvchi muvaffaqiyatli ro'yxatdan o'tdi",
      user: newUser,
      tokens,
      status: res.statusCode,
    };
  }

  // Login user
  async loginUser(loginuserDto: LoginUserDto, res: Response) {
    //Is user exists?
    let user = await this.UsersRepository.findOne({
      where: { username: loginuserDto.username },
    });
    if (!user) {
      return res.status(404).json({
        message: 'Foydalanuvchi nomi yoki maxfiy parol xato kiritildi',
        messageRu: 'Неверно введено имя пользователя или пароль',
        status: res.statusCode,
      });
    }

    //Check password
    const isPasswordValid = await bcrypt.compare(
      loginuserDto.password,
      user.dataValues.password,
    );
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Kiritilgan parol noto'gri",
        messageRu: 'Неверно введён пароль',
        status: res.statusCode,
      });
    }

    //Generate new tokens
    const tokens = await this.getTokens(user);
    const hashed_refresh_token = await bcrypt.hash(tokens.refreshToken, 7);
    const updateUser = await this.UsersRepository.update(
      { refresh_token: hashed_refresh_token },
      { where: { id: user.id }, returning: true },
    );

    //Cookie setting
    res.cookie('refresh_token', tokens.refreshToken, {
      maxAge: 15 * 24 * 60 * 60 * 10000,
      httpOnly: true,
    });

    const response = {
      message: 'Verification code sent to user',
      user: updateUser[1][0],
      tokens,
    };
    return response;
  }

  //Get user by id
  async getUserById(id: number) {
    const user = await this.UsersRepository.findOne({
      where: { id: id },
      attributes: { exclude: ['password', 'refresh_token'] },
    });
    if (!user) {
      return {
        message: 'User not found',
      };
    }
    return user;
  }

  //Update user by id
  async updateUserById(id: number, updateUserDto: UpdateUserDto) {
    const updatedUser = await this.UsersRepository.update(updateUserDto, {
      where: { id: id },
      returning: true,
    });
    return {
      updatedUser,
      message: 'User updated successfully',
    };
  }

  //Update user password by user id
  async updateUserPasswordById(
    id: number,
    updateUserPasswordDto: UpdateUserPasswordDto,
  ) {
    const hashedPassword = await bcrypt.hash(updateUserPasswordDto.password, 7);
    const updatedUser = await this.UsersRepository.update(
      { password: hashedPassword },
      {
        where: { id: id },
        returning: true,
      },
    );
    return {
      updatedUser,
      message: 'User password updated successfully',
    };
  }

  //Token generation
  async getTokens(user: User) {
    const JwtPayload = {
      user_id: user.dataValues.id,
      is_admin: user.dataValues.is_admin,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtservice.signAsync(JwtPayload, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
        expiresIn: process.env.ACCESS_TOKEN_TIME_USER,
      }),
      this.jwtservice.signAsync(JwtPayload, {
        secret: process.env.REFRESH_TOKEN_KEY_USER,
        expiresIn: process.env.REFRESH_TOKEN_TIME_USER,
      }),
    ]);
    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }
}
