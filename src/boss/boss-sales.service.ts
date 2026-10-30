import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Kp } from 'src/kp/models/kp.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { Competitor } from 'src/competitors/models/competitor.model';
import { CompetitorEncounter } from 'src/competitors/models/competitor-encounter.model';
import { nameSkeleton } from 'src/common/name-match';

export const SALES_PERIODS = ['month', 'quarter', 'year'] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];

// "Uzoq vaqt olmagan" mijoz: kamida shuncha shartnoma va oxirgisidan shuncha kun o'tgan
const DORMANT_MIN_CONTRACTS = 2;
const DORMANT_DAYS = 180;

type KpRow = { kp_date: string | null; kp_sum: number | null; client_name: string; manager_name: string | null; kp_status: string };
type DgRow = { dogovor_date: string | null; dogovor_sum: number | null; client_name: string; manager_name: string | null; dogovor_status: string };

// Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD)
function todayTashkent(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

function periodRange(period: SalesPeriod, today = todayTashkent()) {
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (period === 'month') return { from: `${y}-${pad(m)}-01`, to: today };
  if (period === 'quarter') {
    const qm = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: `${y}-${pad(qm)}-01`, to: today };
  }
  return { from: `${y}-01-01`, to: today };
}

const num = (v: unknown) => Number(v) || 0;
const inRange = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const managerKey = (name: string | null) => (name || '').trim().replace(/\s+/g, ' ') || '—';

// Direktor uchun savdo ko'rinishi: KP va shartnomalar (1C importi), menejerlar konversiyasi,
// 12 oylik trend, eng katta va "uxlab qolgan" mijozlar, raqiblarga yutqazishlar.
// KP va shartnoma bir-biriga FK bilan bog'lanmagan — mijoz nomi skeleti bo'yicha solishtiriladi.
@Injectable()
export class BossSalesService {
  constructor(
    @InjectModel(Kp) private readonly kpRepo: typeof Kp,
    @InjectModel(Dogovor) private readonly dogovorRepo: typeof Dogovor,
    @InjectModel(Competitor) private readonly competitorRepo: typeof Competitor,
    @InjectModel(CompetitorEncounter) private readonly encounterRepo: typeof CompetitorEncounter,
  ) {}

  async overview(period: SalesPeriod = 'year') {
    const today = todayTashkent();
    const { from, to } = periodRange(period, today);
    const [kps, dogovors] = (await Promise.all([
      this.kpRepo.findAll({
        attributes: ['kp_date', 'kp_sum', 'client_name', 'manager_name', 'kp_status'],
        raw: true,
      }),
      this.dogovorRepo.findAll({
        attributes: ['dogovor_date', 'dogovor_sum', 'client_name', 'manager_name', 'dogovor_status'],
        raw: true,
      }),
    ])) as unknown as [KpRow[], DgRow[]];

    const periodKps = kps.filter((k) => inRange(k.kp_date, from, to));
    const periodDgs = dogovors.filter((d) => inRange(d.dogovor_date, from, to));

    return {
      period,
      from,
      to,
      totals: this.totals(periodKps, periodDgs),
      managers: this.managers(periodKps, periodDgs, dogovors),
      trend: this.trend(kps, dogovors, today),
      top_clients: this.topClients(periodDgs),
      dormant_clients: this.dormantClients(dogovors, today),
      competitors: await this.competitors(from, to),
    };
  }

  private totals(kps: KpRow[], dgs: DgRow[]) {
    const byStatus: Record<string, { count: number; sum: number }> = {};
    for (const d of dgs) {
      const s = (byStatus[d.dogovor_status] ??= { count: 0, sum: 0 });
      s.count++;
      s.sum += num(d.dogovor_sum);
    }
    return {
      kp_count: kps.length,
      kp_sum: kps.reduce((s, k) => s + num(k.kp_sum), 0),
      dogovor_count: dgs.length,
      dogovor_sum: dgs.reduce((s, d) => s + num(d.dogovor_sum), 0),
      dogovor_avg: dgs.length ? dgs.reduce((s, d) => s + num(d.dogovor_sum), 0) / dgs.length : 0,
      dogovor_by_status: byStatus,
      clients: new Set(dgs.map((d) => nameSkeleton(d.client_name)).filter(Boolean)).size,
    };
  }

