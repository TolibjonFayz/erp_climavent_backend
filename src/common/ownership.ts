import { ForbiddenException } from '@nestjs/common';

// JwtGuard req.payload ga qo'yadigan ma'lumot (is_admin bazadan olinadi)
export type AuthPayload = { user_id: number; is_admin?: boolean };

// Yozuv egasi yoki admin bo'lmasa 403. 401 emas — frontend 401 da logout qiladi
export function assertOwnerOrAdmin(payload: AuthPayload, ownerId: unknown) {
  if (payload?.is_admin) return;
  if (ownerId != null && Number(ownerId) === Number(payload?.user_id)) return;
  throw new ForbiddenException("Bu ma'lumotga ruxsatingiz yo'q");
}

// Oddiy xodim faqat o'zi uchun yozuv yarata oladi — body'dagi user_id tokendan olinadi
export function ownUserId(payload: AuthPayload, requested: unknown): number {
  if (payload?.is_admin && requested != null) return Number(requested);
  return Number(payload.user_id);
}

// update(..., returning: true) va create default scope'ni chetlab o'tadi — sirlarni olib tashlaymiz
export function stripSecrets<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return user;
  const plain = typeof user.get === 'function' ? user.get({ plain: true }) : { ...user };
  delete plain.password;
  delete plain.refresh_token;
  return plain;
}
