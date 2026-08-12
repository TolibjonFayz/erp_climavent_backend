import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { KpService } from './kp.service';
import { KpController } from './kp.controller';
import { Kp } from './models/kp.model';

@Module({
  imports: [SequelizeModule.forFeature([Kp]), JwtModule.register({})],
  controllers: [KpController],
  providers: [KpService],
})
export class KpModule {}
