import { User } from 'src/users/models/user.model';
import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { LocationVideosService } from './location_videos.service';
import { LocationVideosController } from './location_videos.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { LocationVideo } from './models/location_video.model';

@Module({
  imports: [JwtModule.register({}), SequelizeModule.forFeature([LocationVideo, User])],
  controllers: [LocationVideosController],
  providers: [LocationVideosService],
  exports: [LocationVideosService],
})
export class LocationVideosModule {}
