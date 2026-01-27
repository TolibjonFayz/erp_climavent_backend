import { Module } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Partners } from './models/partner.model';

@Module({
  imports: [SequelizeModule.forFeature([Partners])],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
