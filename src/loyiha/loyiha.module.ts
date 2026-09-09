import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { LoyihaService } from './loyiha.service';
import { LoyihaController } from './loyiha.controller';
import { Loyiha } from './models/loyiha.model';
import { LoyihaFile } from './models/loyiha-file.model';

@Module({
  imports: [
    SequelizeModule.forFeature([Loyiha, LoyihaFile]),
    JwtModule.register({}),
  ],
  controllers: [LoyihaController],
  providers: [LoyihaService],
})
export class LoyihaModule {}
