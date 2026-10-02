import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { HikEvent } from './models/hik-event.model';
import { HikEmployee } from './models/hik-employee.model';
import { HikDevice } from './models/hik-device.model';
import { HikSyncDto } from './dto/hik-sync.dto';

export interface HikDailyRow {
  employee_no: string;
  name: string | null;
  user_id: number | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  in_count: number;
  out_count: number;
}

// Kunlik hisob: keldi = KIRISH terminalidagi birinchi qayd, ketdi = CHIQISH terminalidagi oxirgi qayd.
// Kun chegarasi Toshkent vaqti bo'yicha.
const DAILY_SQL = `
  SELECT e.employee_no,
         he.name,
         he.user_id,
         to_char(e.event_time AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS date,
         to_char(MIN(e.event_time) FILTER (WHERE e.direction = 'in') AT TIME ZONE 'Asia/Tashkent', 'HH24:MI') AS check_in,
         to_char(MAX(e.event_time) FILTER (WHERE e.direction = 'out') AT TIME ZONE 'Asia/Tashkent', 'HH24:MI') AS check_out,
         COUNT(*) FILTER (WHERE e.direction = 'in')::int AS in_count,
         COUNT(*) FILTER (WHERE e.direction = 'out')::int AS out_count
    FROM attendance_events e
    LEFT JOIN hik_employees he ON he.employee_no = e.employee_no
   WHERE e.event_time >= (CAST(:start AS timestamp) AT TIME ZONE 'Asia/Tashkent')
     AND e.event_time <  (CAST(:next AS timestamp) AT TIME ZONE 'Asia/Tashkent')
     %USER_FILTER%
   GROUP BY e.employee_no, he.name, he.user_id, 4
   ORDER BY 4, check_in NULLS LAST`;

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('month YYYY-MM formatida bo‘lishi kerak');
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start: `${month}-01`, next };
}

@Injectable()
export class HikService {
  constructor(
    @InjectModel(HikEvent) private readonly eventRepo: typeof HikEvent,
    @InjectModel(HikEmployee) private readonly employeeRepo: typeof HikEmployee,
    @InjectModel(HikDevice) private readonly deviceRepo: typeof HikDevice,
    private readonly sequelize: Sequelize,
  ) {}

  // Agent: har terminal bo'yicha oxirgi saqlangan qayd — shundan keyingisini so'raydi
  async cursor() {
    const rows = await this.sequelize.query<{ device_serial: string; serial_no: number; event_time: Date }>(
      `SELECT DISTINCT ON (device_serial) device_serial, serial_no, event_time
         FROM attendance_events
        ORDER BY device_serial, serial_no DESC`,
      { type: QueryTypes.SELECT },
    );
    return Object.fromEntries(rows.map((r) => [r.device_serial, { serial_no: r.serial_no, event_time: r.event_time }]));
  }

  // Agent: terminallar, xodimlar ro'yxati va yangi qaydlarni qabul qilish
  async sync(dto: HikSyncDto) {
    const now = new Date();
    for (const d of dto.devices) {
      await this.deviceRepo.upsert({ ...d, last_sync_at: now });
    }
    for (const e of dto.employees) {
      // user_id ga tegmaymiz — uni admin bog'laydi
      await this.employeeRepo.upsert({ employee_no: e.employee_no, name: e.name }, { fields: ['employee_no', 'name'] });
    }

    const directions = new Map(
      (await this.deviceRepo.findAll({ attributes: ['device_serial', 'direction'] })).map((d) => [d.device_serial, d.direction]),
    );
    const rows = dto.events
      .filter((e) => directions.has(e.device_serial))
      .map((e) => ({
        device_serial: e.device_serial,
        direction: directions.get(e.device_serial)!,
        serial_no: e.serial_no,
        employee_no: e.employee_no,
        event_time: new Date(`${e.time}+05:00`),
      }));
    if (rows.length) await this.eventRepo.bulkCreate(rows, { ignoreDuplicates: true });

    return { received: dto.events.length, accepted: rows.length };
  }

  // filter: ERP xodimi (userId) yoki ERP'da akkaunti yo'q terminal xodimi (employeeNo)
  daily(month: string, filter: { userId?: number; employeeNo?: string } = {}): Promise<HikDailyRow[]> {
    const { start, next } = monthRange(month);
    const where = filter.userId
      ? 'AND he.user_id = :userId'
      : filter.employeeNo
        ? 'AND e.employee_no = :employeeNo'
        : '';
    return this.sequelize.query<HikDailyRow>(DAILY_SQL.replace('%USER_FILTER%', where), {
      replacements: { start, next, userId: filter.userId ?? null, employeeNo: filter.employeeNo ?? null },
      type: QueryTypes.SELECT,
    });
  }

  // Ofisda kamida bitta qayd bo'lgan kunlar — qolgan ish kunlari bayram/dam olish deb taklif qilinadi
  async officeDays(month: string): Promise<string[]> {
    const { start, next } = monthRange(month);
    const rows = await this.sequelize.query<{ date: string }>(
      `SELECT DISTINCT to_char(event_time AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS date
         FROM attendance_events
        WHERE event_time >= (CAST(:start AS timestamp) AT TIME ZONE 'Asia/Tashkent')
          AND event_time <  (CAST(:next AS timestamp) AT TIME ZONE 'Asia/Tashkent')
        ORDER BY 1`,
      { replacements: { start, next }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => r.date);
  }

  // first_seen — xodimning birinchi kamera qaydi (ishga kelgan kunini taxminlash uchun)
  async employees() {
    const [list, seen] = await Promise.all([
      this.employeeRepo.findAll({
        include: [{ model: User, as: 'user', attributes: ['id', 'firstname', 'lastname', 'username'] }],
        order: [['employee_no', 'ASC']],
      }),
      this.sequelize.query<{ employee_no: string; first_seen: string }>(
        `SELECT employee_no, to_char(MIN(event_time) AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS first_seen
           FROM attendance_events
          GROUP BY employee_no`,
        { type: QueryTypes.SELECT },
      ),
    ]);
    const firstSeen = new Map(seen.map((r) => [r.employee_no, r.first_seen]));
    return list.map((e) => ({ ...e.toJSON(), first_seen: firstSeen.get(e.employee_no) ?? null }));
  }

  async link(employeeNo: string, userId: number | null) {
    const emp = await this.employeeRepo.findByPk(employeeNo);
    if (!emp) throw new NotFoundException('Terminal xodimi topilmadi');
    if (userId != null && !(await User.findByPk(userId))) throw new NotFoundException('ERP xodimi topilmadi');
    await emp.update({ user_id: userId ?? null });
    return emp;
  }

  devices() {
    return this.deviceRepo.findAll({ order: [['direction', 'ASC']] });
  }
}
