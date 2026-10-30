import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BossService } from './boss.service';
import {
  CreateAnnouncementDto,
  CreateTargetDto,
  PromoteDto,
} from './dto/boss.dto';
import { BossGuard } from 'src/guards/boss.guard';
import { BossSalesService, SALES_PERIODS, SalesPeriod } from './boss-sales.service';

// Direktor yoki admin "boss" ruxsatini bergan xodimlar uchun (BossGuard)
@UseGuards(BossGuard)
@Controller('boss')
export class BossController {
  constructor(
    private readonly bossService: BossService,
    private readonly salesService: BossSalesService,
  ) {}

  // ─── Savdo: KP, shartnomalar, menejerlar konversiyasi, mijozlar, raqiblar ───
  @Get('sales')
  sales(@Query('period') period?: string) {
    const p = (SALES_PERIODS as readonly string[]).includes(period ?? '') ? (period as SalesPeriod) : 'year';
    return this.salesService.overview(p);
  }

  // ─── Targets ───
  @Post('targets')
  upsertTarget(@Body() dto: CreateTargetDto) {
    return this.bossService.upsertTarget(dto);
  }

  @Get('targets')
  getTargets(@Query('month') month?: string) {
    return this.bossService.getTargets(month);
  }

  @Delete('targets/:id')
  deleteTarget(@Param('id') id: string) {
    return this.bossService.deleteTarget(+id);
  }

  // ─── Announcements ───
  @Post('announcements')
  createAnnouncement(@Body() dto: CreateAnnouncementDto) {
    return this.bossService.createAnnouncement(dto);
  }

  @Get('announcements')
  getAnnouncements() {
    return this.bossService.getAnnouncements();
  }

  @Delete('announcements/:id')
  deleteAnnouncement(@Param('id') id: string) {
    return this.bossService.deleteAnnouncement(+id);
  }

  // ─── Promote / demote ───
  @Patch('promote/:userId')
  setAdmin(@Param('userId') userId: string, @Body() dto: PromoteDto) {
    return this.bossService.setAdmin(+userId, dto.is_admin);
  }
}
