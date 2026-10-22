import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from './users/users.module';
import { User } from './users/models/user.model';
import { ComeAndGoesModule } from './come_and_gos/come_and_goes.module';
import { LocationVideosModule } from './location_videos/location_videos.module';
import { ComeAndGoesInsideModule } from './come_and_go_inside/come_and_goes_inside.module';
import { PartnersModule } from './partners/partners.module';
import { AuditLogModule } from './audit_log/audit_log.module';
import { TasksModule } from './tasks/tasks.module';
import { AttendanceModule } from './attendance/attendance.module';
import { BossModule } from './boss/boss.module';
import { KpModule } from './kp/kp.module';
import { DogovorModule } from './dogovor/dogovor.module';
import { LoyihaModule } from './loyiha/loyiha.module';
import { StorageModule } from './storage/storage.module';
import { AmocrmModule } from './amocrm/amocrm.module';
import { DevicesModule } from './devices/devices.module';
import { AppReleasesModule } from './app_releases/app-releases.module';
import { SkladModule } from './sklad/sklad.module';
import { TrainingModule } from './training/training.module';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      username: process.env.POSTGRES_USER,
      password: String(process.env.POSTGRES_PASSWORD),
      database: process.env.POSTGRES_DB,
      autoLoadModels: true,
      logging: false,
      // POSTGRES_SSL=false — faqat lokal sinov bazasi uchun (Railway'da SSL shart)
      dialectOptions:
        process.env.POSTGRES_SSL === 'false'
          ? {}
          : {
              ssl: {
                require: true,
                rejectUnauthorized: false,
              },
            },
      models: [User],
    }),
    UsersModule,
    ComeAndGoesModule,
    LocationVideosModule,
    ComeAndGoesInsideModule,
    PartnersModule,
    AuditLogModule,
    TasksModule,
    AttendanceModule,
    BossModule,
    KpModule,
    DogovorModule,
    StorageModule,
    LoyihaModule,
    AmocrmModule,
    DevicesModule,
    AppReleasesModule,
    SkladModule,
    TrainingModule,
  ],
  controllers: [],
  providers: [
    {
      provide: 'APP_GUARD',
      useClass: require('@nestjs/throttler').ThrottlerGuard,
    }
  ],
})
export class AppModule {}
