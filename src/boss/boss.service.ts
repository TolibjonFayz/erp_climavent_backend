import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BossTarget } from './models/boss_target.model';
import { Announcement } from './models/announcement.model';
import { User } from 'src/users/models/user.model';
import { DevicesService } from 'src/devices/devices.service';
import {
  CreateAnnouncementDto,
  CreateTargetDto,
} from './dto/boss.dto';

const employeeInclude = [
  {
    model: User,
    as: 'employee',
    attributes: ['id', 'firstname', 'lastname', 'username', 'profile_image'],
  },
];

@Injectable()
export class BossService {
  constructor(
    @InjectModel(BossTarget) private readonly TargetRepo: typeof BossTarget,
    @InjectModel(Announcement) private readonly AnnRepo: typeof Announcement,
    @InjectModel(User) private readonly UserRepo: typeof User,
    private readonly devices: DevicesService,
  ) {}

  // ─── Targets ───
  async upsertTarget(dto: CreateTargetDto) {
    const existing = await this.TargetRepo.findOne({
      where: { user_id: dto.user_id, month: dto.month, metric: dto.metric || 'contracts' },
    });
    if (existing) {
      await existing.update(dto);
      return this.TargetRepo.findByPk(existing.id, { include: employeeInclude });
    }
    const created = await this.TargetRepo.create(dto);
    return this.TargetRepo.findByPk(created.id, { include: employeeInclude });
  }

  getTargets(month?: string) {
    const where: any = {};
    if (month) where.month = month;
    return this.TargetRepo.findAll({
      where,
      include: employeeInclude,
      order: [['createdAt', 'DESC']],
    });
  }

  async deleteTarget(id: number) {
    const n = await this.TargetRepo.destroy({ where: { id } });
    if (!n) throw new NotFoundException('Target not found');
    return { deleted: n };
  }

  // ─── Announcements ───
  async createAnnouncement(dto: CreateAnnouncementDto) {
    const ann = await this.AnnRepo.create(dto);
    // E'lon — barcha xodimlarga bildirishnoma (o'zidan tashqari)
    void this.devices.notifyAll(
      () => ({
        // Modelda `declare` yo'q — qiymatlar DTO'dan olinadi (getter soyalanishi)
        title: `📢 ${dto.title}`,
        body: dto.message,
        data: { route: '/more', announcement_id: ann.get('id') as number },
      }),
      `e'lon #${ann.get('id')}`,
      Number((dto as any).created_by),
    );
    return ann;
  }

  getAnnouncements() {
    return this.AnnRepo.findAll({
      include: [
        { model: User, as: 'author', attributes: ['id', 'firstname', 'lastname'] },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  getAnnouncementFeed(limit = 20) {
    return this.AnnRepo.findAll({
      attributes: ['id', 'title', 'message', 'createdAt'],
      include: [
        { model: User, as: 'author', attributes: ['id', 'firstname', 'lastname'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  async deleteAnnouncement(id: number) {
    const n = await this.AnnRepo.destroy({ where: { id } });
    if (!n) throw new NotFoundException('Announcement not found');
    return { deleted: n };
  }

  // ─── Promote / demote to admin ───
  async setAdmin(userId: number, is_admin: boolean) {
    const [count] = await this.UserRepo.update(
      { is_admin },
      { where: { id: userId } },
    );
    if (!count) throw new NotFoundException('User not found');
    return this.UserRepo.findByPk(userId, {
      attributes: ['id', 'firstname', 'lastname', 'username', 'is_admin'],
    });
  }
}
