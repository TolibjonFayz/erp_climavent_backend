import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/users/models/user.model';
import { AppRelease } from './app-release.model';
import { AppReleasesController } from './app-releases.controller';
import { AppReleasesService } from './app-releases.service';

@Module({
  imports: [SequelizeModule.forFeature([AppRelease, User]), JwtModule.register({})],
  controllers: [AppReleasesController],
  providers: [AppReleasesService],
})
export class AppReleasesModule {}
