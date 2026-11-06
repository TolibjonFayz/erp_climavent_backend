import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';
import { CreateLeadDto, LeadQueryDto, SetWebhookDto, UpdateLeadDto } from './dto/lead.dto';
import { LeadsService } from './leads.service';
import { TelegramLeadsService } from './telegram.service';

// Telegram yo'llari `leads/:id` dan OLDIN ro'yxatdan o'tishi kerak (modulda shu tartibda)
@ApiTags('Leads / Telegram')
@Controller('leads/telegram')
export class LeadsTelegramController {
  constructor(private readonly telegram: TelegramLeadsService) {}

  // Telegram o'zi chaqiradi: JWT yo'q, o'rniga X-Telegram-Bot-Api-Secret-Token sarlavhasi
  @SkipThrottle()
  @HttpCode(200)
  @Post('webhook')
  webhook(@Headers('x-telegram-bot-api-secret-token') secret: string, @Body() update: any) {
    this.telegram.assertSecret(secret);
    return this.telegram.handleUpdate(update);
  }

  @ApiOperation({ summary: 'Bot va webhook holati (admin)' })
  @UseGuards(AdminGuard)
  @Get('status')
  status() {
    return this.telegram.status();
  }

  @ApiOperation({ summary: "Webhook'ni ulash (admin)" })
  @UseGuards(AdminGuard)
  @Post('set-webhook')
  setWebhook(@Body() dto: SetWebhookDto) {
    return this.telegram.setWebhook(dto.base_url);
  }
}

@ApiTags('Leads')
@UseGuards(JwtGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @ApiOperation({ summary: "Lidlar ro'yxati (filtr, qidiruv, sahifalash) + holat/manba sonlari" })
  @Get()
  list(@Query() query: LeadQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number) {
    return this.service.one(id);
  }

  @ApiOperation({ summary: "Lidni qo'lda qo'shish" })
  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeadDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
