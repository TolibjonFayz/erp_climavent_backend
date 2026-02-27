import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { AuditLogService } from './audit_log.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryAuditLogDto } from './dto/query-audit_log.dto';
import { CreateAuditLogDto } from './dto/create-audit_log.dto';

@ApiTags('Audit Logs')
@Controller('audit-logs')
// @UseGuards(JwtAuthGuard, AdminGuard) // ← guardlaringizni yoqing
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  // POST /audit-logs — log yozish (boshqa servicelardan chaqiriladi)
  @ApiOperation({ summary: 'Create audit log entry' })
  @Post('create')
  create(@Body() dto: CreateAuditLogDto) {
    return this.auditLogService.create(dto);
  }

  // GET /audit-logs?action=role&search=Ali&limit=50&offset=0
  // ✅ eski kodda @ApiProperty ishlatilgan edi — bu noto'g'ri, controller metodlarda @ApiOperation ishlatiladi
  @ApiOperation({ summary: 'Get all audit logs with filters' })
  @Get('filter') // ✅ eski kodda 'search' path bor edi — keraksiz, query param yetarli
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.findAll(query);
  }

  // GET /audit-logs/stats
  @ApiOperation({ summary: 'Get audit log statistics' })
  @Get('stats')
  getStats() {
    return this.auditLogService.getStats();
  }

  // GET /audit-logs/target/:username
  @ApiOperation({ summary: 'Get audit logs by target username' })
  @Get('target/:username')
  findByTarget(@Param('username') username: string) {
    return this.auditLogService.findByTarget(username);
  }

  // DELETE /audit-logs
  @ApiOperation({ summary: 'Clear all audit logs' })
  @Delete('delete')
  clearAll() {
    return this.auditLogService.clearAll();
  }
}
