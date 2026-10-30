import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { User } from 'src/users/models/user.model';
import { ActivityLog } from './activity-log.model';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { ActivityMiddleware } from './activity.middleware';

@Global()
@Module({
  imports: [SequelizeModule.forFeature([ActivityLog, User]), JwtModule.register({})],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule implements NestModule {
  // Modul middleware'i body-parser'dan keyin ishlaydi — AsyncLocalStorage konteksti
  // so'rov oxirigacha saqlanadi (body-parser'dan oldin qo'yilsa kontekst yo'qoladi)
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ActivityMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
