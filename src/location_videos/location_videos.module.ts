import { Module } from '@nestjs/common';
import { LocationVideosService } from './location_videos.service';
import { LocationVideosController } from './location_videos.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { LocationVideo } from './models/location_video.model';

@Module({
  imports: [SequelizeModule.forFeature([LocationVideo])],
  controllers: [LocationVideosController],
  providers: [LocationVideosService],
  exports: [LocationVideosService],
})
export class LocationVideosModule {}
