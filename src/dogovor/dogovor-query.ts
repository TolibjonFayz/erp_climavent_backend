// Shartnomalar ro'yxatini serverda filtrlash va bo'laklab berish.
// Filtrlar saytdagi eski (brauzerdagi) qidiruv bilan bir xil ma'noda: har bir maydon — "ichida bor"
// (katta-kichik harf farqsiz), sanalar dd.mm.yyyy ko'rinishida solishtiriladi.
import { Op, Sequelize, WhereOptions } from 'sequelize';

export interface DogovorListQuery {
  page?: string;
  limit?: string;
  number?: string;
  status?: string;
  client?: string;
  manager?: string;
  date?: string;
  paymentDate?: string;
  sum?: string;
  prepayment?: string;
  inn?: string;
  phone?: string;
  comment?: string;
  adminComment?: string;
  /** Umumiy qidiruv (mobil ilova): har bir so'z raqam/mijoz/INN/telefon/menejer/izohdan birida */
  q?: string;
}

const STATUSES = ['Open', 'Shipped', 'PartlyShipped', 'Closed'];

// LIKE maxsus belgilari foydalanuvchi matnida oddiy belgi bo'lib qolsin
const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
const col = (name: string) => Sequelize.col(`Dogovor.${name}`);
const asText = (name: string) => Sequelize.cast(col(name), 'text');
const asDate = (name: string) => Sequelize.fn('to_char', col(name), 'DD.MM.YYYY');

export function buildDogovorWhere(
  q: DogovorListQuery,
  scope: WhereOptions,
  isAdmin: boolean,
): WhereOptions {
  const and: unknown[] = [scope];
  const text = (v?: string) => String(v ?? '').trim();
  const contains = (expr: unknown, v?: string) => {
    const s = text(v);
    if (s) and.push(Sequelize.where(expr as never, { [Op.iLike]: like(s) }));
  };
  contains(asText('dogovor_number'), q.number);
  // "Mijoz" maydoni shartnoma raqami bo'yicha ham topadi
  const client = text(q.client);
  if (client) {
    and.push({
      [Op.or]: [
        { client_name: { [Op.iLike]: like(client) } },
        Sequelize.where(asText('dogovor_number'), { [Op.iLike]: like(client) }),
      ],
    });
  }
  contains(col('manager_name'), q.manager);
  contains(asDate('dogovor_date'), q.date);
  contains(asDate('payment_date'), q.paymentDate);
  contains(asText('dogovor_sum'), q.sum);
  contains(asText('prepayment_percent'), q.prepayment);
  contains(col('client_inn'), q.inn);
  contains(col('client_phone'), q.phone);
  contains(col('comment'), q.comment);
  if (isAdmin) contains(col('admin_comment'), q.adminComment);
  if (STATUSES.includes(text(q.status))) and.push({ dogovor_status: text(q.status) });
  if (text(q.q)) and.push(searchWords(text(q.q)));
  return { [Op.and]: and } as WhereOptions;
}

/** Umumiy qidiruv (Ctrl+K): har bir so'z raqam, mijoz, INN, telefon yoki menejerdan birida bo'lsin */
export function buildDogovorSearch(q: string, scope: WhereOptions): WhereOptions {
  return { [Op.and]: [scope, searchWords(q)] } as WhereOptions;
}

function searchWords(q: string): WhereOptions {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const and: unknown[] = [];
  for (const w of words) {
    const or: unknown[] = [
      Sequelize.where(asText('dogovor_number'), { [Op.iLike]: like(w) }),
      { client_name: { [Op.iLike]: like(w) } },
      { client_inn: { [Op.iLike]: like(w) } },
      { client_phone: { [Op.iLike]: like(w) } },
      { manager_name: { [Op.iLike]: like(w) } },
      { comment: { [Op.iLike]: like(w) } },
    ];
    // Telefon belgilarsiz ham topilsin: "901234567" → "+998 (90) 123-45-67"
    if (/^\d{3,}$/.test(w)) {
      or.push(
        Sequelize.where(Sequelize.fn('regexp_replace', col('client_phone'), '\\D', '', 'g'), {
          [Op.like]: like(w),
        }),
      );
    }
    and.push({ [Op.or]: or });
  }
  return { [Op.and]: and } as WhereOptions;
}

export function pageParams(q: DogovorListQuery) {
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 200);
  const page = Math.max(Number(q.page) || 1, 1);
  return { limit, offset: (page - 1) * limit };
}
