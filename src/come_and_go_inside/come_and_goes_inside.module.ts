import { Module } from '@nestjs/common';
import { ComeAndGoesService } from './come_and_goes_inside.service';
import { ComeAndGoesController } from './come_and_goes_inside.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { ComeAndGoInside } from './models/come_and_go_inside.model';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [SequelizeModule.forFeature([ComeAndGoInside]), JwtModule.register({})],
  controllers: [ComeAndGoesController],
  providers: [ComeAndGoesService],
  exports: [ComeAndGoesService],
})
export class ComeAndGoesInsideModule {}
