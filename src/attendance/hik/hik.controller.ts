import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';
import { UserSelfOrAdminGuard } from 'src/guards/user_self_or_admin.guard';
import { HikAgentGuard } from './hik-agent.guard';
import { HikService } from './hik.service';
import { HikLinkDto, HikSyncDto } from './dto/hik-sync.dto';

// Ofisdagi Hikvision yuz terminallaridan keladigan kirdi-chiqdi
@Controller('attendance/hik')
export class HikController {
  constructor(private readonly hikService: HikService) {}

  // ─── Ofis agenti ───

  @UseGuards(HikAgentGuard)
  @ApiProperty({ description: 'Last stored event per terminal — agent only' })
  @Get('cursor')
  cursor() {
    return this.hikService.cursor();
  }

  // Tarixni import qilishda agent ketma-ket ko'p paket yuboradi
  @SkipThrottle()
  @UseGuards(HikAgentGuard)
  @ApiProperty({ description: 'Push terminals, employees and new events — agent only' })
  @Post('sync')
  sync(@Body() dto: HikSyncDto) {
    return this.hikService.sync(dto);
  }

  // ─── ERP ───

  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Daily first-in / last-out of all employees — admin only' })
  @Get('daily')
  daily(@Query('month') month: string) {
    return this.hikService.daily(month);
  }

  @UseGuards(UserSelfOrAdminGuard)
  @ApiProperty({ description: 'Daily first-in / last-out of one user' })
  @Get('daily/user/:id')
  dailyByUser(@Param('id') id: string, @Query('month') month: string) {
    return this.hikService.daily(month, +id);
  }

  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Days with at least one camera event in the office' })
  @Get('office-days')
  officeDays(@Query('month') month: string) {
    return this.hikService.officeDays(month);
  }

  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Terminal employees and their ERP links — admin only' })
  @Get('employees')
  employees() {
    return this.hikService.employees();
  }

  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Link a terminal employee to an ERP user — admin only' })
  @Patch('employees/:employeeNo')
  link(@Param('employeeNo') employeeNo: string, @Body() dto: HikLinkDto) {
    return this.hikService.link(employeeNo, dto.user_id);
  }

  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Terminals and last sync time — admin only' })
  @Get('devices')
  devices() {
    return this.hikService.devices();
  }
}
