import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { User } from 'src/users/models/user.model';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('User unauthorized');
    }

    const bearer = authHeader.split(' ')[0];
    const token = authHeader.split(' ')[1];
    if (bearer != 'Bearer' || !token) {
      throw new UnauthorizedException('User unauthorized');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid token provided');
    }
    
    if (!payload) {
      throw new UnauthorizedException('Invalid token provided');
    }

    const user = await this.userModel.findByPk(payload.user_id || payload.id);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.is_blocked) {
      throw new ForbiddenException('Akkount bloklangan');
    }

    if (!user.is_admin) {
      throw new UnauthorizedException('You are not our admin bro, go away');
    }
    return true;
  }
}
