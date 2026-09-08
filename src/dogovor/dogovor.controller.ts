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
import { CreateDogovorDto } from './dto/create-dogovor.dto';
import { UpdateDogovorDto } from './dto/update-dogovor.dto';
import { AuthPayload, DogovorService } from './dogovor.service';

interface RequestWithPayload {
  payload: AuthPayload;
}

@ApiTags('Dogovor')
@UseGuards(JwtGuard)
@Controller('dogovor')
export class DogovorController {
  constructor(private readonly dogovorService: DogovorService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create a contract' })
  @ApiBody({ type: CreateDogovorDto })
  @ApiResponse({ status: 201, description: 'Contract created successfully' })
  create(@Body() dto: CreateDogovorDto, @Req() req: RequestWithPayload) {
    return this.dogovorService.create(dto, req.payload);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import contracts from an Excel file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Excel file imported successfully' })
  importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithPayload,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Fayl yuborilmadi');
    }
    return this.dogovorService.importFromExcel(file.buffer, req.payload.user_id);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get contracts (admin: all, others: own only)' })
  @ApiResponse({ status: 200, description: 'Contracts fetched successfully' })
  findAll(@Req() req: RequestWithPayload) {
    return this.dogovorService.findAll(req.payload);
  }

  @Get('one/:id')
  @ApiOperation({ summary: 'Get a contract by id' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Contract fetched successfully' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithPayload,
  ) {
    return this.dogovorService.findOne(id, req.payload);
  }

  @Patch('update/:id')
  @ApiOperation({ summary: 'Update a contract' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateDogovorDto })
  @ApiResponse({ status: 200, description: 'Contract updated successfully' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDogovorDto,
    @Req() req: RequestWithPayload,
  ) {
    return this.dogovorService.update(id, dto, req.payload);
  }

  @Delete('delete/:id')
  @ApiOperation({ summary: 'Delete a contract' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Contract deleted successfully' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithPayload) {
    return this.dogovorService.remove(id, req.payload);
  }
}
