import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { User } from 'src/users/models/user.model';
import { Partners } from 'src/partners/models/partner.model';
import { Competitor } from './models/competitor.model';
import { CompetitorEncounter } from './models/competitor-encounter.model';
import { CompetitorsService } from './competitors.service';
import { CompetitorsController } from './competitors.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([Competitor, CompetitorEncounter, Partners, User]),
    JwtModule.register({}),
  ],
  controllers: [CompetitorsController],
  providers: [CompetitorsService],
})
export class CompetitorsModule {}
