import { User } from 'src/users/models/user.model';
import { Module } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Partners } from './models/partner.model';
import { JwtModule } from '@nestjs/jwt';
import { Kp } from 'src/kp/models/kp.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { Loyiha } from 'src/loyiha/models/loyiha.model';
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';
import { ComeAndGoInside } from 'src/come_and_go_inside/models/come_and_go_inside.model';
import { PartnerRelatedService } from './partner-related.service';

@Module({
  imports: [SequelizeModule.forFeature([Partners, User, Kp, Dogovor, Loyiha, ComeAndGo, ComeAndGoInside]), JwtModule.register({})],
  controllers: [PartnersController],
  providers: [PartnersService, PartnerRelatedService],
  exports: [PartnersService],
})
export class PartnersModule {}
