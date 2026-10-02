import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Attendance } from './models/attendance.model';
import { JwtModule } from '@nestjs/jwt';
import { HikController } from './hik/hik.controller';
import { HikService } from './hik/hik.service';
import { HikEvent } from './hik/models/hik-event.model';
import { HikEmployee } from './hik/models/hik-employee.model';
import { HikDevice } from './hik/models/hik-device.model';

@Module({
  imports: [
    SequelizeModule.forFeature([Attendance, HikEvent, HikEmployee, HikDevice]),
    JwtModule.register({}),
  ],
  controllers: [AttendanceController, HikController],
  providers: [AttendanceService, HikService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
