import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ActivityContext, activityStore } from './activity-context';
import { ActivityService } from './activity.service';

const errorText = (body: any): string | undefined => {
  const m = body?.message;
  if (Array.isArray(m)) return m.join('; ');
  return m != null ? String(m) : undefined;
};

// Har bir so'rov: kim yubordi (token'dan), oxirgi faollikni yangilash, bazadagi
// o'zgarishlarni yig'ish (AsyncLocalStorage) va javob ketgach jurnalga yozish.
// Guard rad etgan (403) urinishlar ham shu yerda ushlanadi.
@Injectable()
export class ActivityMiddleware implements NestMiddleware {
  constructor(
    private readonly activity: ActivityService,
    private readonly jwt: JwtService,
  ) {}

  use(req: any, res: any, next: () => void) {
    const started = Date.now();
    const ctx: ActivityContext = { changes: [], dropped: 0 };
    const userId = this.actorId(req);
    if (userId) this.activity.touch(userId);

    const json = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 400) ctx.error = errorText(body);
      else if (body && typeof body === 'object' && !Array.isArray(body) && body.id != null) {
        ctx.resultId = body.id;
      }
      return json(body);
    };
    res.on('finish', () => {
      this.activity.recordRequest(req, res, ctx, userId, Date.now() - started).catch(() => undefined);
    });

    activityStore.run(ctx, next);
  }

  private actorId(req: any): number | null {
    const [bearer, token] = String(req.headers?.authorization || '').split(' ');
    if (bearer !== 'Bearer' || !token) return null;
    try {
      const p: any = this.jwt.verify(token, { secret: process.env.ACCESS_TOKEN_KEY_USER });
      const id = Number(p?.user_id || p?.id);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }
}
