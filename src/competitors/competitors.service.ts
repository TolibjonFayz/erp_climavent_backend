import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuthPayload, assertOwnerOrAdmin } from 'src/common/ownership';
import { Partners } from 'src/partners/models/partner.model';
import { User } from 'src/users/models/user.model';
import { Competitor } from './models/competitor.model';
import { CompetitorEncounter } from './models/competitor-encounter.model';
import {
  CreateCompetitorDto,
  CreateEncounterDto,
  EncounterQueryDto,
  UpdateCompetitorDto,
  UpdateEncounterDto,
} from './dto/competitor.dto';

const creatorInclude = { model: User, as: 'creator', attributes: ['id', 'firstname', 'lastname'] };

// Katalog umumiy; uchrashuvlar KP kabi — oddiy xodim faqat o'zi kiritganini ko'radi
@Injectable()
export class CompetitorsService {
  constructor(
    @InjectModel(Competitor) private readonly competitors: typeof Competitor,
    @InjectModel(CompetitorEncounter) private readonly encounters: typeof CompetitorEncounter,
    @InjectModel(Partners) private readonly partners: typeof Partners,
  ) {}

  // Raqiblar ro'yxati + har biri bo'yicha foydalanuvchiga ko'rinadigan uchrashuvlar statistikasi
  async list(payload: AuthPayload) {
    const [rows, visible] = await Promise.all([
      this.competitors.findAll({ include: [creatorInclude], order: [['name', 'ASC']] }),
      this.encounters.findAll({
        where: this.visibleWhere(payload),
        attributes: ['competitor_id', 'outcome', 'their_price', 'our_price', 'encounter_date'],
        raw: true,
      }),
    ]);
    const stats = new Map<number, ReturnType<typeof emptyStats>>();
    for (const e of visible as any[]) {
      const s = stats.get(e.competitor_id) ?? emptyStats();
      s.total++;
      s[e.outcome as 'won' | 'lost' | 'pending']++;
      // Narx farqi faqat ikkala narx ham bo'lsa: musbat — raqib arzonroq
      if (e.their_price != null && e.our_price != null && Number(e.our_price) > 0) {
        s.priceDiffSum += (Number(e.our_price) - Number(e.their_price)) / Number(e.our_price);
        s.priceDiffN++;
      }
      if (!s.last_date || e.encounter_date > s.last_date) s.last_date = e.encounter_date;
      stats.set(e.competitor_id, s);
    }
    return rows.map((c) => {
      const s = stats.get(c.id) ?? emptyStats();
      const { priceDiffSum, priceDiffN, ...counts } = s;
      return {
        ...c.get({ plain: true }),
        stats: {
          ...counts,
          // Bizning narx raqibnikidan o'rtacha necha % qimmat (manfiy — arzon)
          avg_price_gap_pct: priceDiffN ? Math.round((priceDiffSum / priceDiffN) * 1000) / 10 : null,
        },
      };
    });
  }

  async create(dto: CreateCompetitorDto, payload: AuthPayload) {
    return this.competitors.create({ ...clean(dto), name: dto.name.trim(), created_by: payload.user_id });
  }

  async update(id: number, dto: UpdateCompetitorDto, payload: AuthPayload) {
    const c = await this.findCompetitor(id);
    assertOwnerOrAdmin(payload, c.created_by);
    return c.update({ ...clean(dto), ...(dto.name ? { name: dto.name.trim() } : {}) });
  }

  // O'chirish faqat admin: uchrashuvlar (boshqa xodimlarniki ham) birga o'chadi
  async remove(id: number, payload: AuthPayload) {
    if (!payload.is_admin) throw new ForbiddenException("Raqibni faqat admin o'chira oladi");
    const c = await this.findCompetitor(id);
    await this.encounters.destroy({ where: { competitor_id: c.id } });
    await c.destroy();
    return { deleted: true };
  }

  async listEncounters(query: EncounterQueryDto, payload: AuthPayload) {
    const where: Record<string, unknown> = { ...this.visibleWhere(payload) };
    if (query.competitor_id) where.competitor_id = Number(query.competitor_id);
    if (query.partner_id) where.partner_id = Number(query.partner_id);
    return this.encounters.findAll({
      where,
      include: [
        { model: Competitor, attributes: ['id', 'name'] },
        { model: Partners, attributes: ['id', 'fullname'] },
        creatorInclude,
      ],
      order: [['encounter_date', 'DESC'], ['id', 'DESC']],
    });
  }

  async createEncounter(dto: CreateEncounterDto, payload: AuthPayload) {
    await this.findCompetitor(dto.competitor_id);
    await this.assertPartnerAccess(dto.partner_id, payload);
    return this.encounters.create({ ...clean(dto), created_by: payload.user_id } as any);
  }

  async updateEncounter(id: number, dto: UpdateEncounterDto, payload: AuthPayload) {
    const e = await this.encounters.findByPk(id);
    if (!e) throw new NotFoundException('Uchrashuv topilmadi');
    assertOwnerOrAdmin(payload, e.created_by);
    if (dto.competitor_id) await this.findCompetitor(dto.competitor_id);
    if (dto.partner_id) await this.assertPartnerAccess(dto.partner_id, payload);
    return e.update(clean(dto));
  }

  async removeEncounter(id: number, payload: AuthPayload) {
    const e = await this.encounters.findByPk(id);
    if (!e) throw new NotFoundException('Uchrashuv topilmadi');
    assertOwnerOrAdmin(payload, e.created_by);
    await e.destroy();
    return { deleted: true };
  }

  private visibleWhere(payload: AuthPayload) {
    return payload.is_admin ? {} : { created_by: payload.user_id };
  }

  private async findCompetitor(id: number) {
    const c = await this.competitors.findByPk(Number(id));
    if (!c) throw new NotFoundException('Raqib topilmadi');
    return c;
  }

  // Xodim uchrashuvni faqat o'z mijoziga bog'lay oladi
  private async assertPartnerAccess(partnerId: number | undefined, payload: AuthPayload) {
    if (!partnerId) return;
    const p = await this.partners.findByPk(Number(partnerId));
    if (!p) throw new NotFoundException('Mijoz topilmadi');
    assertOwnerOrAdmin(payload, p.get('user_id'));
  }
}

const emptyStats = () => ({
  total: 0,
  won: 0,
  lost: 0,
  pending: 0,
  last_date: null as string | null,
  priceDiffSum: 0,
  priceDiffN: 0,
});

// Bo'sh satrlarni null qilamiz (ixtiyoriy maydonlarni tozalash uchun)
function clean<T extends object>(dto: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(dto)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
  }
  return out;
}
