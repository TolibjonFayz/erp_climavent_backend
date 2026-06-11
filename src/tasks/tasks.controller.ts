import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { JwtGuard } from 'src/guards/jwt.guard';

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

  // Statusni yangilash — xodim o'z vazifasini ko'chiradi
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Update only task status' })
  @Patch('status/:id')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateStatus(+id, dto.status);
  }

  // Vazifani o'chirish — faqat admin
  @UseGuards(AdminGuard)
  @ApiProperty({ description: 'Delete a task — admin only' })
  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.tasksService.removeTask(+id);
  }
}
