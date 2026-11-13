import { bestMatchIndex, contractsWith, ContractCandidate, invoicedRows, overItems, sortInvoices } from './invoiced';

const KCKP = 'Кондиционер КЦКП-6,3 L=6180м3/ч, P=600Па';
const card = [
  { name: KCKP, unit: 'шт', qty: 1 },
  { name: 'Вентилятор RH40C', unit: 'шт', qty: 3 },
];
const inv = (id: number, number: string, date: string | null, items: Array<{ name: string; qty: number }>, kind = 'invoice') => ({
  id,
  kind,
  invoice_number: number,
  invoice_date: date,
  items,
});

describe('invoiced', () => {
  it("fakturalardagi soni shartnomadan ko'p bo'lsa — qaysi fakturada nechtaligi bilan belgilaydi", () => {
    const files = [inv(2, 'СФ-15', '2026-11-05', [{ name: KCKP, qty: 1 }]), inv(1, 'СФ-12', '2026-11-01', [{ name: KCKP, qty: 1 }])];
    const res = overItems(card, files);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ index: 0, name: KCKP, unit: 'шт', qty: 1, invoiced: 2, over: 1 });
    // Fakturalar sana bo'yicha (karta sahifasidagi tartib)
    expect(res[0].invoices.map((i) => [i.invoice_number, i.qty])).toEqual([
      ['СФ-12', 1],
      ['СФ-15', 1],
    ]);
  });

  it("ortiqcha bo'lmasa — bo'sh", () => {
    expect(overItems(card, [inv(1, '1', null, [{ name: 'Вентилятор RH40C', qty: 3 }])])).toEqual([]);
  });

  it('ishonchnoma va shartnoma fayllari hisobga olinmaydi', () => {
    expect(overItems(card, [inv(1, '1', null, [{ name: 'Вентилятор RH40C', qty: 9 }], 'poa')])).toEqual([]);
    expect(overItems(card, [inv(1, '1', null, [{ name: 'Вентилятор RH40C', qty: 9 }], 'contract')])).toEqual([]);
  });

  it("qo'lda kiritilgan otgruzka soni solishtirishga ta'sir qilmaydi (faktura > shartnoma)", () => {
    const files = [inv(1, '1', null, [{ name: 'Вентилятор RH40C', qty: 5 }])];
    const res = overItems([{ ...card[1], shipped: 3 }], files);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ qty: 3, invoiced: 5, over: 2 });
  });

  it("bir fakturada bir tovar bir necha qatorda — bitta yozuv bo'lib qo'shiladi", () => {
    const rows = invoicedRows(card, [inv(1, '7', null, [
      { name: 'Вентилятор RH40C', qty: 2 },
      { name: 'Вентилятор RH40C (резерв)', qty: 2 },
    ])]);
    expect(rows[1].auto).toBe(4);
    expect(rows[1].from).toHaveLength(1);
    expect(rows[1].from[0]).toMatchObject({ invoice_number: '7', qty: 4 });
  });

  it("sanasiz fakturalar oxirida, keyin id bo'yicha", () => {
    const sorted = sortInvoices([inv(3, 'c', null, []), inv(2, 'b', '2026-02-01', []), inv(1, 'a', '2026-03-01', []), inv(0, 'z', null, [])]);
    expect(sorted.map((f) => f.invoice_number)).toEqual(['b', 'a', 'z', 'c']);
  });

  it("model kodi boshqa qator tavsifida uchrasa — eng yaqin qator olinadi (yig'ilmaydi)", () => {
    const long = 'Кондиционер КЦКП-6,3 … д) секция вентилятора: Вентилятор RH40C; 4,0кВт';
    const items = [
      { name: long, unit: 'шт', qty: 1 },
      { name: 'Вентилятор RH40C', unit: 'шт', qty: 3 },
    ];
    const pool: ContractCandidate[] = [
      { order_id: 1, dogovor_id: 1, dogovor_number: '1', dogovor_date: null, client_name: 'A', client_inn: null, items },
      { order_id: 2, dogovor_id: 2, dogovor_number: '2', dogovor_date: null, client_name: 'A', client_inn: null, items },
    ];
    const res = contractsWith(long, pool, 1, 0);
    expect(res.map((c) => [c.dogovor_number, c.qty, c.names])).toEqual([
      ['1', 1, [long]],
      ['2', 1, [long]],
    ]);
  });

  it('jadval qatori eng mos mahsulotga bog\'lanadi (uzun tavsif ichidagi kod chalg\'itmaydi)', () => {
    const items = [{ name: 'Кондиционер КЦКП-6,3 … секция вентилятора: Вентилятор RH40C; 4,0кВт', qty: 1 }, { name: 'Вентилятор RH40C', qty: 3 }];
    expect(bestMatchIndex('Вентилятор RH40C', items)).toBe(1);
    expect(bestMatchIndex('КЦКП-6,3 кондиционер приточный', items)).toBe(0);
    expect(bestMatchIndex('Клапан АВК', items)).toBe(-1);
  });

  it("tovar qaysi shartnomalarda va nechta yozilgani — joriy shartnoma birinchi", () => {
    const pool: ContractCandidate[] = [
      { order_id: 10, dogovor_id: 100, dogovor_number: '30123', dogovor_date: '2026-10-01', client_name: 'Alfa', client_inn: null, items: card },
      {
        order_id: 11,
        dogovor_id: 101,
        dogovor_number: '30150',
        dogovor_date: '2026-11-02',
        client_name: 'Alfa',
        client_inn: null,
        items: [
          { name: KCKP, unit: 'шт', qty: 2 },
          { name: 'Клапан АВК', unit: 'шт', qty: 1 },
        ],
      },
      { order_id: 12, dogovor_id: 102, dogovor_number: '30160', dogovor_date: '2026-11-03', client_name: 'Alfa', client_inn: null, items: [{ name: 'Клапан АВК', qty: 1 }] },
    ];
    const res = contractsWith(KCKP, pool, 10);
    expect(res.map((c) => [c.dogovor_number, c.qty, c.current])).toEqual([
      ['30123', 1, true],
      ['30150', 2, false],
    ]);
  });
});
