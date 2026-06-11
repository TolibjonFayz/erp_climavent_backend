import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Attendance } from './models/attendance.model';
import { User } from 'src/users/models/user.model';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

const userInclude = [
  {
    model: User,
    as: 'employee',
    attributes: ['id', 'firstname', 'lastname', 'username', 'profile_image'],
  },
  {
    model: User,
    as: 'creator',
    attributes: ['id', 'firstname', 'lastname', 'username'],
  },
];

// 'YYYY-MM' -> { start: 'YYYY-MM-01', nextStart: keyingi oy boshi }
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, next };
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance)
    private readonly AttendanceRepository: typeof Attendance,
  ) {}

  // Bir kun + xodimga bitta yozuv (bor bo'lsa yangilanadi, yo'q bo'lsa yaratiladi)
  async upsert(dto: CreateAttendanceDto) {
    const existing = await this.AttendanceRepository.findOne({
      where: { user_id: dto.user_id, date: dto.date },
    });
    if (existing) {
      await existing.update(dto);
      return this.AttendanceRepository.findByPk(existing.id, {
        include: userInclude,
      });
    }
    const created = await this.AttendanceRepository.create(dto);
    return this.AttendanceRepository.findByPk(created.id, {
      include: userInclude,
    });
  }

  // Bitta xodimning oylik davomati
  findByUserAndMonth(userId: number, month?: string) {
    const where: any = { user_id: userId };
    if (month) {
      const { start, next } = monthRange(month);
      where.date = { [Op.gte]: start, [Op.lt]: next };
    }
    return this.AttendanceRepository.findAll({
      where,
      include: userInclude,
      order: [['date', 'ASC']],
    });
  }

  // Barcha xodimlarning oylik davomati (admin)
  findAllByMonth(month?: string) {
    const where: any = {};
    if (month) {
      const { start, next } = monthRange(month);
      where.date = { [Op.gte]: start, [Op.lt]: next };
    }
    return this.AttendanceRepository.findAll({
      where,
      include: userInclude,
      order: [['date', 'ASC']],
    });
  }

  async updateById(id: number, dto: UpdateAttendanceDto) {
    const [count] = await this.AttendanceRepository.update(dto, {
      where: { id },
    });
    if (!count) throw new NotFoundException('Attendance not found');
    return this.AttendanceRepository.findByPk(id, { include: userInclude });
  }

  removeById(id: number) {
    return this.AttendanceRepository.destroy({ where: { id } });
  }
}
