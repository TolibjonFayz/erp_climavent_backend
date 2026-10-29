import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { InjectModel } from '@nestjs/sequelize';
import { Injectable } from '@nestjs/common';
import { User } from './models/user.model';
import * as bcrypt from 'bcrypt';
import { SessionsService } from './sessions.service';
import { Response } from 'express';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { stripSecrets } from 'src/common/ownership';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private readonly UsersRepository: typeof User,
    private readonly sessions: SessionsService,
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

    // Foydalanuvchini admin yaratadi — yangi odam uchun token/cookie berilmaydi,
    // u o'zi login qiladi
    return {
      message: "Foydalanuvchi muvaffaqiyatli ro'yxatdan o'tdi",
      user: stripSecrets(newUser),
      status: res.statusCode,
    };
  }

  // Login user
  async loginUser(
    loginuserDto: LoginUserDto,
    res: Response,
    client: { userAgent?: string; ip?: string } = {},
  ) {
    //Is user exists?
    let user = await this.UsersRepository.unscoped().findOne({
      where: { username: loginuserDto.username },
    });
    if (!user) {
      return res.status(404).json({
        message: 'Foydalanuvchi nomi yoki maxfiy parol xato kiritildi',
        messageRu: 'Неверно введено имя пользователя или пароль',
        status: res.statusCode,
      });
    }
    
    if (user.dataValues.is_blocked) {
      return res.status(403).json({
        message: 'Akkount bloklangan',
        messageRu: 'Аккаунт заблокирован',
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

    // Har bir login — alohida qurilma sessiyasi (sayt va telefon bir-birini chiqarmaydi)
    const tokens = await this.sessions.issue(user, client);

    const response = {
      message: 'Verification code sent to user',
      user: stripSecrets(user),
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

  //Get all users
  async getAllUsers() {
    const users = await this.UsersRepository.findAll({
      order: [['createdAt', 'ASC']],
      attributes: { exclude: ['password', 'refresh_token'] },
      include: { all: true },
    });
    return users;
  }

  //Update user by id
  async updateUserById(id: number, updateUserDto: UpdateUserDto) {
    const updatedUser = await this.UsersRepository.update(updateUserDto, {
      where: { id: id },
      returning: true,
    });
    return {
      updatedUser: stripSecrets(updatedUser[1][0]),
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
      updatedUser: stripSecrets(updatedUser[1][0]),
      message: 'User password updated successfully',
    };
  }
}
