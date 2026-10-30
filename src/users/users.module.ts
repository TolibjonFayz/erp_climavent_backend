import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './models/user.model';
import { UserSession } from './models/user-session.model';
import { SessionsService } from './sessions.service';
import { JwtModule } from '@nestjs/jwt';
import { SessionGateMiddleware } from './session-gate.middleware';

@Global()
@Module({
  imports: [SequelizeModule.forFeature([User, UserSession]), JwtModule.register({})],
  controllers: [UsersController],
  providers: [UsersService, SessionsService],
  exports: [UsersService, SequelizeModule, JwtModule],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionGateMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
