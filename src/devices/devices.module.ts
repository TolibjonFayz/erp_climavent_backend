import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/users/models/user.model';
import { DeviceToken } from './device-token.model';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

// Global — vazifalar, boss va boshqa modullar bildirishnoma yubora oladi
@Global()
@Module({
  imports: [SequelizeModule.forFeature([DeviceToken, User]), JwtModule.register({})],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
