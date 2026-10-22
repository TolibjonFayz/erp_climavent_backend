import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional } from 'class-validator';
import { JwtGuard } from 'src/guards/jwt.guard';
import { User } from 'src/users/models/user.model';
import { TrainingService } from './training.service';
import { Lang } from './training.types';

interface RequestWithPayload {
  payload: { user_id: number; is_admin: boolean };
}

class TutorialDoneDto {
  @IsOptional()
  @IsInt()
  steps?: number;

  @IsOptional()
  @IsInt()
  duration_sec?: number;
}

class SubmitQuizDto {
  @IsInt()
  attempt_id: number;

  @IsObject()
  answers: Record<string, string>;
}

const langOf = (l?: string): Lang => (l === 'ru' ? 'ru' : 'uz');

@ApiTags('Training')
@UseGuards(JwtGuard)
@Controller('training')
export class TrainingController {
  constructor(
    private readonly training: TrainingService,
    @InjectModel(User) private readonly userRepo: typeof User,
  ) {}

  // Admin holati bazadan; ruxsat yo'q bo'lsa 403 (401 frontendni logout qiladi)
  private async assertAdmin(req: RequestWithPayload) {
    const u = await this.userRepo.findByPk(req.payload.user_id, { attributes: ['id', 'is_admin'] });
    if (!u?.is_admin) throw new ForbiddenException({ message: 'Bu amal faqat admin uchun', code: 'SK_ADMIN_ONLY' });
  }

  @Get(':module/status')
  @ApiOperation({ summary: "Joriy xodimning o'qish holati (yo'riqnoma, test)" })
  status(@Param('module') module: string, @Req() req: RequestWithPayload) {
    return this.training.status(req.payload.user_id, module);
  }

  @Post(':module/tutorial-done')
  @ApiOperation({ summary: "Yo'riqnoma oxirigacha ko'rildi" })
  tutorialDone(@Param('module') module: string, @Body() dto: TutorialDoneDto, @Req() req: RequestWithPayload) {
    return this.training.tutorialDone(req.payload.user_id, module, dto);
  }

  @Post(':module/quiz/start')
  @ApiOperation({ summary: 'Testni boshlash (savollar, javobsiz)' })
  start(@Param('module') module: string, @Query('lang') lang: string, @Req() req: RequestWithPayload) {
    return this.training.startQuiz(req.payload.user_id, module, langOf(lang));
  }

  @Post(':module/quiz/submit')
  @ApiOperation({ summary: 'Javoblarni topshirish — server baholaydi' })
  submit(@Param('module') module: string, @Body() dto: SubmitQuizDto, @Req() req: RequestWithPayload) {
    return this.training.submitQuiz(req.payload.user_id, module, dto.attempt_id, dto.answers);
  }

  @Get(':module/report')
  @ApiOperation({ summary: "Xodimlar bo'yicha o'qish hisoboti (admin)" })
  async report(@Param('module') module: string, @Req() req: RequestWithPayload) {
    await this.assertAdmin(req);
    return this.training.report(module);
  }

  @Get(':module/attempts/:id')
  @ApiOperation({ summary: 'Urinish tafsiloti: savollar va javoblar (admin)' })
  async attempt(
    @Param('module') module: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('lang') lang: string,
    @Req() req: RequestWithPayload,
  ) {
    await this.assertAdmin(req);
    return this.training.attemptDetail(module, id, langOf(lang));
  }
}
