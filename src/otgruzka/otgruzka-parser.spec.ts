import {
  companyKey,
  finalStatusOf,
  parseDate,
  parseFlag,
  parseLinesSheet,
  parseMainSheet,
  parseMoney,
  parsePct,
  seriesOf,
} from './otgruzka-parser';

// "Отгрузка Трекер" CSV eksportining qisqartirilgan nusxasi (haqiqiy tuzilma)
const MAIN = [
  '       ,,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,не оплачено ,"6 649 711 369,48 UZS",34%,,,отгружено,оплачено,,,',
  ',,,,,,,,,DIDOX,,,,,,,состояние заказа,,,,',
  ',инн,клиент фио,клиент тел номер,менеджер,дата регистрации,дог номер ,компания,готовность товаров,договор,доверенность,сумма по договору,оплечанная сумма,%,отгруженные товары,счет фактура номер,Статус товаров,Статус оплаты,,,Дата готовности (СГП)',
  ',310104742,,"""+998 88 287 19 99   ""+998 97 918 08 09",Расулов Жамшид,,30281,"""AD EXPRESS INVEST STROY"" MCHJ",100%,1,1,"224 821 744,00 UZS","224 821 744,00 UZS",100%,95%,,Частично отгружен,Оплачен,ждем ответ,надо отправить все товары за одно,0%',
  ',,,,Комилов,21.07.26,246,выставка или шоурум,50%,-,-,"0,00 UZS","0,00 UZS",0%,10%,,Частично отгружен,Ждем оплату,ЗАКАЗ ВЫСТАВКА,,0%',
  ',,,,Расулов Жамшид,02.04.26,50103,Иброхим,100%,-,-,"4 802 560,00 UZS","4 300 000,00",90%,0%,,отказ отклиента,Ждем оплату,,,0%',
  ',,,,Расулов Жамшид,02.04.26,50103,Иброхим,100%,-,-,"1 000,00 UZS","0",0%,0%,,Ожидание,Ждем оплату,,,0%',
  ',,,,,,,,0%,-,-,"0,00 UZS","0,00 UZS",,0%,,Ожидание,,,,',
].join('\n');

describe('otgruzka parser', () => {
  it('Главная varag\'ini o\'qiydi', () => {
    const { rows } = parseMainSheet(MAIN);
    expect(rows).toHaveLength(4); // bo'sh shablon qatori tashlanadi
    const [a, b, c, d] = rows;
    expect(a).toMatchObject({
      row: 5,
      dogovor_number: '30281',
      series: 'cv_official',
      client_name: '"AD EXPRESS INVEST STROY" MCHJ',
      client_inn: '310104742',
      client_phone: '+998 88 287 19 99, +998 97 918 08 09',
      contract_sum: 224821744,
      paid_sum: 224821744,
      ready_pct: 1,
      shipped_pct: 0.95,
      didox_contract: true,
      didox_poa: true,
      note_main: 'ждем ответ',
      note_extra: 'надо отправить все товары за одно',
      final_status: null,
    });
    expect(a.key).toBe('30281|ad express invest stroy');
    expect(b).toMatchObject({ series: 'jv_official', dogovor_date: '2026-07-21', didox_contract: null, shipped_pct: 0.1 });
    expect(c).toMatchObject({ series: 'cv_unofficial', paid_sum: 4300000, final_status: 'refused' });
    // Bir xil raqam+kompaniya — ikkinchisi #2 kaliti bilan
    expect(d.key).toBe(`${c.key}#2`);
  });

  it('sarlavhasiz varaqda kod bilan xato beradi', () => {
    expect(() => parseMainSheet('a,b\n1,2')).toThrow(expect.objectContaining({ code: 'OT_SHEET_NO_HEADER' }));
  });

  it('qiymatlarni o\'giradi', () => {
    expect(parseMoney('1 908 480,00 UZS')).toBe(1908480);
    expect(parseMoney('4 300 000,00')).toBe(4300000);
    expect(parseMoney('-')).toBe(0);
    expect(parsePct('55,8%')).toBe(0.558);
    expect(parsePct('0.95')).toBe(0.95);
    expect(parseFlag('-')).toBeNull();
    expect(parseFlag('0')).toBe(false);
    expect(parseDate('02.10.26')).toBe('2026-10-02');
    expect(parseDate('31.02.26')).toBeNull();
    expect(seriesOf('30533')).toBe('cv_official');
    expect(seriesOf('10027')).toBe('jv_unofficial');
    expect(seriesOf('246 выстав')).toBe('jv_official');
    expect(seriesOf(null)).toBe('other');
    expect(finalStatusOf('отказ отклиента')).toBe('refused');
    expect(finalStatusOf('Готово')).toBeNull();
    expect(companyKey('"DUBANYA SILK ROAD" MCHJ QK')).toBe('dubanya silk road');
    expect(companyKey('ООО "NUOVA STELLA"')).toBe('nuova stella');
  });

  it('Лист1 tovar qatorlarini o\'qiydi', () => {
    const csv = [
      ',,,,,,,,',
      ',,договор,наиминовани,кол-во по дог.,приход,расход,остаток,',
      ',нгмк,50,ВНВ 243.1-170х145-03,,5,,5,',
      ',запас,выставка,КЦКП-3.15,,2,0,2,3',
    ].join('\n');
    const lines = parseLinesSheet(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ dogovor_label: '50', client_label: 'нгмк', qty_in: 5, qty_out: null });
    expect(lines[1]).toMatchObject({ dogovor_label: 'выставка', client_label: 'запас', qty_in: 2, qty_out: 0, note: '3' });
  });
});
