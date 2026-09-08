import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthPayload, TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { RequestApprovalDto } from './dto/request-approval.dto';
import { RejectApprovalDto } from './dto/reject-approval.dto';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';

interface RequestWithPayload {
  payload: AuthPayload;
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // Vazifa yaratish — faqat admin biriktiradi
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Create (assign) a task — admin only' })
  @Post('create')
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.createTask(createTaskDto);
  }

  // Barcha vazifalar — faqat admin ko'radi
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Get all tasks — admin only' })
  @Get('all')
  findAll() {
    return this.tasksService.findAllTasks();
  }

  // Tasdiqlovchi kim ekanini bilish (frontend "Gulshoda tasdiqlaydi" deb yozadi)
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Who approves stage changes' })
  @Get('approver')
  approver() {
    return this.tasksService.getApprover();
  }

  // Tasdiq kutayotgan so'rovlar — tasdiqlovchi/admin uchun
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Tasks waiting for approval' })
  @Get('pending-approvals')
  pendingApprovals(@Req() req: RequestWithPayload) {
    return this.tasksService.findPendingApprovals(req.payload);
  }

  // Xodimning o'ziga biriktirilgan vazifalari
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Get tasks assigned to a user' })
  @Get('userall/:id')
  findAllOfUser(@Param('id') id: string) {
    return this.tasksService.findTasksOfUser(+id);
  }

  // Bitta vazifa
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Get a task by id' })
  @Get('one/:id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOneTask(+id);
  }

  // Vazifani to'liq tahrirlash — faqat admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Update a task — admin only' })
  @Patch('update/:id')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.updateTask(+id, updateTaskDto);
  }

  // Statusni yangilash — xodim faqat orqaga qaytara oladi, admin cheklovsiz
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Update only task status' })
  @Patch('status/:id')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
    @Req() req: RequestWithPayload,
  ) {
    return this.tasksService.updateStatus(+id, dto.status, req.payload);
  }

  // Xodim keyingi bosqichga o'tish uchun tasdiq so'raydi
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Ask approval to move to the next stage' })
  @Patch('request-approval/:id')
  requestApproval(
    @Param('id') id: string,
    @Body() dto: RequestApprovalDto,
    @Req() req: RequestWithPayload,
  ) {
    return this.tasksService.requestApproval(
      +id,
      dto.status,
      dto.note,
      req.payload,
    );
  }

  // So'rovni qaytarib olish
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Cancel a pending approval request' })
  @Patch('cancel-approval/:id')
  cancelApproval(@Param('id') id: string, @Req() req: RequestWithPayload) {
    return this.tasksService.cancelApproval(+id, req.payload);
  }

  // Tasdiqlash
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Approve a pending request' })
  @Patch('approve/:id')
  approve(@Param('id') id: string, @Req() req: RequestWithPayload) {
    return this.tasksService.approve(+id, req.payload);
  }

  // Rad etish
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Reject a pending request' })
  @Patch('reject/:id')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectApprovalDto,
    @Req() req: RequestWithPayload,
  ) {
    return this.tasksService.reject(+id, dto.reason, req.payload);
  }

  // Vazifani o'chirish — faqat admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Delete a task — admin only' })
  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.tasksService.removeTask(+id);
  }
}
