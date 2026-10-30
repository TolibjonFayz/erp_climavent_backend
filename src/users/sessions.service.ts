import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import { Op } from 'sequelize';
import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from './models/user.model';
import { UserSession } from './models/user-session.model';
import { ActivityService } from 'src/activity/activity.service';

type ClientInfo = { userAgent?: string; ip?: string; origin?: string };
type RefreshPayload = { user_id: number; is_admin?: boolean; sid?: number; exp?: number };

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

// Qurilma bo'yicha sessiyalar: login yangi sessiya ochadi, refresh tokenni aylantiradi
// (eskisi qayta ishlatilsa — sessiya bekor), logout va parol o'zgarishi sessiyalarni yopadi.
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(UserSession) private readonly sessions: typeof UserSession,
    @InjectModel(User) private readonly users: typeof User,
    private readonly jwt: JwtService,
    private readonly activity: ActivityService,
  ) {}

  async issue(user: User, client: ClientInfo) {
    const session = await this.sessions.create({
      user_id: user.id,
      token_hash: '',
      user_agent: client.userAgent?.slice(0, 255) || null,
      ip: client.ip?.slice(0, 64) || null,
      last_used_at: new Date(),
    });
    return this.rotate(session, user);
  }

  async refresh(refreshToken: string, client: ClientInfo) {
    const payload = this.verify(refreshToken);
    const user = await this.users.findByPk(payload.user_id);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.is_blocked) throw new ForbiddenException('Akkount bloklangan');

    if (!payload.sid) return this.upgradeLegacy(refreshToken, user, client);

    const session = await this.sessions.findOne({
      where: { id: payload.sid, user_id: user.id, revoked_at: null },
    });
    if (!session) throw new UnauthorizedException('Session ended');
    if (session.token_hash !== sha256(refreshToken)) {
      // Allaqachon almashtirilgan token qayta keldi — o'g'irlangan bo'lishi mumkin
      await session.update({ revoked_at: new Date() });
      throw new UnauthorizedException('Session ended');
    }
    if (client.ip) session.ip = client.ip.slice(0, 64);
    return this.rotate(session, user);
  }

  async logout(refreshToken: string, client: ClientInfo = {}) {
    let payload: RefreshPayload;
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: process.env.REFRESH_TOKEN_KEY_USER,
        ignoreExpiration: true,
      });
    } catch {
      return { ok: true };
    }
    if (payload?.user_id) {
      await this.activity.record({ user_id: payload.user_id, action: 'logout', module: 'users', client });
    }
    if (payload?.sid) {
      await this.sessions.update(
        { revoked_at: new Date() },
        { where: { id: payload.sid, token_hash: sha256(refreshToken), revoked_at: null } },
      );
    }
    return { ok: true };
  }

  // Parol almashganda yoki bloklanganda — boshqa qurilmalardagi sessiyalar yopiladi
  async revokeAll(userId: number, exceptSid?: number) {
    await this.sessions.update(
      { revoked_at: new Date() },
      {
        where: {
          user_id: userId,
          revoked_at: null,
          ...(exceptSid ? { id: { [Op.ne]: exceptSid } } : {}),
        },
      },
    );
  }

  // Sessiyalardan oldingi tokenlar (sid yo'q): users.refresh_token bilan mos kelsa — sessiyaga o'tkazamiz
  private async upgradeLegacy(refreshToken: string, user: User, client: ClientInfo) {
    const full = await this.users.unscoped().findByPk(user.id);
    const stored = full?.get('refresh_token') as string | undefined;
    if (!stored || !(await bcrypt.compare(refreshToken, stored))) {
      throw new UnauthorizedException('Session ended');
    }
    await this.users.update({ refresh_token: '' }, { where: { id: user.id } });
    return this.issue(user, client);
  }

  private async rotate(session: UserSession, user: User) {
    const payload = { user_id: user.id, is_admin: user.is_admin, sid: session.id };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
        expiresIn: process.env.ACCESS_TOKEN_TIME_USER,
      }),
      this.jwt.signAsync(payload, {
        secret: process.env.REFRESH_TOKEN_KEY_USER,
        expiresIn: process.env.REFRESH_TOKEN_TIME_USER,
        // Bir soniyada ikki marta imzolansa ham token har safar boshqacha bo'lsin —
        // aks holda eski token yangisiga teng chiqib, qayta ishlatish aniqlanmaydi
        jwtid: randomUUID(),
      }),
    ]);
    const exp = (this.jwt.decode(refreshToken) as RefreshPayload)?.exp;
    await session.update({
      token_hash: sha256(refreshToken),
      last_used_at: new Date(),
      expires_at: exp ? new Date(exp * 1000) : null,
    });
    return { accessToken, refreshToken };
  }

  private verify(refreshToken: string): RefreshPayload {
    if (!refreshToken) throw new UnauthorizedException('Refresh token required');
    try {
      return this.jwt.verify(refreshToken, { secret: process.env.REFRESH_TOKEN_KEY_USER });
    } catch {
      throw new UnauthorizedException('Session ended');
    }
  }
}
