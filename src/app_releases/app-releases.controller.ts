import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';
import { AppReleasesService } from './app-releases.service';

// APK odatda 10–20 MB; zaxira bilan
const MAX_APK_SIZE = 150 * 1024 * 1024;

interface RequestWithPayload {
  payload?: { user_id?: number; id?: number };
}

@Controller('app-releases')
export class AppReleasesController {
  constructor(private readonly releases: AppReleasesService) {}

  // Ilova ishga tushganda: eng yangi versiya + 1 soatlik yuklab olish havolasi
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Latest mobile app release with a download link' })
  @Get('latest')
  latest(@Query('platform') platform?: string) {
    return this.releases.latest(platform === 'ios' ? 'ios' : 'android');
  }

  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'All mobile app releases — admin only' })
  @Get()
  list() {
    return this.releases.list();
  }

  // Yangi APK yuklash (admin): multipart — file, version_name, version_code, notes
  @UseGuards(JwtGuard, AdminGuard)
  @ApiProperty({ description: 'Upload a new APK — admin only' })
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_APK_SIZE } }))
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { version_name?: string; version_code?: string; notes?: string; platform?: string },
    @Req() req: RequestWithPayload,
  ) {
    return this.releases.create(file, body || {}, Number(req.payload?.user_id || req.payload?.id));
  }

  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Delete a release — admin only' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.releases.remove(+id);
  }
}
