import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { User } from 'src/users/models/user.model';
import { DeviceToken } from './device-token.model';
import { fcmStatus, logFcmStatus, PushMessage, sendToToken } from './fcm';
import { apnsConfigured, sendToApns } from './apns';

type Lang = 'uz' | 'ru';
// Xabar matni qurilma tiliga qarab quriladi
export type LocalizedMessage = (lang: Lang) => PushMessage;

@Injectable()
export class DevicesService implements OnModuleInit {
  private readonly logger = new Logger('Push');

  constructor(
    @InjectModel(DeviceToken) private readonly tokens: typeof DeviceToken,
    @InjectModel(User) private readonly users: typeof User,
  ) {}

  onModuleInit() {
    logFcmStatus();
  }

  status() {
    return { ...fcmStatus(), apns: apnsConfigured() };
  }

  // Qurilmani ro'yxatga olish: token boshqa hisobniki bo'lsa — egasi almashadi
  async register(userId: number, body: { token: string; platform?: string; lang?: string; app_version?: string }) {
    const token = String(body.token || '').trim();
    if (!token) return { ok: false };
    const values = {
      user_id: userId,
      token,
      platform: body.platform === 'ios' ? 'ios' : 'android',
      lang: body.lang === 'ru' ? 'ru' : 'uz',
      app_version: body.app_version ? String(body.app_version).slice(0, 32) : null,
    };
    const existing = await this.tokens.findOne({ where: { token } });
    if (existing) await existing.update(values);
    else await this.tokens.create(values);
    return { ok: true };
  }

  // Hisobdan chiqilganda — shu qurilmaga boshqa xabar kelmasin
  async unregister(userId: number, token: string) {
    await this.tokens.destroy({ where: { user_id: userId, token: String(token || '') } });
    return { ok: true };
  }

  /**
   * Foydalanuvchilarga yuborish. Hech qachon xato tashlamaydi — chaqiruvchi
   * `void` qilib qo'yib ketishi mumkin (asosiy amal kutib qolmaydi).
   */
  async notifyUsers(userIds: Array<number | null | undefined>, build: LocalizedMessage, label: string) {
    try {
      const ids = [...new Set(userIds.map(Number).filter((x) => Number.isInteger(x) && x > 0))];
      if (!ids.length) return;
      const rows = await this.tokens.findAll({
        where: { user_id: { [Op.in]: ids } },
        include: [{ model: User, attributes: ['id', 'is_blocked'] }],
      });
      const active = rows.filter((r) => !r.user?.is_blocked);
      let sent = 0;
      let removed = 0;
      const errors: string[] = [];
      for (const row of active) {
        const msg = build(row.lang === 'ru' ? 'ru' : 'uz');
        // iPhone — APNs token, Android — FCM token
        const r = row.platform === 'ios' ? await sendToApns(row.token, msg) : await sendToToken(row.token, msg);
        if (r.status === 'ok') {
          sent++;
          await row.update({ last_sent_at: new Date() }).catch(() => {});
        } else if (r.status === 'gone') {
          removed++;
          await row.destroy().catch(() => {});
        } else if (r.error) {
          errors.push(r.error);
        }
      }
      const tail = errors.length ? ` — xato: ${[...new Set(errors)].join(' | ')}` : '';
      this.logger.log(
        `${label}: ${ids.length} ta xodim, ${active.length} ta qurilma, ${sent} ta yuborildi` +
          (removed ? `, ${removed} ta eskirgan token o'chirildi` : '') +
          tail,
      );
    } catch (e) {
      this.logger.error(`${label}: yiqildi — ${(e as Error).message}`);
    }
  }

  // Barcha faol xodimlarga (masalan, Boss e'loni)
  async notifyAll(build: LocalizedMessage, label: string, exceptUserId?: number) {
    try {
      const users = await this.users.findAll({ attributes: ['id'], where: { is_blocked: { [Op.not]: true } } });
      const ids = users.map((u) => Number(u.id)).filter((id) => id !== Number(exceptUserId));
      await this.notifyUsers(ids, build, label);
    } catch (e) {
      this.logger.error(`${label}: yiqildi — ${(e as Error).message}`);
    }
  }

  async adminIds(): Promise<number[]> {
    const admins = await this.users.findAll({ attributes: ['id'], where: { is_admin: true } });
    return admins.map((u) => Number(u.id));
  }
}
