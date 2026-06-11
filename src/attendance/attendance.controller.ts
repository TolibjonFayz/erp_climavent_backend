import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // Davomat kiritish/yangilash — faqat admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Create or update a day attendance — admin only' })
  @Post('create')
  create(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.upsert(dto);
  }

  // Barcha xodimlar oylik davomati — faqat admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'All attendance for a month — admin only' })
  @Get('all')
  findAll(@Query('month') month?: string) {
    return this.attendanceService.findAllByMonth(month);
  }

  // Bitta xodim oylik davomati — xodim o'zinikini, admin har kimni
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'A user attendance for a month' })
  @Get('user/:userId')
  findByUser(
    @Param('userId') userId: string,
    @Query('month') month?: string,
  ) {
    return this.attendanceService.findByUserAndMonth(+userId, month);
  }

  // Tahrirlash — faqat admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Update attendance — admin only' })
  @Patch('update/:id')
  update(@Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.updateById(+id, dto);
  }

  // O'chirish — faqat admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Delete attendance — admin only' })
  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.attendanceService.removeById(+id);
  }
}
