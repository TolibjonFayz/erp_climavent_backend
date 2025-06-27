import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { LocationVideosService } from './location_videos.service';
import { CreateLocationVideoDto } from './dto/create-location_video.dto';
import { ApiProperty } from '@nestjs/swagger';

@Controller('location-videos')
export class LocationVideosController {
  constructor(private readonly locationVideosService: LocationVideosService) {}

  //Create a location video
  @ApiProperty({ description: 'Create a new location video' })
  @Post('create')
  create(@Body() createLocationVideoDto: CreateLocationVideoDto) {
    return this.locationVideosService.create(createLocationVideoDto);
  }

  //Get all location videos of a user
  @ApiProperty({ description: 'Get all location videos for a user' })
  @Get('user/:id')
  async getAllLocationVideos(@Param('id') userId: number): Promise<any> {
    return this.locationVideosService.getAllLocationVideosOfAUser(userId);
  }
}
