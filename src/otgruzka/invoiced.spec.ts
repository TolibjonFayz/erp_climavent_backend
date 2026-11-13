import { invoicedRows, overItems } from './invoiced';

const card = [
  { name: 'Кондиционер КЦКП-6,3 L=6180м3/ч', unit: 'шт', qty: 1 },
  { name: 'Вентилятор RH40C', unit: 'шт', qty: 3 },
];
const invoice = (
  items: Array<{ name: string; qty: number }>,
  kind = 'invoice',
) => ({ kind, items });

describe('invoiced', () => {
  it("fakturalar bo'yicha son shartnomadan ko'p bo'lsa belgilaydi", () => {
    const files = [
      invoice([{ name: 'Кондиционер КЦКП-6,3 L=6180м3/ч', qty: 1 }]),
      invoice([{ name: 'Кондиционер КЦКП-6,3 L=6180м3/ч', qty: 1 }]),
    ];
    expect(overItems(card, files)).toEqual([
      { name: card[0].name, unit: 'шт', qty: 1, shipped: 2, over: 1 },
    ]);
  });

  it("ortiqcha bo'lmasa bo'sh", () => {
    expect(
      overItems(card, [invoice([{ name: 'Вентилятор RH40C', qty: 3 }])]),
    ).toEqual([]);
  });

  it('ishonchnoma va shartnoma fayllari hisobga olinmaydi', () => {
    expect(
      overItems(card, [invoice([{ name: 'Вентилятор RH40C', qty: 9 }], 'poa')]),
    ).toEqual([]);
  });

  it("qo'lda kiritilgan son fakturadan ustun", () => {
    const files = [invoice([{ name: 'Вентилятор RH40C', qty: 5 }])];
    expect(overItems([{ ...card[1], shipped: 3 }], files)).toEqual([]);
    expect(invoicedRows([{ ...card[1], shipped: 3 }], files)[0]).toEqual({
      auto: 5,
      shipped: 3,
    });
  });
});
