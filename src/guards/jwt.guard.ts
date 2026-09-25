import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import { User } from 'src/users/models/user.model';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Unauthorized(token not found)');
    }
    const bearer = authHeader.split(' ')[0];
    const token = authHeader.split(' ')[1];

    if (bearer != 'Bearer' || !token) {
      throw new UnauthorizedException('Unauthorized(token not found)');
    }

    const payload = this.verifyAccessToken(token);
    
    // Check if user is blocked in DB
    const user = await this.userModel.findByPk(payload.user_id || payload.id);
    if (user && user.is_blocked) {
      throw new ForbiddenException('Akkount bloklangan');
    }

    req.payload = payload;
    return true;
  }

  private verifyAccessToken(token: string) {
    let check: any;
    try {
      check = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
    return check;
  }
}
