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
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import { CreateLoyihaDto } from './dto/create-loyiha.dto';
import { UpdateLoyihaDto } from './dto/update-loyiha.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { AuthPayload, LoyihaService } from './loyiha.service';

interface RequestWithPayload {
  payload: AuthPayload;
}

// Bitta fayl uchun chegara — katta chizmalar ham sig'sin
const MAX_FILE_SIZE = 50 * 1024 * 1024;

@ApiTags('Loyiha')
@UseGuards(JwtGuard)
@Controller('loyiha')
export class LoyihaController {
  constructor(private readonly loyihaService: LoyihaService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create a project record' })
  @ApiBody({ type: CreateLoyihaDto })
  @ApiResponse({ status: 201, description: 'Project created' })
  create(@Body() dto: CreateLoyihaDto, @Req() req: RequestWithPayload) {
    return this.loyihaService.create(dto, req.payload);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get projects (admin: all, others: own only)' })
  findAll(@Req() req: RequestWithPayload) {
    return this.loyihaService.findAll(req.payload);
  }

  // Fayl saqlash sozlanganini frontend bilib tursin
  @Get('storage-status')
  @ApiOperation({ summary: 'Is file storage configured' })
  storageStatus() {
    return { ready: this.loyihaService.storageReady };
  }

  @Get('next-number')
  @ApiOperation({ summary: 'Suggest the next order number' })
  nextNumber() {
    return this.loyihaService.nextOrderNumber();
  }

  @Get('one/:id')
  @ApiOperation({ summary: 'Get a project by id' })
  @ApiParam({ name: 'id', type: Number })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithPayload,
  ) {
    return this.loyihaService.findOne(id, req.payload);
  }

  @Patch('update/:id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateLoyihaDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLoyihaDto,
    @Req() req: RequestWithPayload,
  ) {
    return this.loyihaService.update(id, dto, req.payload);
  }

  @Delete('delete/:id')
  @ApiOperation({ summary: 'Delete a project with its files' })
  @ApiParam({ name: 'id', type: Number })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithPayload,
  ) {
    return this.loyihaService.remove(id, req.payload);
  }

  // ─── Fayllar ────────────────────────────────────────────────────────

  @Post(':id/files/:section')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file (section: archive | working)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('section') section: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithPayload,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Fayl yuborilmadi');
    }
    return this.loyihaService.addFile(id, section, file, req.payload);
  }

  @Get('file/:fileId/link')
  @ApiOperation({ summary: 'Get a short-lived download link' })
  @ApiParam({ name: 'fileId', type: Number })
  fileLink(
    @Param('fileId', ParseIntPipe) fileId: number,
    @Query('mode') mode: 'download' | 'inline',
    @Req() req: RequestWithPayload,
  ) {
    return this.loyihaService.getFileLink(
      fileId,
      req.payload,
      mode === 'inline' ? 'inline' : 'download',
    );
  }

  // Faqat "working" bo'limi uchun — arxiv fayllari o'zgarmas
  @Patch('file/:fileId')
  @ApiOperation({ summary: 'Rename/label a working-section file' })
  @ApiParam({ name: 'fileId', type: Number })
  @ApiBody({ type: UpdateFileDto })
  updateFile(
    @Param('fileId', ParseIntPipe) fileId: number,
    @Body() dto: UpdateFileDto,
    @Req() req: RequestWithPayload,
  ) {
    return this.loyihaService.updateFile(fileId, dto, req.payload);
  }

  @Delete('file/:fileId')
  @ApiOperation({ summary: 'Delete a working-section file' })
  @ApiParam({ name: 'fileId', type: Number })
  removeFile(
    @Param('fileId', ParseIntPipe) fileId: number,
    @Req() req: RequestWithPayload,
  ) {
    return this.loyihaService.removeFile(fileId, req.payload);
  }
}
