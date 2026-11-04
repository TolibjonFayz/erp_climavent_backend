import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import {
  CreateNoteDto,
  CreateOrderDto,
  CreatePaymentDto,
  HookDto,
  OtgruzkaSettingsDto,
  ScriptUrlDto,
  UpdateOrderDto,
  UpdatePaymentDto,
} from './dto/otgruzka.dto';
import { AuthPayload, OtgruzkaService } from './otgruzka.service';

interface RequestWithPayload {
  payload: AuthPayload;
}

@ApiTags('Otgruzka')
@UseGuards(JwtGuard)
@Controller('otgruzka')
export class OtgruzkaController {
  constructor(private readonly service: OtgruzkaService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Rejim (mirror | live) va oxirgi sinxron natijasi' })
  settings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Rejimni almashtirish (admin)' })
  async updateSettings(@Body() dto: OtgruzkaSettingsDto, @Req() req: RequestWithPayload) {
    await this.service.assertAdmin(req.payload);
    return this.service.setMode(dto.mode);
  }

  @Get('script')
  @ApiOperation({ summary: 'Apps Script: maxfiy kalit va ulangan manzil (admin)' })
  async script(@Req() req: RequestWithPayload) {
    await this.service.assertAdmin(req.payload);
    return this.service.scriptSettings();
  }

  @Patch('script')
  @ApiOperation({ summary: "Apps Script Web App manzilini ulash (tekshirib saqlanadi, admin)" })
  async setScript(@Body() dto: ScriptUrlDto, @Req() req: RequestWithPayload) {
    await this.service.assertAdmin(req.payload);
    return this.service.setScriptUrl(dto.script_url);
  }

  @Post('script/test')
  @ApiOperation({ summary: 'Apps Script bilan aloqani tekshirish (admin)' })
  async testScript(@Req() req: RequestWithPayload) {
    await this.service.assertAdmin(req.payload);
    return this.service.testScript();
  }

  @Post('sync')
  @ApiOperation({ summary: "Google Sheets'dan hozir sinxronlash" })
  sync(@Req() req: RequestWithPayload) {
    return this.service.sync(req.payload.user_id);
  }

  @Get('list')
  @ApiOperation({ summary: "Barcha kartalar (hisoblangan holatlar va signallar bilan)" })
  @ApiQuery({ name: 'removed', required: false, description: "1 — jadvaldan o'chirilganlar ham" })
  list(@Query('removed') removed?: string) {
    return this.service.list(removed === '1');
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard: menejerlar, bosqichlar, signallar' })
  stats() {
    return this.service.stats();
  }

  @Get('lines')
  @ApiOperation({ summary: "Shartnomalar bo'yicha tovar qatorlari (Лист1)" })
  lines() {
    return this.service.lines();
  }

  @Get('one/:id')
  @ApiOperation({ summary: "Karta: to'lovlar, tarix, tovar qatorlari" })
  one(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post('create')
  @ApiOperation({ summary: "Yangi karta (faqat ERP asosiy rejimda)" })
  create(@Body() dto: CreateOrderDto, @Req() req: RequestWithPayload) {
    return this.service.create(dto, req.payload);
  }

  @Patch('update/:id')
  @ApiOperation({ summary: "Kartani o'zgartirish (mirror rejimda faqat keyingi qadam)" })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderDto, @Req() req: RequestWithPayload) {
    return this.service.update(id, dto, req.payload);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: "To'lov qo'shish (faqat ERP asosiy rejimda)" })
  addPayment(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePaymentDto, @Req() req: RequestWithPayload) {
    return this.service.addPayment(id, dto, req.payload);
  }

  @Patch('payments/:id')
  @ApiOperation({ summary: "To'lov sanasi/izohini to'g'rilash" })
  updatePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaymentDto, @Req() req: RequestWithPayload) {
    return this.service.updatePayment(id, dto, req.payload);
  }

  @Delete('payments/:id')
  @ApiOperation({ summary: "ERP'da kiritilgan to'lovni o'chirish" })
  removePayment(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePayment(id);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: "Izoh yoki qo'ng'iroq yozuvi qo'shish" })
  addNote(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateNoteDto, @Req() req: RequestWithPayload) {
    return this.service.addNote(id, dto, req.payload);
  }

  @Delete('notes/:id')
  @ApiOperation({ summary: "O'z izohini o'chirish (2 kun ichida; admin — har doim)" })
  removeNote(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithPayload) {
    return this.service.removeNote(id, req.payload);
  }
}

// Jadval tahrirlanganda Google Apps Script chaqiradi — JWT yo'q, maxfiy kalit bilan
@ApiTags('Otgruzka')
@Controller('otgruzka')
export class OtgruzkaHookController {
  constructor(private readonly service: OtgruzkaService) {}

  @Post('hook')
  @HttpCode(200)
  @ApiOperation({ summary: "Jadval o'zgardi — sinxronni navbatga qo'yish (Apps Script)" })
  hook(@Body() dto: HookDto) {
    return this.service.hook(dto.secret, dto.ping);
  }
}
