import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Tasks } from './models/task.model';
import { User } from 'src/users/models/user.model';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

// assignee/creator ni parolsiz qaytarish uchun umumiy include
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
];

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Tasks) private readonly TasksRepository: typeof Tasks,
  ) {}

  // Vazifa yaratish (admin biriktiradi)
  createTask(createTaskDto: CreateTaskDto) {
    return this.TasksRepository.create(createTaskDto);
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

  // Vazifani to'liq yangilash (admin)
  async updateTask(id: number, updateTaskDto: UpdateTaskDto) {
    const payload: Partial<Tasks> = { ...updateTaskDto };
    if (updateTaskDto.status) {
      payload.completed_at =
        updateTaskDto.status === 'done' ? new Date() : null;
    }
    const [count, rows] = await this.TasksRepository.update(payload, {
      where: { id },
      returning: true,
    });
    if (!count) throw new NotFoundException('Task not found');
    return rows[0];
  }

  // Faqat statusni yangilash (xodim)
  async updateStatus(id: number, status: string) {
    const completed_at = status === 'done' ? new Date() : null;
    const [count, rows] = await this.TasksRepository.update(
      { status, completed_at },
      { where: { id }, returning: true },
    );
    if (!count) throw new NotFoundException('Task not found');
    return rows[0];
  }

  // Vazifani o'chirish (admin)
  removeTask(id: number) {
    return this.TasksRepository.destroy({ where: { id } });
  }
}
