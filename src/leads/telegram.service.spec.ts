import { extractPhone } from './leads.service';
import { TelegramLeadsService } from './telegram.service';

const make = () => {
  const ingest = jest.fn().mockResolvedValue({ created: true, duplicate: false });
  const svc = new TelegramLeadsService({ ingest } as any);
  return { svc, ingest };
};
const base = (over: any = {}) => ({
  update_id: 1,
  message: {
    message_id: 10,
    date: 1_700_000_000,
    chat: { id: -1001234567, type: 'supergroup', title: 'Klimat guruh' },
    from: { id: 555, first_name: 'Ali', last_name: 'Valiyev', username: 'ali_v' },
    text: 'Salom, ventilyator narxi qancha? 90 123 45 67',
    ...over,
  },
});

describe('extractPhone', () => {
  it.each([
    ['+998 90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['qo\'ng\'iroq qiling 90-123-45-67 rahmat', '+998901234567'],
    ['(90) 123 45 67', '+998901234567'],
  ])('%s', (text, expected) => expect(extractPhone(text)).toBe(expected));

  it('raqam yo\'q matnda null', () => {
    expect(extractPhone('1200 m3/soat, 3 dona')).toBeNull();
    expect(extractPhone('')).toBeNull();
  });
});

describe('TelegramLeadsService.handleUpdate', () => {
  beforeEach(() => {
    delete process.env.TG_LEADS_STAFF_IDS;
    delete process.env.TG_LEADS_CHAT_IDS;
  });

  it('guruh xabari -> telegram_group lid', async () => {
    const { svc, ingest } = make();
    expect(await svc.handleUpdate(base())).toEqual({ status: 'created' });
    const arg = ingest.mock.calls[0][0];
    expect(arg).toMatchObject({
      source: 'telegram_group',
      external_key: 'tg:555',
      name: 'Ali Valiyev',
      username: 'ali_v',
      chat_id: '-1001234567',
      tg_message_id: 10,
      link: 'https://t.me/c/1234567/10',
    });
  });

  it('kanal postiga izoh -> telegram_comment, post matni kontekstda', async () => {
    const { svc, ingest } = make();
    await svc.handleUpdate(
      base({ reply_to_message: { message_id: 9, is_automatic_forward: true, text: 'Yangi VTS ventilyator keldi' } }),
    );
    expect(ingest.mock.calls[0][0]).toMatchObject({
      source: 'telegram_comment',
      context: 'Yangi VTS ventilyator keldi',
    });
  });

  it('avtomatik nusxalangan post, bot, kanal nomidan va xizmat xabari — e\'tiborsiz', async () => {
    const { svc, ingest } = make();
    expect((await svc.handleUpdate(base({ is_automatic_forward: true }))).status).toBe('ignored');
    expect((await svc.handleUpdate(base({ from: { id: 1, is_bot: true } }))).status).toBe('ignored');
    expect((await svc.handleUpdate(base({ sender_chat: { id: -100, type: 'channel' } }))).status).toBe('ignored');
    expect((await svc.handleUpdate(base({ text: undefined, new_chat_members: [{ id: 3 }] }))).status).toBe('ignored');
    expect(ingest).not.toHaveBeenCalled();
  });

  it('xodim Telegram ID si lid bo\'lmaydi', async () => {
    process.env.TG_LEADS_STAFF_IDS = '12, 555';
    const { svc, ingest } = make();
    expect((await svc.handleUpdate(base())).status).toBe('staff');
    expect(ingest).not.toHaveBeenCalled();
  });

  it('TG_LEADS_CHAT_IDS bo\'lsa boshqa guruhlar o\'tkazilmaydi', async () => {
    process.env.TG_LEADS_CHAT_IDS = '-100999';
    const { svc, ingest } = make();
    expect((await svc.handleUpdate(base())).status).toBe('ignored');
    expect(ingest).not.toHaveBeenCalled();
  });

  it('shaxsiy xabar -> telegram_private, /start e\'tiborsiz', async () => {
    const { svc, ingest } = make();
    const priv = { chat: { id: 555, type: 'private' } };
    expect((await svc.handleUpdate(base({ ...priv, text: '/start' }))).status).toBe('ignored');
    await svc.handleUpdate(base(priv));
    expect(ingest.mock.calls[0][0]).toMatchObject({ source: 'telegram_private', chat_title: 'Shaxsiy xabar', link: null });
  });

  it('ingest xato bersa webhook 200 bilan "error" qaytaradi', async () => {
    const svc = new TelegramLeadsService({ ingest: jest.fn().mockRejectedValue(new Error('db')) } as any);
    expect(await svc.handleUpdate(base())).toEqual({ status: 'error' });
  });
});

describe('assertSecret', () => {
  it('to\'g\'ri/noto\'g\'ri/yo\'q kalit', () => {
    const { svc } = make();
    delete process.env.TG_LEADS_WEBHOOK_SECRET;
    expect(() => svc.assertSecret('x')).toThrow('sozlanmagan');
    process.env.TG_LEADS_WEBHOOK_SECRET = 'abc_123';
    expect(() => svc.assertSecret('abc_123')).not.toThrow();
    expect(() => svc.assertSecret('abc_124')).toThrow();
    expect(() => svc.assertSecret(undefined)).toThrow();
  });
});
