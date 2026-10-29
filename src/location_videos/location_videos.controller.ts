import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { LocationVideosService } from './location_videos.service';
import { CreateLocationVideoDto } from './dto/create-location_video.dto';
import { ApiProperty } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';
import { assertOwnerOrAdmin, ownUserId } from 'src/common/ownership';

@UseGuards(JwtGuard)
@Controller('location-videos')
export class LocationVideosController {
  constructor(private readonly locationVideosService: LocationVideosService) {}

  // Video obyektga (come_and_go) tegishli — obyekt egasi yoki admin
  private async assertLocationAccess(comeAndGoId: unknown, req: any) {
    if (req.payload.is_admin) return;
    const location = comeAndGoId != null ? await ComeAndGo.findByPk(Number(comeAndGoId)) : null;
    if (!location) throw new NotFoundException('Obyekt topilmadi');
    assertOwnerOrAdmin(req.payload, location.get('user_id'));
  }

  //Create a location video
  @ApiProperty({ description: 'Create a new location video' })
  @Post('create')
  async create(@Body() createLocationVideoDto: CreateLocationVideoDto, @Req() req: any) {
    await this.assertLocationAccess(createLocationVideoDto.comeandgo_id, req);
    createLocationVideoDto.user_id = ownUserId(req.payload, createLocationVideoDto.user_id);
    return this.locationVideosService.create(createLocationVideoDto);
  }

  //Get all location videos of a user
  @ApiProperty({ description: 'Get all location videos for a user' })
  @Get('user/:id')
  async getAllLocationVideos(@Param('id') userId: number, @Req() req: any): Promise<any> {
    assertOwnerOrAdmin(req.payload, userId);
    return this.locationVideosService.getAllLocationVideosOfAUser(userId);
  }

  //Get all videos of a location
  @ApiProperty({ description: 'Get all videos for a location' })
  @Get('one/:id')
  async getAllVideosOfALocation(@Param('id') id: number, @Req() req: any): Promise<any> {
    await this.assertLocationAccess(id, req);
    return this.locationVideosService.getAllVideosOfALocation(id);
  }
}
