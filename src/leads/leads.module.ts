import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { User } from 'src/users/models/user.model';
import { Lead } from './models/lead.model';
import { LeadMessage } from './models/lead-message.model';
import { LeadsService } from './leads.service';
import { TelegramLeadsService } from './telegram.service';
import { LeadsController, LeadsTelegramController } from './leads.controller';

@Module({
  imports: [SequelizeModule.forFeature([Lead, LeadMessage, User]), JwtModule.register({})],
  // Tartib muhim: `leads/telegram/*` yo'llari `leads/:id` dan oldin turishi kerak
  controllers: [LeadsTelegramController, LeadsController],
  providers: [LeadsService, TelegramLeadsService],
})
export class LeadsModule {}
