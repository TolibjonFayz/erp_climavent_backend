import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { ActivityService } from './activity.service';
import { QueryActivityDto } from './dto/query-activity.dto';

@ApiTags('Activity log')
// Faoliyat jurnalini faqat admin ko'radi; o'chirish yoki tahrirlash yo'li yo'q
@UseGuards(AdminGuard)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @ApiOperation({ summary: 'Faoliyat jurnali (filtrlar bilan)' })
  @Get()
  list(@Query() query: QueryActivityDto) {
    return this.activity.list(query);
  }

  @ApiOperation({ summary: "Xodim faoliyati qisqacha: oxirgi kirish, oxirgi faollik, amallar soni" })
  @Get('user/:id/summary')
  userSummary(@Param('id', ParseIntPipe) id: number) {
    return this.activity.userSummary(id);
  }
}
