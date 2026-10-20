import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { SkladController } from './sklad.controller';
import { SkladService } from './sklad.service';
import { SkladItem } from './models/sklad-item.model';
import { SkladMovement } from './models/sklad-movement.model';
import { SkladContractLine } from './models/sklad-contract-line.model';
import { SkladSource } from './models/sklad-source.model';
import { SkladSetting } from './models/sklad-setting.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SkladItem,
      SkladMovement,
      SkladContractLine,
      SkladSource,
      SkladSetting,
    ]),
    JwtModule.register({}),
  ],
  controllers: [SkladController],
  providers: [SkladService],
})
export class SkladModule {}
