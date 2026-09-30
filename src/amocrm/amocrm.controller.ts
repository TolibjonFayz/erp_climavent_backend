import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOrBossGuard } from 'src/guards/admin_or_boss.guard';
import { AmocrmService } from './amocrm.service';
import {
  CallsListQueryDto,
  ExcludePhoneDto,
  LeadsListQueryDto,
  StatsQueryDto,
  SuspiciousQueryDto,
} from './dto/stats-query.dto';

// amoCRM statistikasi — faqat admin va boss uchun. amoCRM'ga hech narsa yozilmaydi.
@ApiTags('amoCRM')
@UseGuards(AdminOrBossGuard)
@Controller('amocrm')
export class AmocrmController {
  constructor(private readonly amocrmService: AmocrmService) {}

  @Get('stats')
  getStats(@Query() query: StatsQueryDto) {
    return this.amocrmService.getStats(query);
  }

  // Statistikadagi son ustiga bosilganda — qo'ng'iroqlar / raqamlar ro'yxati
  @Get('calls')
  listCalls(@Query() query: CallsListQueryDto) {
    return this.amocrmService.listCalls(query);
  }

  // Statistikadagi son ustiga bosilganda — sdelkalar ro'yxati
  @Get('leads')
  listLeads(@Query() query: LeadsListQueryDto) {
    return this.amocrmService.listLeads(query);
  }

  // ─── "Mijoz emas" raqamlar ───
  // Juda ko'p qo'ng'iroq bo'lgan, hali belgilanmagan raqamlar (hamkasb/tanishga o'xshaganlar)
  @Get('suspicious')
  suspicious(@Query() query: SuspiciousQueryDto) {
    return this.amocrmService.suspicious(query);
  }

  @Get('excluded-phones')
  listExcluded() {
    return this.amocrmService.listExcluded();
  }

  @Post('excluded-phones')
  excludePhone(@Body() dto: ExcludePhoneDto, @Req() req: any) {
    const userId = Number(req.payload?.user_id || req.payload?.id) || null;
    return this.amocrmService.excludePhone(dto, userId);
  }

  @Delete('excluded-phones/:key')
  restorePhone(@Param('key') key: string) {
    return this.amocrmService.restorePhone(key);
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
