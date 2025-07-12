import { Injectable } from '@nestjs/common';
import { CreateLocationVideoDto } from './dto/create-location_video.dto';
import { UpdateLocationVideoDto } from './dto/update-location_video.dto';
import { InjectModel } from '@nestjs/sequelize';
import { LocationVideo } from './models/location_video.model';

@Injectable()
export class LocationVideosService {
  constructor(
    @InjectModel(LocationVideo)
    private readonly LocatoinVideoRepository: typeof LocationVideo,
  ) {}

  // Creating a location video
  async create(createLocationVideoDto: CreateLocationVideoDto) {
    const newCGO = await this.LocatoinVideoRepository.create(
      createLocationVideoDto,
    );
    return {
      newCGO,
    };
  }

  // Get all location videos of a user
  async getAllLocationVideosOfAUser(userId: number) {
    const allCGO = await this.LocatoinVideoRepository.findAll({
      where: { user_id: userId },
    });
    return allCGO;
  }

  // Get all videos of a location
  async getAllVideosOfALocation(id: number) {
    const allCGO = await this.LocatoinVideoRepository.findAll({
      where: { id: id },
    });
    return allCGO;
  }
}
