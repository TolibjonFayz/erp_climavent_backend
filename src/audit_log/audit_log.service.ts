import { CreateAuditLogDto } from './dto/create-audit_log.dto';
import { QueryAuditLogDto } from './dto/query-audit_log.dto';
import { AuditLog } from './models/audit_log.model';
import { InjectModel } from '@nestjs/sequelize';
import { Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { User } from 'src/users/models/user.model';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog)
    private readonly AuditLogRepository: typeof AuditLog,
  ) {}

  async create(createAuditLogDto: CreateAuditLogDto): Promise<AuditLog> {
    return this.AuditLogRepository.create(createAuditLogDto as any);
  }

  async findAll(query: QueryAuditLogDto) {
    const { action, target_id, search, limit = 50, offset = 0 } = query;

    const where: any = {};
    if (action) where.action = action;
    if (target_id) where.target_id = target_id; // ✅ eski kodda: where.target = target_id — xato edi

    if (search) {
      where.message = { [Op.iLike]: `%${search}%` };
    }

    const { count, rows } = await this.AuditLogRepository.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'firstname', 'lastname', 'username'],
        },
        {
          model: User,
          as: 'target', // ✅ target user ma'lumotlari ham qaytsin
          attributes: ['id', 'firstname', 'lastname', 'username'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
    });

    return { total: count, data: rows };
  }

  async getTodayCount(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.AuditLogRepository.count({
      where: { createdAt: { [Op.gte]: today } },
    });
  }

  async getStats() {
    const total = await this.AuditLogRepository.count();
    const todayCount = await this.getTodayCount();
    const roleCount = await this.AuditLogRepository.count({
      where: { action: 'role' },
    });
    const blockCount = await this.AuditLogRepository.count({
      where: { action: { [Op.in]: ['block', 'unblock'] } },
    });
    const exportCount = await this.AuditLogRepository.count({
      where: { action: 'export' },
    });

    return {
      total,
      today: todayCount,
      role: roleCount,
      block: blockCount,
      export: exportCount,
    };
  }

  // ✅ target_id bo'yicha emas, username bo'yicha qidirish —
  //    User join qilib, username filtr qo'yamiz
  async findByTarget(username: string, limit = 10) {
    return this.AuditLogRepository.findAll({
      include: [
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'firstname', 'lastname', 'username'],
        },
        {
          model: User,
          as: 'target',
          attributes: ['id', 'firstname', 'lastname', 'username'],
          where: { username }, // ← username bo'yicha filter shu yerda
          required: true, // INNER JOIN — target bo'lmasa chiqmaydi
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  async clearAll(): Promise<{ deleted: number }> {
    const deleted = await this.AuditLogRepository.destroy({
      where: {},
      truncate: true,
    });
    return { deleted };
  }
}
