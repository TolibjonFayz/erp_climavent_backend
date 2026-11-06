import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { fn, col, Op, WhereOptions } from 'sequelize';
import { User } from 'src/users/models/user.model';
import { CreateLeadDto, LeadQueryDto, UpdateLeadDto } from './dto/lead.dto';
import { Lead, LeadSource } from './models/lead.model';
import { LeadMessage } from './models/lead-message.model';

const PREVIEW_LEN = 300;
const MAX_TEXT = 4000;

// +998 90 123 45 67, 998901234567, 90 123-45-67 ko'rinishlaridagi raqamni topadi
const PHONE_RE = /(?:\+?998[\s\-()]*)?\(?\d{2}\)?[\s\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)/;

export function extractPhone(text: string): string | null {
  const m = PHONE_RE.exec(text || '');
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  return local.length === 9 ? `+998${local}` : null;
}

export interface IncomingMessage {
  source: LeadSource;
  external_key: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  chat_id?: string | null;
  chat_title?: string | null;
  tg_message_id?: number | null;
  text: string;
  sent_at: Date;
  context?: string | null;
  link?: string | null;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead) private readonly leads: typeof Lead,
    @InjectModel(LeadMessage) private readonly messages: typeof LeadMessage,
    @InjectModel(User) private readonly users: typeof User,
  ) {}

  // ─── Kanallardan kelgan xabarni qabul qilish (Telegram, keyinroq email) ──────
  async ingest(m: IncomingMessage): Promise<{ lead: Lead; created: boolean; duplicate: boolean }> {
    const text = (m.text || '').slice(0, MAX_TEXT);

    // Telegram qayta yuborsa — ikkilamaymiz
    if (m.chat_id && m.tg_message_id != null) {
      const dup = await this.messages.findOne({
        where: { chat_id: m.chat_id, tg_message_id: m.tg_message_id },
        attributes: ['id', 'lead_id'],
      });
      if (dup) {
        const lead = await this.leads.findByPk(dup.lead_id);
        return { lead: lead as Lead, created: false, duplicate: true };
      }
    }

    const [lead, created] = await this.leads.findOrCreate({
      where: { external_key: m.external_key },
      defaults: {
        external_key: m.external_key,
        source: m.source,
        status: 'new',
        name: m.name ?? null,
        username: m.username ?? null,
        email: m.email ?? null,
        chat_title: m.chat_title ?? null,
        messages_count: 0,
      },
    });

    await this.messages.create({
      lead_id: lead.id,
      text,
      sent_at: m.sent_at,
      chat_id: m.chat_id ?? null,
      chat_title: m.chat_title ?? null,
      tg_message_id: m.tg_message_id ?? null,
      context: m.context ? m.context.slice(0, PREVIEW_LEN) : null,
      link: m.link ?? null,
    });

    const patch: Partial<Lead> = {
      messages_count: (lead.messages_count || 0) + 1,
      chat_title: m.chat_title ?? lead.chat_title,
    };
    // Eski xabar (kechikib kelgan) oxirgisini bosib ketmasin
    if (!lead.last_message_at || m.sent_at >= lead.last_message_at) {
      patch.last_message_at = m.sent_at;
      patch.last_message_text = text.slice(0, PREVIEW_LEN);
    }
    if (!lead.phone) patch.phone = extractPhone(text);
    if (!lead.name && m.name) patch.name = m.name;
    if (!lead.username && m.username) patch.username = m.username;
    await lead.update(patch);

    return { lead, created, duplicate: false };
  }

  // ─── Ro'yxat ─────────────────────────────────────────────────────────
  async list(q: LeadQueryDto) {
    const where: WhereOptions[] = [];
    if (q.source) where.push({ source: q.source });
    if (q.status) where.push({ status: q.status });
    if (q.manager_id) where.push({ manager_id: q.manager_id });
    const search = (q.q || '').trim();
    if (search) {
      const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      where.push({
        [Op.or]: [
          { name: { [Op.iLike]: like } },
          { username: { [Op.iLike]: like } },
          { phone: { [Op.iLike]: like } },
          { email: { [Op.iLike]: like } },
          { last_message_text: { [Op.iLike]: like } },
          { chat_title: { [Op.iLike]: like } },
        ],
      });
    }

    const limit = q.limit || 50;
    const page = q.page || 1;
    const { rows, count } = await this.leads.findAndCountAll({
      where: where.length ? { [Op.and]: where } : undefined,
      order: [
        [fn('COALESCE', col('last_message_at'), col('createdAt')), 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
    });

    return { items: rows, total: count, page, limit, counts: await this.counts() };
  }

  // Filtr yorliqlari uchun: holat va manba bo'yicha sonlar (filtrsiz)
  private async counts() {
    const group = async (field: 'status' | 'source') => {
      const rows = (await this.leads.findAll({
        attributes: [field, [fn('COUNT', col('id')), 'n']],
        group: [field],
        raw: true,
      })) as unknown as Array<Record<string, any>>;
      return Object.fromEntries(rows.map((r) => [r[field], Number(r.n)]));
    };
    const [status, source] = await Promise.all([group('status'), group('source')]);
    return { status, source };
  }

  async one(id: number) {
    const lead = await this.leads.findByPk(id);
    if (!lead) throw new NotFoundException('Lid topilmadi');
    const messages = await this.messages.findAll({
      where: { lead_id: id },
      order: [['sent_at', 'ASC'], ['id', 'ASC']],
      limit: 300,
    });
    return { ...lead.get({ plain: true }), messages };
  }

  // ─── Qo'lda qo'shish / tahrirlash / o'chirish ─────────────────────────
  async create(dto: CreateLeadDto) {
    if (!dto.name?.trim() && !dto.phone?.trim() && !dto.email?.trim()) {
      throw new BadRequestException('Ism, telefon yoki email dan kamida bittasi kerak');
    }
    return this.leads.create({
      source: dto.source || 'manual',
      status: 'new',
      name: dto.name?.trim() || null,
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      note: dto.note?.trim() || null,
      last_message_at: new Date(),
      messages_count: 0,
    });
  }

  async update(id: number, dto: UpdateLeadDto) {
    const lead = await this.leads.findByPk(id);
    if (!lead) throw new NotFoundException('Lid topilmadi');

    const patch: Partial<Lead> = {};
    if (dto.status) patch.status = dto.status;
    if (dto.manager_id !== undefined) {
      if (dto.manager_id !== null) {
        const u = await this.users.findByPk(dto.manager_id, { attributes: ['id'] });
        if (!u) throw new BadRequestException('Mas\'ul xodim topilmadi');
      }
      patch.manager_id = dto.manager_id;
    }
    for (const f of ['name', 'phone', 'email', 'note'] as const) {
      if (dto[f] !== undefined) patch[f] = dto[f]?.trim() || null;
    }
    await lead.update(patch);
    return lead;
  }

  async remove(id: number) {
    const lead = await this.leads.findByPk(id);
    if (!lead) throw new NotFoundException('Lid topilmadi');
    await this.messages.destroy({ where: { lead_id: id } });
    await lead.destroy();
    return { ok: true };
  }
}
