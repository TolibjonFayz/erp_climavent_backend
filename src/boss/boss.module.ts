import { Module } from '@nestjs/common';
import { BossService } from './boss.service';
import { BossController } from './boss.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { BossTarget } from './models/boss_target.model';
import { Announcement } from './models/announcement.model';
import { User } from 'src/users/models/user.model';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    SequelizeModule.forFeature([BossTarget, Announcement, User]),
    JwtModule.register({}),
  ],
  controllers: [BossController],
  providers: [BossService],
  exports: [BossService],
})
export class BossModule {}
