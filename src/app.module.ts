import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersModule } from './users/users.module';
import { User } from './users/models/user.model';
import { ComeAndGoesModule } from './come_and_goes/come_and_goes.module';
import { LocationVideosModule } from './location_videos/location_videos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      username: process.env.POSTGRES_USER,
      password: String(process.env.POSTGRES_PASSWORD),
      database: process.env.POSTGRES_DB,
      autoLoadModels: true,
      logging: false,
      dialectOptions: {
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
