import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';

@Injectable()
export class UserSelfObyektGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}
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

    async function verify(token: string, jwtService: JwtService) {
      const user = await jwtService.verify(token, {
        secret: process.env.ACCESS_TOKEN_KEY_USER,
      });

      if (!user) {
        throw new UnauthorizedException('Invalid token provided');
      }

      const user_info = await ComeAndGo.findOne({ where: { id } });

      if (user?.user_id != user_info?.dataValues.user_id) {
        throw new UnauthorizedException('You are not you!');
      }

      return true;
    }
    return verify(token, this.jwtService);
  }
}
