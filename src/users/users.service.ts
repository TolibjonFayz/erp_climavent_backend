import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { InjectModel } from '@nestjs/sequelize';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { User } from './models/user.model';
import * as bcrypt from 'bcrypt';
import { SessionsService } from './sessions.service';
import { Response } from 'express';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { stripSecrets } from 'src/common/ownership';
import { ActivityService, ClientInfo } from 'src/activity/activity.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private readonly UsersRepository: typeof User,
    private readonly sessions: SessionsService,
    private readonly activity: ActivityService,
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
    client: ClientInfo = {},
  ) {
    // Har bir kirish urinishi jurnalga: muvaffaqiyatli, xato parol, bloklangan, noma'lum login
    const audit = (action: string, userId: number | null, error?: string) =>
      this.activity.record({
        user_id: userId,
        action,
        module: 'users',
        ok: action === 'login',
        error: error ?? null,
        payload: { username: String(loginuserDto.username || '').slice(0, 100) },
        client,
      });
    //Is user exists?
    let user = await this.UsersRepository.unscoped().findOne({
      where: { username: loginuserDto.username },
    });
    if (!user) {
      await audit('login_failed', null, "Bunday login yo'q");
      return res.status(404).json({
        message: 'Foydalanuvchi nomi yoki maxfiy parol xato kiritildi',
        messageRu: 'Неверно введено имя пользователя или пароль',
        status: res.statusCode,
      });
    }
    
    if (user.dataValues.is_blocked) {
      await audit('login_blocked', user.id, 'Akkount bloklangan');
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
      await audit('login_failed', user.id, "Parol noto'g'ri");
      return res.status(401).json({
        message: "Kiritilgan parol noto'gri",
        messageRu: 'Неверно введён пароль',
        status: res.statusCode,
      });
    }

    // Har bir login — alohida qurilma sessiyasi (sayt va telefon bir-birini chiqarmaydi)
    const tokens = await this.sessions.issue(user, client);
    await audit('login', user.id);

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

  // Foydalanuvchini butunlay o'chirish. Ish ma'lumoti (mijoz, obyekt, KP, shartnoma, loyiha,
  // vazifa, davomat) bo'lsa — o'chirmaymiz: FK'lar SET NULL bo'lib, yozuvlar egasiz qolardi.
  // Bunday xodim bloklanadi. Sinov akkauntlari kabi bo'sh foydalanuvchilar o'chadi.
  async deleteUserById(id: number) {
    const user = await this.UsersRepository.findByPk(id);
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    const checks: [string, string][] = [
      ['mijoz', 'SELECT count(*) FROM partners WHERE user_id = :id'],
      ['obyekt', 'SELECT count(*) FROM comeandgo WHERE user_id = :id'],
      ['KP', 'SELECT count(*) FROM kp WHERE created_by = :id'],
      ['shartnoma', 'SELECT count(*) FROM dogovor WHERE created_by = :id'],
      ['loyiha', 'SELECT count(*) FROM loyiha WHERE created_by = :id'],
      ['vazifa', 'SELECT count(*) FROM tasks WHERE assigned_to = :id OR created_by = :id'],
      ['davomat', 'SELECT count(*) FROM attendance WHERE user_id = :id'],
    ];
    const used: string[] = [];
    for (const [label, sql] of checks) {
      const [row] = await this.UsersRepository.sequelize!.query<{ count: string }>(sql, {
        replacements: { id },
        type: QueryTypes.SELECT,
      });
      if (Number(row?.count) > 0) used.push(`${row.count} ta ${label}`);
    }
    if (used.length) {
      throw new ConflictException(
        `Foydalanuvchida ish ma'lumotlari bor (${used.join(', ')}). O'chirish o'rniga bloklang.`,
      );
    }
    await user.destroy();
    return { deleted: true };
  }

  // Joriy parolni tekshirish. 400 (401 emas): frontend 401 da tizimdan chiqaradi
  async assertPassword(id: number, plain?: string) {
    if (!plain) throw new BadRequestException('Joriy parolni kiriting');
    const user = await this.UsersRepository.unscoped().findByPk(id);
    const hash = user?.get('password') as string | undefined;
    if (!hash || !(await bcrypt.compare(plain, hash))) {
      throw new BadRequestException("Joriy parol noto'g'ri");
    }
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
