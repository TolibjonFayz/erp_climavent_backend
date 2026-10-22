import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { TrainingRecord } from './models/training-record.model';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
  imports: [SequelizeModule.forFeature([TrainingRecord]), JwtModule.register({})],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
