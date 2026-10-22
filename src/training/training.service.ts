import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomBytes } from 'crypto';
import { User } from 'src/users/models/user.model';
import { TrainingRecord } from './models/training-record.model';
import { SKLAD_QUIZ } from './quizzes/sklad.quiz';
import { Lang, QuizDefinition } from './training.types';

const QUIZZES: Record<string, QuizDefinition> = { sklad: SKLAD_QUIZ };
// Boshlangan urinish shu vaqt ichida topshirilishi kerak
const ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000;

// Xato: o'zbekcha zaxira matn + kod (frontend tilga qarab tarjima qiladi)
const trErr = (Ex: new (b: Record<string, unknown>) => Error, code: string, message: string) =>
  new Ex({ message, code });

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class TrainingService {
  constructor(
    @InjectModel(TrainingRecord) private readonly repo: typeof TrainingRecord,
    @InjectModel(User) private readonly userRepo: typeof User,
  ) {}

  private quiz(module: string): QuizDefinition {
    const q = QUIZZES[module];
    if (!q) throw trErr(NotFoundException, 'TR_UNKNOWN_MODULE', "Bunday bo'lim uchun test yo'q");
    return q;
  }

  async hasPassed(userId: number, module: string): Promise<boolean> {
    return !!(await this.repo.findOne({ where: { user_id: userId, module, kind: 'quiz', passed: true } }));
  }

  async status(userId: number, module: string) {
    const q = this.quiz(module);
    const rows = await this.repo.findAll({
      where: { user_id: userId, module },
      order: [['createdAt', 'ASC']],
    });
    const tutorial = rows.filter((r) => r.kind === 'tutorial');
    const attempts = rows.filter((r) => r.kind === 'quiz' && r.passed !== null);
    const passed = attempts.find((r) => r.passed);
    const last = attempts.at(-1);
    return {
      module,
      pass_percent: q.passPercent,
      questions_per_attempt: q.questionsPerAttempt,
      tutorial_done_at: tutorial[0]?.get('createdAt') ?? null,
      attempts: attempts.length,
      best_score: attempts.length ? Math.max(...attempts.map((a) => a.score_pct ?? 0)) : null,
      passed: !!passed,
      passed_at: passed?.get('createdAt') ?? null,
      last: last ? { score_pct: last.score_pct, passed: last.passed, at: last.get('createdAt') } : null,
    };
  }

  // Yo'riqnoma OXIRIGACHA ko'rilganda (yopib qo'yilganda emas) yoziladi
  async tutorialDone(userId: number, module: string, body: { steps?: number; duration_sec?: number }) {
    this.quiz(module);
    await this.repo.create({
      user_id: userId,
      module,
      kind: 'tutorial',
      duration_sec: Math.max(0, Math.round(Number(body.duration_sec) || 0)),
      details: { steps: Number(body.steps) || null },
    });
    return this.status(userId, module);
  }

  // Test boshlanadi: tasodifiy savollar, aralashtirilgan variantlar. Variantlarga har urinishda
  // yangi tasodifiy kalit beriladi — to'g'ri javob brauzerdan bilinmaydi; moslik faqat bazada.
  async startQuiz(userId: number, module: string, lang: Lang) {
    const q = this.quiz(module);
    const tutorial = await this.repo.findOne({ where: { user_id: userId, module, kind: 'tutorial' } });
    if (!tutorial) {
      throw trErr(ForbiddenException, 'TR_TUTORIAL_REQUIRED', "Avval yo'riqnomani oxirigacha ko'ring");
    }
    const picked = shuffle(q.questions).slice(0, q.questionsPerAttempt);
    const keyMap: Record<string, Record<string, string>> = {};
    const questions = picked.map((qq) => {
      keyMap[qq.id] = {};
      const options = shuffle(qq.options).map((o) => {
        const key = randomBytes(4).toString('hex');
        keyMap[qq.id][key] = o.id;
        return { key, text: o[lang] };
      });
      return { id: qq.id, text: qq[lang], options };
    });
    const attempt = await this.repo.create({
      user_id: userId,
      module,
      kind: 'quiz',
      quiz_version: q.version,
      total: picked.length,
      passed: null,
      details: { lang, questions: picked.map((p) => p.id), keyMap },
    });
    return {
      attempt_id: attempt.id,
      pass_percent: q.passPercent,
      questions,
    };
  }

  async submitQuiz(userId: number, module: string, attemptId: number, answers: Record<string, string>) {
    const q = this.quiz(module);
    const attempt = await this.repo.findByPk(attemptId);
    if (!attempt || attempt.user_id !== userId || attempt.module !== module || attempt.kind !== 'quiz') {
      throw trErr(NotFoundException, 'TR_ATTEMPT_NOT_FOUND', 'Urinish topilmadi');
    }
    if (attempt.passed !== null) {
      throw trErr(BadRequestException, 'TR_ATTEMPT_DONE', 'Bu urinish allaqachon topshirilgan');
    }
    const started = new Date(attempt.get('createdAt') as Date).getTime();
    if (Date.now() - started > ATTEMPT_TTL_MS) {
      throw trErr(BadRequestException, 'TR_ATTEMPT_EXPIRED', "Vaqt tugadi — testni qaytadan boshlang");
    }
    const { questions, keyMap, lang } = attempt.details as {
      questions: string[];
      keyMap: Record<string, Record<string, string>>;
      lang: Lang;
    };
    const byId = new Map(q.questions.map((qq) => [qq.id, qq]));
    const graded = questions.map((qid) => {
      const key = answers?.[qid];
      const chosen = key ? keyMap[qid]?.[key] ?? null : null;
      return { q: qid, chosen, ok: chosen === byId.get(qid)?.correct };
    });
    const correct = graded.filter((g) => g.ok).length;
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= q.passPercent;
    await attempt.update({
      correct,
      score_pct: score,
      passed,
      duration_sec: Math.round((Date.now() - started) / 1000),
      details: { lang, questions, answers: graded },
    });
    // To'g'ri javoblar ko'rsatilmaydi — faqat qaysi mavzularni qayta o'qish kerakligi
    const wrongTopics = [...new Set(graded.filter((g) => !g.ok).map((g) => byId.get(g.q)?.topic).filter(Boolean))];
    return { correct, total: questions.length, score_pct: score, pass_percent: q.passPercent, passed, wrong_topics: wrongTopics };
  }

  // ─── Admin hisoboti ───
  async report(module: string) {
    this.quiz(module);
    const users = await this.userRepo.findAll({
      attributes: ['id', 'firstname', 'lastname', 'username', 'is_admin', 'is_blocked', 'permissions'],
      order: [['firstname', 'ASC']],
    });
    const rows = await this.repo.findAll({ where: { module }, order: [['createdAt', 'ASC']] });
    const byUser = new Map<number, TrainingRecord[]>();
    for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), r]);
    return users
      .filter((u) => !u.is_blocked && (u.permissions?.[module] !== false || byUser.has(u.id)))
      .map((u) => {
        const rs = byUser.get(u.id) || [];
        const attempts = rs.filter((r) => r.kind === 'quiz' && r.passed !== null);
        const passed = attempts.find((r) => r.passed);
        return {
          user_id: u.id,
          name: [u.firstname, u.lastname].filter(Boolean).join(' ') || u.username,
          is_admin: u.is_admin,
          tutorial_done_at: rs.find((r) => r.kind === 'tutorial')?.get('createdAt') ?? null,
          tutorial_count: rs.filter((r) => r.kind === 'tutorial').length,
          attempts: attempts.map((a) => ({
            id: a.id,
            at: a.get('createdAt'),
            score_pct: a.score_pct,
            correct: a.correct,
            total: a.total,
            passed: a.passed,
            duration_sec: a.duration_sec,
          })),
          best_score: attempts.length ? Math.max(...attempts.map((a) => a.score_pct ?? 0)) : null,
          passed_at: passed?.get('createdAt') ?? null,
        };
      });
  }

  // Bitta urinishning to'liq tafsiloti (admin uchun isbot): savol, tanlangan va to'g'ri javob
  async attemptDetail(module: string, attemptId: number, lang: Lang) {
    const q = this.quiz(module);
    const a = await this.repo.findByPk(attemptId, {
      include: [{ model: User, as: 'user', attributes: ['id', 'firstname', 'lastname', 'username'] }],
    });
    if (!a || a.module !== module || a.kind !== 'quiz') {
      throw trErr(NotFoundException, 'TR_ATTEMPT_NOT_FOUND', 'Urinish topilmadi');
    }
    const byId = new Map(q.questions.map((qq) => [qq.id, qq]));
    const answers = (a.details?.answers || []) as Array<{ q: string; chosen: string | null; ok: boolean }>;
    const optText = (qid: string, oid: string | null) =>
      oid ? byId.get(qid)?.options.find((o) => o.id === oid)?.[lang] ?? oid : null;
    return {
      id: a.id,
      user: a.user ? [a.user.firstname, a.user.lastname].filter(Boolean).join(' ') : null,
      at: a.get('createdAt'),
      score_pct: a.score_pct,
      passed: a.passed,
      duration_sec: a.duration_sec,
      answered_lang: a.details?.lang,
      items: answers.map((x) => ({
        question: byId.get(x.q)?.[lang] ?? x.q,
        chosen: optText(x.q, x.chosen),
        correct: optText(x.q, byId.get(x.q)?.correct ?? null),
        ok: x.ok,
      })),
    };
  }
}
