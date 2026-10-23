import { buildSapIndex, findFuzzy, nameSig } from './sap-match';

const index = (...names: string[]) =>
  buildSapIndex(names.map((name) => ({ name, code: null, sigs: [nameSig(name)] })));

const match = (item: string, ...sap: string[]) => findFuzzy(item, index(...sap)).result?.row.name;

describe('sap-match', () => {
  it("yozilish farqini aynan moslik deb biladi (2,0 = 2, 06 = 6)", () => {
    const r = findFuzzy('ВЦ 14-46-2-О-1-1,5/3000', index('ВЦ 14-46-2,0-О-1-1,5/3000')).result;
    expect(r?.row.name).toBe('ВЦ 14-46-2,0-О-1-1,5/3000');
    expect(r?.exact).toBe(true);
  });

  it("qoplama harfi, tartib raqami va izoh farqini kechiradi (taxminiy)", () => {
    const r = findFuzzy('ВЦ 4-75-5-Ц-1-0,75/1000', index('ВЦ 4-75-5-О-1-0,75/1000')).result;
    expect(r?.row.name).toBe('ВЦ 4-75-5-О-1-0,75/1000');
    expect(r?.exact).toBe(false);
    expect(match('ВО 06-300-8-0,75/1000 покуп', 'ВО 6-300-8-О-1-0,75/1000')).toBe('ВО 6-300-8-О-1-0,75/1000');
    expect(match('Вц 4-75 №4 0,37/1000', 'ВЦ 4-75-4-О-1-0,37/1000')).toBe('ВЦ 4-75-4-О-1-0,37/1000');
    expect(match('ГТП 400х200 L=1000', 'ГТП 400x200х1000')).toBe('ГТП 400x200х1000');
  });

  it("ombor nomidagi ortiqcha dvigatel ma'lumotini kechiradi", () => {
    expect(match('ВКП 70х40-4D35,5 3/1400', 'ВКП 70х40-4D35,5')).toBe('ВКП 70х40-4D35,5');
  });

  it("o'lcham yoki quvvat farq qilsa — bog'lamaydi", () => {
    expect(match('РВР-1 1800х200', 'РВР-1 200х200')).toBeUndefined();
    expect(match('ВЦ 4-75-5-Ц-1-1,5/1500', 'ВЦ 4-75-8-О-1-18,5/1500')).toBeUndefined();
    expect(match('ДКСп 200х250х250', 'ДКСп 200х200')).toBeUndefined();
  });

  it("boshqa oilaga bog'lamaydi (ВКП ≠ ВКПП)", () => {
    expect(match('ВКП 50х30-2D25', 'ВКПП 50х30-2D25')).toBeUndefined();
  });

  it("jiddiy belgi (нержавейка, ДУ) bo'lsa — oddiy modelga bog'lamaydi", () => {
    expect(match('ВЦ 14-46-2,5-Ц-1-0,75/1500 нержавейка', 'ВЦ 14-46-2,5-О-1-0,75/1500')).toBeUndefined();
    expect(match('ВЦ 4-75-10 ДУ-О-1-18,5/1000', 'ВЦ 4-75-10-О-1-18,5/1000')).toBeUndefined();
  });

  it("katalog shu oilada alohida variant deb bilgan harfni kechirmaydi", () => {
    expect(match('ВКК-КХ 56-4 1,1/1500', 'ВКК 56-4-1,1/1500', 'ВКК-КХ 80-5-3,0/1500')).toBeUndefined();
  });

  it("raqami kam modelda harf farqi bo'lsa bog'lamaydi (JVI-140 HS ≠ JVI-140CR)", () => {
    expect(match('JVI-140 HS', 'JVI-140CR')).toBeUndefined();
  });

  it("bir xil ishonchlilikda ikki xil SAP nomi — taxmin qilinmaydi", () => {
    const r = findFuzzy('ВЦ 4-75-5-1-0,75/1000', index('ВЦ 4-75-5-О-1-0,75/1000', 'ВЦ 4-75-5-Ж-1-0,75/1000'));
    expect(r.ambiguous).toBe(true);
  });

  it("tavsif so'zlari va kichik variant harfi", () => {
    expect(match('Вентилятор канальный ВК MF- Ø100 П(покупной)', 'ВК-100П')).toBe('ВК-100П');
    expect(match('АВК 400х200 (с электропридидом)', 'АВКв 400х200')).toBe('АВКв 400х200');
  });
});
