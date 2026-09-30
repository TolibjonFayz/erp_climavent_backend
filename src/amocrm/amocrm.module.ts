import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { AmocrmClient } from './amocrm.client';
import { AmocrmController } from './amocrm.controller';
import { AmocrmService } from './amocrm.service';
import { AmocrmSyncService } from './amocrm-sync.service';
import { AmoCall } from './models/amo-call.model';
import { AmoContact } from './models/amo-contact.model';
import { AmoExcludedPhone } from './models/amo-excluded-phone.model';
import { AmoLeadContact } from './models/amo-lead-contact.model';
import { AmoLead } from './models/amo-lead.model';
import { AmoLossReason } from './models/amo-loss-reason.model';
import { AmoPipeline } from './models/amo-pipeline.model';
import { AmoStatus } from './models/amo-status.model';
import { AmoSyncState } from './models/amo-sync-state.model';
import { AmoUser } from './models/amo-user.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      AmoUser,
      AmoPipeline,
      AmoStatus,
      AmoLead,
      AmoLossReason,
      AmoCall,
      AmoContact,
      AmoLeadContact,
      AmoExcludedPhone,
      AmoSyncState,
    ]),
    JwtModule.register({}),
  ],
  controllers: [AmocrmController],
  providers: [AmocrmClient, AmocrmSyncService, AmocrmService],
})
export class AmocrmModule {}
