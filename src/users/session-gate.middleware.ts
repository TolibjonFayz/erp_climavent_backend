import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionsService } from './sessions.service';

// Login/refresh/logout o'zi refresh token bilan ishlaydi
const SKIP = /^\/?api\/users\/(login|refresh|logout)(\/|\?|$)/;

// Har so'rovda: access token'dagi sessiya yopilgan bo'lsa (boshqa qurilmadan chiqildi,
// parol almashdi, xodim bloklandi) — token muddati tugashini kutmasdan 401.
// Frontend 401'da refresh qiladi, u ham rad etiladi va login sahifasiga qaytaradi.
// sid'siz eski tokenlar (sessiyalardan oldin berilgan) tekshirilmaydi.
@Injectable()
export class SessionGateMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async use(req: any, res: any, next: () => void) {
    const [bearer, token] = String(req.headers?.authorization || '').split(' ');
    if (bearer !== 'Bearer' || !token || SKIP.test(req.originalUrl || '')) return next();
    let sid: number | undefined;
    try {
      sid = (this.jwt.verify(token, { secret: process.env.ACCESS_TOKEN_KEY_USER }) as any)?.sid;
    } catch {
      return next(); // yaroqsiz token — guard o'zi 401 qaytaradi
    }
    if (!sid) return next();
    try {
      if (!(await this.sessions.isActive(Number(sid)))) {
        return res.status(401).json({ statusCode: 401, message: 'Session ended', error: 'Unauthorized' });
      }
    } catch {
      // Baza vaqtincha javob bermasa — ishni to'xtatmaymiz, guard'lar baribir tekshiradi
    }
    next();
  }
}
