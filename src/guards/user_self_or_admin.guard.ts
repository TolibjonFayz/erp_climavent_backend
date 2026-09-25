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
export class UserSelfOrAdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = req?.params?.id;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('User unauthorized');
    }

    const bearer = authHeader.split(' ')[0];
    const token = authHeader.split(' ')[1];
    if (bearer != 'Bearer' || !token) {
      throw new UnauthorizedException('User unauthorized');
    }

    let user;
    try {
      user = this.jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });
    } catch (err) {
      user = null;
    }

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    // Check if user is blocked in DB
    const dbUser = await this.userModel.findByPk(user.user_id || user.id);
    if (dbUser && dbUser.is_blocked) {
      throw new ForbiddenException('Akkount bloklangan');
    }

    if (user.user_id != id && !user.is_admin) {
      throw new UnauthorizedException('You do not have permission to access this user');
    }

    req.user = user;
    return true;
  }
}
