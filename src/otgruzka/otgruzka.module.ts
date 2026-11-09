import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { User } from 'src/users/models/user.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { SkladModule } from 'src/sklad/sklad.module';
import { OtgruzkaController, OtgruzkaHookController } from './otgruzka.controller';
import { OtgruzkaService } from './otgruzka.service';
import { OtgruzkaOrder } from './models/otgruzka-order.model';
import { OtgruzkaPayment } from './models/otgruzka-payment.model';
import { OtgruzkaNote } from './models/otgruzka-note.model';
import { OtgruzkaLine } from './models/otgruzka-line.model';
import { OtgruzkaSetting } from './models/otgruzka-setting.model';
import { OtgruzkaDidoxFile } from './models/otgruzka-didox-file.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      OtgruzkaOrder,
      OtgruzkaPayment,
      OtgruzkaNote,
      OtgruzkaLine,
      OtgruzkaSetting,
      OtgruzkaDidoxFile,
      Dogovor,
      User,
    ]),
    JwtModule.register({}),
    SkladModule,
  ],
  controllers: [OtgruzkaController, OtgruzkaHookController],
  providers: [OtgruzkaService],
  exports: [OtgruzkaService],
})
export class OtgruzkaModule {}
