import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { LeadsService } from './leads.service';

// Env:
//  TG_LEADS_BOT_TOKEN       — @BotFather bergan token
//  TG_LEADS_WEBHOOK_SECRET  — webhook so'rovini tekshirish uchun maxfiy so'z (A-Z a-z 0-9 _ -)
//  TG_LEADS_STAFF_IDS       — xodimlarning Telegram ID'lari (vergul bilan): ular lid bo'lmaydi
//  TG_LEADS_CHAT_IDS        — ixtiyoriy: faqat shu chat ID'lari (vergul bilan) qabul qilinadi
const csv = (v?: string) =>
  new Set(
    String(v || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class TelegramLeadsService {
  private readonly logger = new Logger('LeadsTelegram');
  // Kanal postlari avtomatik nusxalanadigan (izohlar guruhi) chatlar — izohni guruh xabaridan ajratish uchun
  private readonly discussionChats = new Set<string>();

  constructor(private readonly leads: LeadsService) {}

  get configured() {
    return !!(process.env.TG_LEADS_BOT_TOKEN && process.env.TG_LEADS_WEBHOOK_SECRET);
  }

  assertSecret(header: string | undefined) {
    const secret = process.env.TG_LEADS_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Telegram lid boti sozlanmagan');
    if (!header || !safeEqual(header, secret)) throw new UnauthorizedException('Noto\'g\'ri maxfiy kalit');
  }

  // Telegram update'ni lidga aylantiradi. Xatolar yutiladi — Telegram qayta-qayta yubormasligi uchun
  async handleUpdate(update: any): Promise<{ status: string }> {
    try {
      return await this.process(update);
    } catch (e: any) {
      this.logger.error(`update ${update?.update_id}: ${e?.message || e}`);
      return { status: 'error' };
    }
  }

  private async process(update: any) {
    const msg = update?.message;
    if (!msg || !msg.chat) return { status: 'ignored' };

    const chatId = String(msg.chat.id);
    const allowed = csv(process.env.TG_LEADS_CHAT_IDS);
    if (allowed.size && msg.chat.type !== 'private' && !allowed.has(chatId)) return { status: 'ignored' };

    // Kanal posti guruhga avtomatik nusxalanishi — bu lid emas, lekin shu chat "izohlar guruhi" ekanini bildiradi
    if (msg.is_automatic_forward) {
      this.discussionChats.add(chatId);
      return { status: 'ignored' };
    }

    const from = msg.from;
    // Kanal nomidan yozilgan, bot yoki yashirin (anonim admin) xabarlar lid emas
    if (!from || from.is_bot || msg.sender_chat) return { status: 'ignored' };
    if (csv(process.env.TG_LEADS_STAFF_IDS).has(String(from.id))) return { status: 'staff' };

    const text: string = msg.text || msg.caption || '';
    // Rasm/fayl/stiker matnsiz kelsa ham yozib qo'yamiz (qiziqish bildirgani ma'lum bo'lsin)
    const body = text.trim() || (msg.photo ? '[rasm]' : msg.document ? '[fayl]' : msg.voice ? '[ovozli xabar]' : msg.video ? '[video]' : '');
    if (!body) return { status: 'ignored' }; // a'zo qo'shildi, sarlavha o'zgardi kabi xizmat xabarlari
    if (body.startsWith('/') && msg.chat.type === 'private') {
      // /start kabi buyruq lid emas; lekin matnli savol bo'lsa o'tadi
      if (/^\/(start|help)\b/i.test(body)) return { status: 'ignored' };
    }

    const reply = msg.reply_to_message;
    const isComment =
      msg.chat.type !== 'private' &&
      (reply?.is_automatic_forward ||
        reply?.sender_chat?.type === 'channel' ||
        (this.discussionChats.has(chatId) && !!msg.message_thread_id));

    const source = msg.chat.type === 'private' ? 'telegram_private' : isComment ? 'telegram_comment' : 'telegram_group';
    const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();

    const res = await this.leads.ingest({
      source,
      external_key: `tg:${from.id}`,
      name: fullName || null,
      username: from.username || null,
      chat_id: chatId,
      chat_title: msg.chat.type === 'private' ? 'Shaxsiy xabar' : msg.chat.title || null,
      tg_message_id: msg.message_id,
      text: body,
      sent_at: new Date((msg.date || Math.floor(Date.now() / 1000)) * 1000),
      context: isComment ? reply?.text || reply?.caption || reply?.sender_chat?.title || null : null,
      link: this.messageLink(msg),
    });
    return { status: res.duplicate ? 'duplicate' : res.created ? 'created' : 'appended' };
  }

  // Ommaviy guruh (username bor) uchun to'g'ridan-to'g'ri havola; yopiq supergroup uchun t.me/c/...
  private messageLink(msg: any): string | null {
    const chat = msg.chat;
    if (chat.type === 'private') return null;
    if (chat.username) return `https://t.me/${chat.username}/${msg.message_id}`;
    const id = String(chat.id);
    if (chat.type === 'supergroup' && id.startsWith('-100')) return `https://t.me/c/${id.slice(4)}/${msg.message_id}`;
    return null;
  }

  // ─── Admin uchun: webhook'ni ulash va holatni ko'rish ───────────────────
  private async api(method: string, body?: any) {
    const token = process.env.TG_LEADS_BOT_TOKEN;
    if (!token) throw new ServiceUnavailableException('TG_LEADS_BOT_TOKEN o\'rnatilmagan');
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!json.ok) throw new ServiceUnavailableException(`Telegram: ${json.description || res.status}`);
    return json.result;
  }

  async status() {
    const base = {
      token_set: !!process.env.TG_LEADS_BOT_TOKEN,
      secret_set: !!process.env.TG_LEADS_WEBHOOK_SECRET,
      staff_ids: csv(process.env.TG_LEADS_STAFF_IDS).size,
    };
    if (!base.token_set) return { ...base, bot: null, webhook: null };
    const [bot, hook] = await Promise.all([this.api('getMe'), this.api('getWebhookInfo')]);
    return {
      ...base,
      bot: { username: bot.username, name: bot.first_name, can_read_all_group_messages: bot.can_read_all_group_messages },
      webhook: {
        url: hook.url || null,
        pending: hook.pending_update_count,
        last_error: hook.last_error_message || null,
        last_error_at: hook.last_error_date ? new Date(hook.last_error_date * 1000).toISOString() : null,
      },
    };
  }

  async setWebhook(baseUrl: string) {
    const secret = process.env.TG_LEADS_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('TG_LEADS_WEBHOOK_SECRET o\'rnatilmagan');
    const url = `${baseUrl.replace(/\/+$/, '')}/api/leads/telegram/webhook`;
    await this.api('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });
    return { ok: true, url };
  }
}
