import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Kp } from 'src/kp/models/kp.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { Loyiha } from 'src/loyiha/models/loyiha.model';
import { ComeAndGo } from 'src/come_and_gos/models/come_and_go.model';
import { ComeAndGoInside } from 'src/come_and_go_inside/models/come_and_go_inside.model';
import { AuthPayload } from 'src/common/ownership';
import { innKey, nameSkeleton, phoneKey } from 'src/common/name-match';
import { Partners } from './models/partner.model';

type MatchReason = 'inn' | 'phone' | 'name';

// Juda qisqa nomlar ("OK", "ABC") tasodifan boshqa mijozga tushmasin
const MIN_NAME_SKELETON = 4;

// Mijoz kartasi 360°: KP, shartnoma, loyiha va obyekt tashriflari bazada mijozga FK bilan
// bog'lanmagan (1C importi — nom matn). Shuning uchun INN > telefon > nom skeleti bo'yicha topiladi.
// Ko'rinish qoidalari bo'limlarnikidek: oddiy xodim faqat o'zi kiritgan yozuvlarni ko'radi.
@Injectable()
export class PartnerRelatedService {
  constructor(
    @InjectModel(Kp) private readonly kpRepo: typeof Kp,
    @InjectModel(Dogovor) private readonly dogovorRepo: typeof Dogovor,
    @InjectModel(Loyiha) private readonly loyihaRepo: typeof Loyiha,
    @InjectModel(ComeAndGo) private readonly cgoRepo: typeof ComeAndGo,
    @InjectModel(ComeAndGoInside) private readonly visitRepo: typeof ComeAndGoInside,
  ) {}

  async related(partner: Partners, payload: AuthPayload) {
    const p = partner.get({ plain: true }) as any;
    const key = {
      name: nameSkeleton(p.fullname),
      inn: innKey(p.inn),
      phones: [phoneKey(p.phone_number), phoneKey(p.additional_phone_number)].filter(Boolean),
    };
    const nameOk = key.name.length >= MIN_NAME_SKELETON;
    const own = payload.is_admin ? {} : { created_by: payload.user_id };

    const reason = (row: { name?: unknown; inn?: unknown; phone?: unknown }): MatchReason | null => {
      if (key.inn && innKey(row.inn) === key.inn) return 'inn';
      const ph = phoneKey(row.phone);
      if (ph && key.phones.includes(ph)) return 'phone';
      if (nameOk && nameSkeleton(row.name) === key.name) return 'name';
      return null;
    };

    const [kps, dogovors, loyihas] = await Promise.all([
      this.kpRepo.findAll({
        where: own,
        attributes: ['id', 'kp_number', 'kp_status', 'client_name', 'kp_date', 'kp_sum', 'manager_name', 'closed_date'],
        raw: true,
      }),
      this.dogovorRepo.findAll({
        where: own,
        attributes: [
          'id', 'dogovor_number', 'dogovor_date', 'client_name', 'client_inn', 'client_phone',
          'dogovor_sum', 'dogovor_status', 'manager_name',
        ],
        raw: true,
      }),
      this.loyihaRepo.findAll({
        where: own,
        attributes: [
          'id', 'order_number', 'status', 'manager_name', 'contact_phone', 'system_info',
          'kp_number', 'dogovor_number', 'given_date',
        ],
        raw: true,
      }),
    ]);

    const kp = (kps as any[])
      .map((k) => ({ ...k, matched_by: reason({ name: k.client_name }) }))
      .filter((k) => k.matched_by);
    const dogovor = (dogovors as any[])
      .map((d) => ({
        ...d,
        matched_by: reason({ name: d.client_name, inn: d.client_inn, phone: d.client_phone }),
      }))
      .filter((d) => d.matched_by);

    // Loyiha mijoz nomini saqlamaydi — topilgan KP/shartnoma raqami yoki telefon orqali bog'lanadi
    const kpNumbers = new Set(kp.map((k) => String(k.kp_number)).filter((n) => n !== 'null'));
    const dgNumbers = new Set(dogovor.map((d) => String(d.dogovor_number)).filter((n) => n !== 'null'));
    const loyiha = (loyihas as any[]).filter(
      (l) =>
        (l.kp_number && kpNumbers.has(String(l.kp_number))) ||
        (l.dogovor_number && dgNumbers.has(String(l.dogovor_number))) ||
        (phoneKey(l.contact_phone) && key.phones.includes(phoneKey(l.contact_phone))),
    );

    const sites = await this.findVisits(key.name, nameOk, payload);

    return {
      kp: sortByDate(kp, 'kp_date'),
      dogovor: sortByDate(dogovor, 'dogovor_date'),
      loyiha: sortByDate(loyiha, 'given_date'),
      sites,
      summary: summarize(kp, dogovor, sites),
    };
  }

  // Obyekt tashrifi: kompaniya yoki mijoz nomi bo'yicha (tashrifda INN/telefon yo'q)
  private async findVisits(name: string, nameOk: boolean, payload: AuthPayload) {
    if (!nameOk) return [];
    let fatherIds: number[] | null = null;
    if (!payload.is_admin) {
      const mine = await this.cgoRepo.findAll({
        where: { user_id: payload.user_id },
        attributes: ['id'],
        raw: true,
      });
      fatherIds = (mine as any[]).map((m) => m.id);
      if (!fatherIds.length) return [];
    }
    const visits = await this.visitRepo.findAll({
      where: fatherIds ? { come_and_go_father_id: fatherIds } : {},
      attributes: ['id', 'company_name', 'client_name', 'whereto', 'when_gone', 'come_and_go_father_id', 'createdAt'],
      raw: true,
    });
    return sortByDate(
      (visits as any[]).filter(
        (v) =>
          v.come_and_go_father_id &&
          (nameSkeleton(v.company_name) === name || nameSkeleton(v.client_name) === name),
      ),
      'when_gone',
    );
  }
}

const time = (v: unknown) => (v ? new Date(v as string).getTime() || 0 : 0);
const sortByDate = <T extends Record<string, any>>(rows: T[], field: string) =>
  rows.sort((a, b) => time(b[field] ?? b.createdAt) - time(a[field] ?? a.createdAt));

function summarize(kp: any[], dogovor: any[], sites: any[]) {
  const sum = (rows: any[], f: string) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  const dates = [
    ...kp.map((k) => k.kp_date),
    ...dogovor.map((d) => d.dogovor_date),
    ...sites.map((s) => s.when_gone),
  ].filter(Boolean);
  return {
    kp_count: kp.length,
    kp_sum: sum(kp, 'kp_sum'),
    dogovor_count: dogovor.length,
    dogovor_sum: sum(dogovor, 'dogovor_sum'),
    visit_count: sites.length,
    last_activity: dates.length ? new Date(Math.max(...dates.map(time))).toISOString() : null,
  };
}