  // Konversiya: menejer KP bergan mijozlarning qanchasi KP sanasidan keyin (istalgan vaqt)
  // shartnoma tuzgan — mijoz nomi skeleti bo'yicha
  private managers(kps: KpRow[], periodDgs: DgRow[], allDgs: DgRow[]) {
    const firstContractAfter = new Map<string, string[]>();
    for (const d of allDgs) {
      const key = nameSkeleton(d.client_name);
      if (!key || !d.dogovor_date) continue;
      const list = firstContractAfter.get(key) ?? [];
      list.push(d.dogovor_date);
      firstContractAfter.set(key, list);
    }

    type Acc = { name: string; kp_count: number; kp_sum: number; kp_clients: Set<string>; won: Set<string>; dogovor_count: number; dogovor_sum: number };
    const map = new Map<string, Acc>();
    const acc = (name: string | null) => {
      const key = managerKey(name);
      let a = map.get(key);
      if (!a) {
        a = { name: key, kp_count: 0, kp_sum: 0, kp_clients: new Set(), won: new Set(), dogovor_count: 0, dogovor_sum: 0 };
        map.set(key, a);
      }
      return a;
    };

    for (const k of kps) {
      const a = acc(k.manager_name);
      a.kp_count++;
      a.kp_sum += num(k.kp_sum);
      const client = nameSkeleton(k.client_name);
      if (!client) continue;
      a.kp_clients.add(client);
      if ((firstContractAfter.get(client) ?? []).some((date) => k.kp_date && date >= k.kp_date)) a.won.add(client);
    }
    for (const d of periodDgs) {
      const a = acc(d.manager_name);
      a.dogovor_count++;
      a.dogovor_sum += num(d.dogovor_sum);
    }

    return [...map.values()]
      .map((a) => ({
        name: a.name,
        kp_count: a.kp_count,
        kp_sum: a.kp_sum,
        dogovor_count: a.dogovor_count,
        dogovor_sum: a.dogovor_sum,
        kp_clients: a.kp_clients.size,
        converted_clients: a.won.size,
        conversion_pct: a.kp_clients.size ? Math.round((a.won.size / a.kp_clients.size) * 100) : null,
      }))
      .sort((x, y) => y.dogovor_sum - x.dogovor_sum || y.kp_sum - x.kp_sum);
  }

  // Oxirgi 12 oy (joriy oy bilan): har oy KP va shartnoma summasi
  private trend(kps: KpRow[], dgs: DgRow[], today: string) {
    const [y, m] = today.split('-').map(Number);
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const rows = new Map(months.map((month) => [month, { month, kp_count: 0, kp_sum: 0, dogovor_count: 0, dogovor_sum: 0 }]));
    for (const k of kps) {
      const r = k.kp_date && rows.get(k.kp_date.slice(0, 7));
      if (r) {
        r.kp_count++;
        r.kp_sum += num(k.kp_sum);
      }
    }
    for (const d of dgs) {
      const r = d.dogovor_date && rows.get(d.dogovor_date.slice(0, 7));
      if (r) {
        r.dogovor_count++;
        r.dogovor_sum += num(d.dogovor_sum);
      }
    }
    return [...rows.values()];
  }

  private topClients(dgs: DgRow[], limit = 10) {
    const map = new Map<string, { name: string; count: number; sum: number }>();
    for (const d of dgs) {
      const key = nameSkeleton(d.client_name);
      if (!key) continue;
      const c = map.get(key) ?? { name: d.client_name.trim(), count: 0, sum: 0 };
      c.count++;
      c.sum += num(d.dogovor_sum);
      map.set(key, c);
    }
    return [...map.values()].sort((a, b) => b.sum - a.sum).slice(0, limit);
  }

  // Ilgari muntazam olgan (≥2 shartnoma), lekin oxirgi DORMANT_DAYS kundan beri shartnoma yo'q
  private dormantClients(dgs: DgRow[], today: string, limit = 15) {
    const cutoff = new Date(Date.parse(today) - DORMANT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const map = new Map<string, { name: string; count: number; sum: number; last_date: string; manager: string }>();
    for (const d of dgs) {
      const key = nameSkeleton(d.client_name);
      if (!key || !d.dogovor_date) continue;
      const c = map.get(key) ?? { name: d.client_name.trim(), count: 0, sum: 0, last_date: '', manager: '' };
      c.count++;
      c.sum += num(d.dogovor_sum);
      if (d.dogovor_date > c.last_date) {
        c.last_date = d.dogovor_date;
        c.manager = managerKey(d.manager_name);
      }
      map.set(key, c);
    }
    return [...map.values()]
      .filter((c) => c.count >= DORMANT_MIN_CONTRACTS && c.last_date < cutoff)
      .sort((a, b) => b.sum - a.sum)
      .slice(0, limit)
      .map((c) => ({
        ...c,
        days_since: Math.round((Date.parse(today) - Date.parse(c.last_date)) / 86_400_000),
      }));
  }

  private async competitors(from: string, to: string) {
    const [list, encounters] = await Promise.all([
      this.competitorRepo.findAll({ attributes: ['id', 'name'], raw: true }),
      this.encounterRepo.findAll({
        attributes: ['competitor_id', 'outcome', 'reason', 'encounter_date'],
        raw: true,
      }),
    ]);
    const names = new Map((list as any[]).map((c) => [c.id, c.name]));
    const period = (encounters as any[]).filter((e) => inRange(e.encounter_date, from, to));
    const lostBy = new Map<number, number>();
    const reasons: Record<string, number> = {};
    let won = 0;
    let lost = 0;
    for (const e of period) {
      if (e.outcome === 'won') won++;
      if (e.outcome !== 'lost') continue;
      lost++;
      lostBy.set(e.competitor_id, (lostBy.get(e.competitor_id) ?? 0) + 1);
      reasons[e.reason || 'other'] = (reasons[e.reason || 'other'] ?? 0) + 1;
    }
    return {
      total: period.length,
      won,
      lost,
      top_lost_to: [...lostBy.entries()]
        .map(([id, count]) => ({ name: names.get(id) ?? '—', count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      lost_reasons: reasons,
    };
  }
}
