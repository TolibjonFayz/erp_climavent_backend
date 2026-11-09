import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import {
  CreateNoteDto,
  CreateOrderDto,
  CreatePaymentDto,
  DidoxFileDto,
  HookDto,
  OtgruzkaSettingsDto,
  ScriptUrlDto,
  SkladCheckDto,
  UpdateOrderDto,
  UpdatePaymentDto,
} from './dto/otgruzka.dto';
import { AuthPayload, OtgruzkaService } from './otgruzka.service';

const MAX_DIDOX_FILE = 25 * 1024 * 1024;
// Multipart maydonlari matn — DTO'dagi @Transform ishlashi uchun
const formPipe = new ValidationPipe({ transform: true, whitelist: true });

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

  @Get('one/:id/stock')
  @ApiOperation({ summary: "Karta mahsulotlari: omborda nechtasi tayyor" })
  stock(@Param('id', ParseIntPipe) id: number) {
    return this.service.stock(id);
  }

  @Get('readiness')
  @ApiOperation({ summary: "Jo'natilmagan kartalar mahsulotlari bo'yicha ombor tayyorligi" })
  readiness() {
    return this.service.readiness();
  }

  @Get('managers')
  @ApiOperation({ summary: "Menejerlar ro'yxati (tanlash uchun)" })
  managers() {
    return this.service.managers();
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

  // ─── Didox (schyot-faktura fayllari) ───────────────────────────────
  @Post(':id/didox')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DIDOX_FILE } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "Didox: schyot-faktura faylini yuklash (Cloudflare R2) + fayldagi summa" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        amount: { type: 'number' },
        invoice_number: { type: 'string' },
        invoice_date: { type: 'string', format: 'date' },
        comment: { type: 'string' },
      },
    },
  })
  addDidox(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body(formPipe) dto: DidoxFileDto,
    @Req() req: RequestWithPayload,
  ) {
    if (!file?.buffer) throw new BadRequestException({ message: 'Fayl yuborilmadi', code: 'OT_DIDOX_NO_FILE' });
    return this.service.addDidoxFile(id, file, dto, req.payload);
  }

  @Patch('didox/:fileId')
  @ApiOperation({ summary: "Didox fayli: summa, raqam, sana, izohni o'zgartirish" })
  updateDidox(@Param('fileId', ParseIntPipe) fileId: number, @Body(formPipe) dto: DidoxFileDto) {
    return this.service.updateDidoxFile(fileId, dto);
  }

  @Delete('didox/:fileId')
  @ApiOperation({ summary: "Didox faylini o'chirish (yuklagan xodim yoki admin)" })
  removeDidox(@Param('fileId', ParseIntPipe) fileId: number, @Req() req: RequestWithPayload) {
    return this.service.removeDidoxFile(fileId, req.payload);
  }

  @Get('didox/:fileId/link')
  @ApiOperation({ summary: 'Didox fayli uchun qisqa muddatli havola (inline | download)' })
  @ApiQuery({ name: 'mode', required: false, enum: ['inline', 'download'] })
  didoxLink(@Param('fileId', ParseIntPipe) fileId: number, @Query('mode') mode?: 'inline' | 'download') {
    return this.service.didoxFileLink(fileId, mode === 'download' ? 'download' : 'inline');
  }

  // ─── Ombor tekshiruvi ───────────────────────────────────────────────
  @Get('sklad-checks')
  @ApiOperation({ summary: "Ombor: yangi shartnomalar — mahsulotlar borligini tekshirish kerak" })
  skladChecks() {
    return this.service.skladChecks();
  }

  @Get('sklad-checks/count')
  @ApiOperation({ summary: 'Ombor tekshiruvi kutayotgan shartnomalar soni (bildirishnoma uchun)' })
  skladChecksCount() {
    return this.service.skladChecksCount();
  }

  @Post(':id/sklad-check')
  @ApiOperation({ summary: 'Ombor tekshirdi deb belgilash' })
  skladCheck(@Param('id', ParseIntPipe) id: number, @Body() dto: SkladCheckDto, @Req() req: RequestWithPayload) {
    return this.service.markSkladChecked(id, dto.note, req.payload);
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
