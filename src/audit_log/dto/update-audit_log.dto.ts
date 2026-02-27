import { PartialType } from '@nestjs/swagger';
import { CreateAuditLogDto } from './create-audit_log.dto';

export class UpdateAuditLogDto extends PartialType(CreateAuditLogDto) {}
