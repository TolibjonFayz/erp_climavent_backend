import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Tasks } from './models/task.model';
import { User } from 'src/users/models/user.model';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { DevicesService } from 'src/devices/devices.service';

export interface AuthPayload {
  user_id: number;
  is_admin: boolean;
}

// Bosqichlar tartibi — oldinga siljish uchun tasdiq kerak
const STAGE_ORDER = ['todo', 'in_progress', 'done'];
const stageIndex = (status: string) => STAGE_ORDER.indexOf(status);

// Bildirishnoma matnlari uchun bosqich nomlari
const STAGE_LABEL = {
  uz: { todo: 'Bajarilishi kerak', in_progress: 'Jarayonda', done: 'Bajarildi' },
  ru: { todo: 'К выполнению', in_progress: 'В работе', done: 'Выполнено' },
};
const stageLabel = (lang: 'uz' | 'ru', status: string) => STAGE_LABEL[lang][status] || status;
const personName = (u?: { firstname?: string; lastname?: string } | null) =>
  u ? `${u.firstname || ''} ${u.lastname || ''}`.trim() : '';


// assignee/creator/approver ni parolsiz qaytarish uchun umumiy include
const userInclude = [
  {
    model: User,
    as: 'assignee',
    attributes: ['id', 'firstname', 'lastname', 'username', 'profile_image'],
  },
  {
    model: User,
    as: 'creator',
    attributes: ['id', 'firstname', 'lastname', 'username'],
  },
  {
    model: User,
    as: 'approver',
    attributes: ['id', 'firstname', 'lastname', 'username'],
  },
];

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Tasks) private readonly TasksRepository: typeof Tasks,
    @InjectModel(User) private readonly UsersRepository: typeof User,
    private readonly devices: DevicesService,
  ) {}

  // ─── Push-bildirishnomalar (xato bo'lsa ham asosiy amal buzilmaydi) ───
  private notifyAssigned(task: Tasks) {
    void this.devices.notifyUsers(
      [task.assigned_to],
      (lang) => ({
        title: lang === 'ru' ? 'Новая задача' : 'Yangi vazifa',
        body: task.title,
        data: { route: '/tasks', task_id: task.id },
      }),
      `vazifa #${task.id} biriktirildi`,
    );
  }

  private async notifyApprovalRequested(task: Tasks) {
    const approverId = await this.getApproverId();
    const targets = approverId ? [approverId] : await this.devices.adminIds();
    const who = personName(task.assignee);
    void this.devices.notifyUsers(
      targets.filter((id) => id !== Number(task.assigned_to)),
      (lang) => ({
        title: lang === 'ru' ? 'Запрос на подтверждение' : "Tasdiq so'rovi",
        body: `${who ? `${who}: ` : ''}${task.title} → ${stageLabel(lang, task.pending_status || '')}`,
        data: { route: '/tasks', task_id: task.id },
      }),
      `vazifa #${task.id} tasdiq so'rovi`,
    );
  }

  private notifyDecision(task: Tasks, approved: boolean, reason?: string | null) {
    void this.devices.notifyUsers(
      [task.assigned_to],
      (lang) => ({
        title: approved
          ? lang === 'ru' ? 'Подтверждено ✅' : 'Tasdiqlandi ✅'
          : lang === 'ru' ? 'Отклонено' : 'Rad etildi',
        body: approved
          ? `${task.title} → ${stageLabel(lang, task.status)}`
          : `${task.title}${reason ? ` — ${reason}` : ''}`,
        data: { route: '/tasks', task_id: task.id },
      }),
      `vazifa #${task.id} ${approved ? 'tasdiqlandi' : 'rad etildi'}`,
    );
  }

  // ─── Tasdiqlovchi (Gulshoda) ────────────────────────────────────────
  // .env dagi TASK_APPROVER_USER_ID birinchi o'rinda; bo'lmasa ism bo'yicha
  // topiladi. Topilmasa null — bu holda har qanday admin tasdiqlay oladi.
  private approverIdCache: number | null | undefined;

  async getApprover(): Promise<User | null> {
    const envId = Number(process.env.TASK_APPROVER_USER_ID);
    if (envId) {
      const byId = await this.UsersRepository.findByPk(envId, {
        attributes: ['id', 'firstname', 'lastname', 'username', 'is_admin'],
      });
      if (byId) return byId;
    }
    const byName = await this.UsersRepository.findOne({
      where: { firstname: { [Op.iLike]: 'gulshoda%' } },
      attributes: ['id', 'firstname', 'lastname', 'username', 'is_admin'],
    });
    return byName;
  }

  private async getApproverId(): Promise<number | null> {
    if (this.approverIdCache !== undefined) return this.approverIdCache;
    const approver = await this.getApprover();
    this.approverIdCache = approver ? Number(approver.id) : null;
    return this.approverIdCache;
  }

  // Tasdiqlovchi — belgilangan xodim yoki istalgan admin
  // (aks holda u ta'tilda bo'lsa butun jarayon to'xtab qoladi).
  private async assertCanDecide(payload: AuthPayload) {
    const approverId = await this.getApproverId();
    if (payload.is_admin) return;
    if (approverId && Number(payload.user_id) === approverId) return;
    throw new ForbiddenException(
      "Bu so'rovni faqat tasdiqlovchi (Gulshoda) yoki admin hal qila oladi",
    );
  }

  // ─── CRUD ───────────────────────────────────────────────────────────

  // Vazifa yaratish (admin biriktiradi)
  async createTask(createTaskDto: CreateTaskDto) {
    const task = await this.TasksRepository.create(createTaskDto);
    this.notifyAssigned(task);
    return task;
  }

  // Barcha vazifalar (admin uchun)
  findAllTasks() {
    return this.TasksRepository.findAll({
      include: userInclude,
      order: [['createdAt', 'DESC']],
    });
  }

  // Bitta xodimga biriktirilgan vazifalar
  findTasksOfUser(userId: number) {
    return this.TasksRepository.findAll({
      where: { assigned_to: userId },
      include: userInclude,
      order: [['createdAt', 'DESC']],
    });
  }

  // Bitta vazifa
  findOneTask(id: number) {
    return this.TasksRepository.findByPk(id, { include: userInclude });
  }

  private async getTaskOr404(id: number) {
    const task = await this.TasksRepository.findByPk(id, {
      include: userInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // Vazifani to'liq yangilash (admin)
  async updateTask(id: number, updateTaskDto: UpdateTaskDto) {
    const task = await this.getTaskOr404(id);
    const payload: Partial<Tasks> = { ...updateTaskDto };

    if (updateTaskDto.status) {
      payload.completed_at =
        updateTaskDto.status === 'done' ? new Date() : null;
    }

    // Admin statusni qo'lda o'zgartirsa yoki vazifani boshqa xodimga bersa,
    // kutayotgan so'rov ma'nosini yo'qotadi — uni tozalaymiz.
    const statusChanged =
      !!updateTaskDto.status && updateTaskDto.status !== task.status;
    const assigneeChanged =
      updateTaskDto.assigned_to != null &&
      Number(updateTaskDto.assigned_to) !== Number(task.assigned_to);
    if (task.pending_status && (statusChanged || assigneeChanged)) {
      payload.pending_status = null;
      payload.approval_note = null;
      payload.approval_requested_at = null;
    }

    await this.TasksRepository.update(payload, { where: { id } });
    const updated = await this.findOneTask(id);
    if (assigneeChanged && updated) this.notifyAssigned(updated);
    return updated;
  }

  // Statusni yangilash.
  // Xodim faqat ORQAGA qaytara oladi (masalan noto'g'ri boshlagan bo'lsa);
  // oldinga siljish uchun tasdiq so'rashi shart. Admin cheklovsiz.
  async updateStatus(id: number, status: string, payload: AuthPayload) {
    const task = await this.getTaskOr404(id);

    if (!payload.is_admin) {
      if (Number(task.assigned_to) !== Number(payload.user_id)) {
        throw new ForbiddenException('Bu vazifa sizga biriktirilmagan');
      }
      if (stageIndex(status) > stageIndex(task.status)) {
        throw new ForbiddenException(
          "Keyingi bosqichga o'tish uchun tasdiq so'rashingiz kerak",
        );
      }
    }

    await this.TasksRepository.update(
      {
        status,
        completed_at: status === 'done' ? new Date() : null,
        // Orqaga qaytarilsa kutayotgan so'rov ham bekor bo'ladi
        pending_status: null,
        approval_note: null,
        approval_requested_at: null,
      },
      { where: { id } },
    );
    return this.findOneTask(id);
  }

  // ─── Tasdiqlash oqimi ───────────────────────────────────────────────

  // Xodim keyingi bosqichga o'tish uchun so'rov yuboradi
  async requestApproval(
    id: number,
    status: string,
    note: string | undefined,
    payload: AuthPayload,
  ) {
    const task = await this.getTaskOr404(id);

    if (
      !payload.is_admin &&
      Number(task.assigned_to) !== Number(payload.user_id)
    ) {
      throw new ForbiddenException('Bu vazifa sizga biriktirilmagan');
    }
    if (stageIndex(status) <= stageIndex(task.status)) {
      throw new BadRequestException(
        "So'rov faqat keyingi bosqichga o'tish uchun yuboriladi",
      );
    }
    if (task.pending_status) {
      throw new BadRequestException(
        "Bu vazifa bo'yicha tasdiq so'rovi allaqachon yuborilgan",
      );
    }

    await this.TasksRepository.update(
      {
        pending_status: status,
        approval_note: note?.trim() || null,
        approval_requested_at: new Date(),
        approval_result: null,
        approval_reject_reason: null,
        approval_decided_by: null,
        approval_decided_at: null,
      },
      { where: { id } },
    );
    const updated = await this.findOneTask(id);
    if (updated) this.notifyApprovalRequested(updated).catch(() => {});
    return updated;
  }

  // Xodim o'z so'rovini qaytarib oladi
  async cancelApproval(id: number, payload: AuthPayload) {
    const task = await this.getTaskOr404(id);
    if (
      !payload.is_admin &&
      Number(task.assigned_to) !== Number(payload.user_id)
    ) {
      throw new ForbiddenException('Bu vazifa sizga biriktirilmagan');
    }
    if (!task.pending_status) {
      throw new BadRequestException("Kutilayotgan so'rov yo'q");
    }

    await this.TasksRepository.update(
      { pending_status: null, approval_note: null, approval_requested_at: null },
      { where: { id } },
    );
    return this.findOneTask(id);
  }

  // Tasdiqlash — vazifa so'ralgan bosqichga o'tadi
  async approve(id: number, payload: AuthPayload) {
    await this.assertCanDecide(payload);
    const task = await this.getTaskOr404(id);
    if (!task.pending_status) {
      throw new BadRequestException("Kutilayotgan so'rov yo'q");
    }

    const nextStatus = task.pending_status;
    await this.TasksRepository.update(
      {
        status: nextStatus,
        completed_at: nextStatus === 'done' ? new Date() : null,
        pending_status: null,
        approval_result: 'approved',
        approval_reject_reason: null,
        approval_decided_by: payload.user_id,
        approval_decided_at: new Date(),
      },
      { where: { id } },
    );
    const updated = await this.findOneTask(id);
    if (updated) this.notifyDecision(updated, true);
    return updated;
  }

  // Rad etish — vazifa joyida qoladi, sabab saqlanadi
  async reject(id: number, reason: string | undefined, payload: AuthPayload) {
    await this.assertCanDecide(payload);
    const task = await this.getTaskOr404(id);
    if (!task.pending_status) {
      throw new BadRequestException("Kutilayotgan so'rov yo'q");
    }

    await this.TasksRepository.update(
      {
        pending_status: null,
        approval_result: 'rejected',
        approval_reject_reason: reason?.trim() || null,
        approval_decided_by: payload.user_id,
        approval_decided_at: new Date(),
      },
      { where: { id } },
    );
    const updated = await this.findOneTask(id);
    if (updated) this.notifyDecision(updated, false, reason?.trim() || null);
    return updated;
  }

  // Tasdiq kutayotgan vazifalar (tasdiqlovchi/admin uchun)
  async findPendingApprovals(payload: AuthPayload) {
    await this.assertCanDecide(payload);
    return this.TasksRepository.findAll({
      where: { pending_status: { [Op.ne]: null } },
      include: userInclude,
      order: [['approval_requested_at', 'ASC']],
    });
  }

  // Vazifani o'chirish (admin)
  removeTask(id: number) {
    return this.TasksRepository.destroy({ where: { id } });
  }
}
