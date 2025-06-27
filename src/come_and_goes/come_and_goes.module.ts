import { Module } from '@nestjs/common';
import { ComeAndGoesService } from './come_and_goes.service';
import { ComeAndGoesController } from './come_and_goes.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { ComeAndGo } from './models/come_and_go.model';

@Module({
  imports: [SequelizeModule.forFeature([ComeAndGo])],
  controllers: [ComeAndGoesController],
  providers: [ComeAndGoesService],
  exports: [ComeAndGoesService],
})
export class ComeAndGoesModule {}
