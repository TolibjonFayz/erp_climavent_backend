import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { DogovorService } from './dogovor.service';
import { DogovorController } from './dogovor.controller';
import { Dogovor } from './models/dogovor.model';
import { OtgruzkaModule } from 'src/otgruzka/otgruzka.module';

@Module({
  imports: [SequelizeModule.forFeature([Dogovor]), JwtModule.register({}), OtgruzkaModule],
  controllers: [DogovorController],
  providers: [DogovorService],
})
export class DogovorModule {}
