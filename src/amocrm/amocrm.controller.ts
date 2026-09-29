import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOrBossGuard } from 'src/guards/admin_or_boss.guard';
import { AmocrmService } from './amocrm.service';
import { StatsQueryDto } from './dto/stats-query.dto';

// amoCRM statistikasi — faqat admin va boss uchun. Faqat o'qish.
@ApiTags('amoCRM')
@UseGuards(AdminOrBossGuard)
@Controller('amocrm')
export class AmocrmController {
  constructor(private readonly amocrmService: AmocrmService) {}

  @Get('stats')
  getStats(@Query() query: StatsQueryDto) {
    return this.amocrmService.getStats(query);
  }

  @Get('sync/status')
  getSyncStatus() {
    return this.amocrmService.getSyncStatus();
  }

  // Qo'lda yangilash. full=true — oxirgi 1 yilni to'liq qayta o'tish.
  @Post('sync')
  runSync(@Body('full') full?: boolean) {
    return this.amocrmService.runSync(full === true);
  }
}
