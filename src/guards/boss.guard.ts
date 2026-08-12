import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Faqat boss (direktor) kira oladi. Boss user_id .env'dan (default 16).
@Injectable()
export class BossGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('User unauthorized');
    }
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('User unauthorized');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch {
      throw new UnauthorizedException('Invalid token provided');
    }

    const bossId = Number(process.env.BOSS_USER_ID) || 16;
    if (Number(payload.user_id) !== bossId) {
      throw new UnauthorizedException('Only the boss can access this');
    }
    req.payload = payload;
    return true;
  }
}
