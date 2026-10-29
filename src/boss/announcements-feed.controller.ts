import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import { BossService } from './boss.service';

// Boss e'lonlari barcha xodimlarga (saytdagi bildirishnoma qo'ng'irog'i).
// Yaratish/o'chirish BossController'da — faqat Boss
@ApiTags('Announcements')
@UseGuards(JwtGuard)
@Controller('announcements')
export class AnnouncementsFeedController {
  constructor(private readonly bossService: BossService) {}

  @ApiOperation({ summary: "So'nggi e'lonlar (har bir xodim uchun)" })
  @Get('feed')
  feed() {
    return this.bossService.getAnnouncementFeed();
  }
}
