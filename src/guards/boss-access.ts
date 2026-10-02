import { User } from 'src/users/models/user.model';

// Boss (direktor) sahifasiga kirish huquqi — frontend router bilan bir xil qoida:
// admin "Ruxsatlar"da `permissions.boss` ni belgilagan bo'lsa o'sha hal qiladi,
// aks holda faqat BOSS_USER_ID (default 16).
export const bossUserId = () => Number(process.env.BOSS_USER_ID) || 16;

export function hasBossAccess(user: User): boolean {
  const perm = user.permissions?.boss;
  if (perm !== undefined && perm !== null) return Boolean(perm);
  return Number(user.id) === bossUserId();
}
