import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import {
  AddSourceDto,
  CreateItemDto,
  CreateMovementDto,
  SyncDto,
  UpdateItemDto,
  UpdateSettingsDto,
} from './dto/sklad.dto';
import { AuthPayload, SkladService } from './sklad.service';
import { SheetFormatError } from './sheet-parser';

interface RequestWithPayload {
  payload: AuthPayload;
}

@ApiTags('Sklad')
@UseGuards(JwtGuard)
@Controller('sklad')
export class SkladController {
  constructor(private readonly skladService: SkladService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Ombor rejimi (mirror | live)' })
  settings() {
    return this.skladService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Rejimni almashtirish (admin)' })
  async updateSettings(@Body() dto: UpdateSettingsDto, @Req() req: RequestWithPayload) {
    await this.skladService.assertAdmin(req.payload);
    return this.skladService.setMode(dto.mode);
  }

  @Get('report')
  @ApiOperation({ summary: "Oylik qoldiq hisoboti (har mahsulot bo'yicha)" })
  @ApiQuery({ name: 'period', required: false, example: '2026-10' })
  report(@Query('period') period?: string) {
    return this.skladService.report(period);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Harakatlar jurnali' })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'dogovor', required: false })
  movements(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('item_id') itemId?: string,
    @Query('type') type?: string,
    @Query('dogovor') dogovor?: string,
  ) {
    return this.skladService.movements({
      period,
      from,
      to,
      item_id: itemId ? Number(itemId) : undefined,
      type,
      dogovor,
    });
  }

  @Post('movements')
  @ApiOperation({ summary: 'Kirim / chiqim / rezerv kiritish (faqat ERP asosiy rejimda)' })
  createMovement(@Body() dto: CreateMovementDto, @Req() req: RequestWithPayload) {
    return this.skladService.createMovement(dto, req.payload);
  }

  @Delete('movements/:id')
  @ApiOperation({ summary: "ERP'da kiritilgan harakatni o'chirish" })
  removeMovement(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithPayload) {
    return this.skladService.removeMovement(id, req.payload);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Mahsulot kartasi: qoldiq, harakatlar, shartnomalar' })
  item(@Param('id', ParseIntPipe) id: number) {
    return this.skladService.itemDetail(id);
  }

  @Post('items')
  @ApiOperation({ summary: "Yangi mahsulot qo'shish" })
  createItem(@Body() dto: CreateItemDto) {
    return this.skladService.createItem(dto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Mahsulotni tahrirlash (admin)' })
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
    @Req() req: RequestWithPayload,
  ) {
    await this.skladService.assertAdmin(req.payload);
    return this.skladService.updateItem(id, dto);
  }

  @Post('sap-import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: "SAP mahsulotlar ro'yxatini (Excel) yuklab, SAP kodi/nomini biriktirish (admin)" })
  async sapImport(@UploadedFile() file: Express.Multer.File, @Req() req: RequestWithPayload) {
    await this.skladService.assertAdmin(req.payload);
    if (!file?.buffer) {
      throw new BadRequestException({ message: 'Fayl yuborilmadi', code: 'SK_FILE_REQUIRED' });
    }
    try {
      return await this.skladService.importSap(file.buffer);
    } catch (e: any) {
      // Fayl formati xatosi (kod bilan) — 400
      if (e instanceof SheetFormatError) {
        throw new BadRequestException({ message: e.message, code: e.code });
      }
      throw e;
    }
  }

  @Get('contracts')
  @ApiOperation({ summary: "Shartnoma bo'yicha omborda turgan tovarlar" })
  contracts() {
    return this.skladService.contracts();
  }

  @Get('sources')
  @ApiOperation({ summary: 'Google Sheets manbalari' })
  sources() {
    return this.skladService.sources();
  }

  @Post('sources')
  @ApiOperation({ summary: "Yangi varaq qo'shish (admin)" })
  async addSource(@Body() dto: AddSourceDto, @Req() req: RequestWithPayload) {
    await this.skladService.assertAdmin(req.payload);
    return this.skladService.addSource(dto);
  }

  @Delete('sources/:id')
  @ApiOperation({ summary: "Varaqni ro'yxatdan olib tashlash (admin)" })
  async removeSource(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithPayload) {
    await this.skladService.assertAdmin(req.payload);
    return this.skladService.removeSource(id);
  }

  @Post('sync')
  @ApiOperation({ summary: "Google Sheets'dan sinxronlash (admin)" })
  async sync(@Body() dto: SyncDto, @Req() req: RequestWithPayload) {
    await this.skladService.assertAdmin(req.payload);
    return this.skladService.sync(dto.source_id, req.payload);
  }
}
