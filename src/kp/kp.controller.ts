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
import { CreateKpDto } from './dto/create-kp.dto';
import { UpdateKpDto } from './dto/update-kp.dto';
import { AuthPayload, KpService } from './kp.service';

interface RequestWithPayload {
  payload: AuthPayload;
}

@ApiTags('KP')
@UseGuards(JwtGuard)
@Controller('kp')
export class KpController {
  constructor(private readonly kpService: KpService) {}

  // Create a new KP record
  @Post('create')
  @ApiOperation({ summary: 'Create a KP record' })
  @ApiBody({ type: CreateKpDto })
  @ApiResponse({ status: 201, description: 'KP created successfully' })
  create(@Body() createKpDto: CreateKpDto, @Req() req: RequestWithPayload) {
    return this.kpService.create(createKpDto, req.payload);
  }

  // Import KP records from an Excel (.xlsx/.xls) file
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import KP records from an Excel file' })
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 201, description: 'Excel file imported successfully' })
  importExcel(@UploadedFile() file: Express.Multer.File, @Req() req: RequestWithPayload) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Fayl yuborilmadi');
    }
    return this.kpService.importFromExcel(file.buffer, req.payload.user_id);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all KP records (admin: all, others: own only)' })
  @ApiResponse({ status: 200, description: 'KP records fetched successfully' })
  findAll(@Req() req: RequestWithPayload) {
    return this.kpService.findAll(req.payload);
  }

  @Get('one/:id')
  @ApiOperation({ summary: 'Get a KP record by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'KP fetched successfully' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithPayload) {
    return this.kpService.findOne(id, req.payload);
  }

  @Patch('update/:id')
  @ApiOperation({ summary: 'Update a KP record' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateKpDto })
  @ApiResponse({ status: 200, description: 'KP updated successfully' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateKpDto: UpdateKpDto,
    @Req() req: RequestWithPayload,
  ) {
    return this.kpService.update(id, updateKpDto, req.payload);
  }

  @Delete('delete/:id')
  @ApiOperation({ summary: 'Delete a KP record' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'KP deleted successfully' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithPayload) {
    return this.kpService.remove(id, req.payload);
  }
}
