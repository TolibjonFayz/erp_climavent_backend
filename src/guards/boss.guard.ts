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

// Boss sahifasi API'si: direktor yoki admin "boss" ruxsatini bergan xodim.
// Ruxsat yo'q bo'lsa 403 (401 emas) — frontend 401'da sessiyani tugatadi.
@Injectable()
export class BossGuard implements CanActivate {
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
      payload = await this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch {
      throw new UnauthorizedException('Invalid token provided');
    }

    const user = await this.userModel.findByPk(
      Number(payload?.user_id || payload?.id),
    );
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.is_blocked) {
      throw new ForbiddenException('Akkount bloklangan');
    }
    if (!hasBossAccess(user)) {
      throw new ForbiddenException("Boss sahifasiga ruxsat yo'q");
    }
    req.payload = payload;
    return true;
  }
}
