import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/jwt.guard';
import { DevicesService } from './devices.service';

interface RequestWithPayload {
  payload: { user_id?: number; id?: number; is_admin?: boolean };
}

const userIdOf = (req: RequestWithPayload) => Number(req.payload?.user_id || req.payload?.id);

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  // Mobil ilova push tokenini ro'yxatga oladi (har kirishda va token yangilanganda)
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Register a mobile push token for the current user' })
  @Post('register')
  register(
    @Req() req: RequestWithPayload,
    @Body() body: { token: string; platform?: string; lang?: string; app_version?: string },
  ) {
    return this.devices.register(userIdOf(req), body || ({} as any));
  }

  // Hisobdan chiqishda
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Remove a push token of the current user' })
  @Post('unregister')
  unregister(@Req() req: RequestWithPayload, @Body() body: { token: string }) {
    return this.devices.unregister(userIdOf(req), body?.token);
  }

  // Sinov: o'zimga bildirishnoma (ilovadagi Profil sahifasidan)
  @UseGuards(JwtGuard)
  @ApiProperty({ description: 'Send a test notification to my devices' })
  @Post('test')
  async test(@Req() req: RequestWithPayload) {
    await this.devices.notifyUsers(
      [userIdOf(req)],
      (lang) =>
        lang === 'ru'
          ? { title: 'Climavent ERP', body: 'Уведомления работают ✅', data: { route: '/more' } }
          : { title: 'Climavent ERP', body: 'Bildirishnomalar ishlayapti ✅', data: { route: '/more' } },
      `test (user ${userIdOf(req)})`,
    );
    return { ok: true, fcm: this.devices.status() };
  }

  // FCM sozlanganmi (kalitning o'zi qaytmaydi)
  @UseGuards(JwtGuard)
  @Get('status')
  status() {
    return this.devices.status();
  }
}
