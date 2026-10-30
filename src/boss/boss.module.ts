import { AnnouncementsFeedController } from './announcements-feed.controller';
import { Module } from '@nestjs/common';
import { BossService } from './boss.service';
import { BossController } from './boss.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { BossTarget } from './models/boss_target.model';
import { Announcement } from './models/announcement.model';
import { User } from 'src/users/models/user.model';
import { JwtModule } from '@nestjs/jwt';
import { Kp } from 'src/kp/models/kp.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { Competitor } from 'src/competitors/models/competitor.model';
import { CompetitorEncounter } from 'src/competitors/models/competitor-encounter.model';
import { BossSalesService } from './boss-sales.service';

@Module({
  imports: [
    SequelizeModule.forFeature([BossTarget, Announcement, User, Kp, Dogovor, Competitor, CompetitorEncounter]),
    JwtModule.register({}),
  ],
  controllers: [BossController, AnnouncementsFeedController],
  providers: [BossService, BossSalesService],
  exports: [BossService],
})
export class BossModule {}
