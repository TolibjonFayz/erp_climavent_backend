import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import { User } from 'src/users/models/user.model';
import { hasBossAccess } from './boss-access';

// Admin (is_admin) YOKI boss sahifasiga ruxsati borlar (hasBossAccess) kira oladi.
@Injectable()
export class AdminOrBossGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}

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
      payload = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch {
      throw new UnauthorizedException('Invalid token provided');
    }

    const userId = Number(payload?.user_id || payload?.id);
    const user = await this.userModel.findByPk(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.is_blocked) {
      throw new ForbiddenException('Akkount bloklangan');
    }

    if (!user.is_admin && !hasBossAccess(user)) {
      throw new ForbiddenException('Faqat admin yoki boss uchun');
    }
    req.payload = payload;
    return true;
  }
}
