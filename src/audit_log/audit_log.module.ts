import { Module } from '@nestjs/common';
import { AuditLogService } from './audit_log.service';
import { AuditLogController } from './audit_log.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditLog } from './models/audit_log.model';

@Module({
  imports: [SequelizeModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
