import { innKey, nameSkeleton, phoneKey } from './name-match';

describe('nameSkeleton', () => {
  it.each([
    ['SERVER SERVIS PLYUS ХК', 'Server Servis Plyus MChJ'],
    ['VENT KLIMAT  KONTROL ООО', 'Vent Klimat Kontrol'],
    ['""PRIMA VENT BUILD" MCHJ', 'Prima Vent Build'],
    ['ООО "NUOVA STELLA"', 'nuova stella mchj'],
    ['DIRECT COOL ООО', 'Direct-Cool'],
    ['Шермат-ака', 'Shermat aka'],
  ])('%s ≈ %s', (a, b) => {
    expect(nameSkeleton(a)).toBe(nameSkeleton(b));
    expect(nameSkeleton(a)).not.toBe('');
  });

  it('farqli nomlar mos kelmaydi', () => {
    expect(nameSkeleton('PROVIK')).not.toBe(nameSkeleton('PROVIK GROUP'));
    expect(nameSkeleton('Iklim')).not.toBe(nameSkeleton('Iklim Servis'));
  });

  it("faqat yuridik shakldan iborat nom bo'sh skelet beradi", () => {
    expect(nameSkeleton('ООО')).toBe('');
    expect(nameSkeleton(null)).toBe('');
  });
});

describe('phoneKey / innKey', () => {
  it("telefon kodsiz va kod bilan bir xil", () => {
    expect(phoneKey('+998 90 8085551')).toBe(phoneKey('90-808-55-51'));
    expect(phoneKey('12345')).toBe('');
  });
  it('INN faqat raqamlar', () => {
    expect(innKey(' 306 598 407 ')).toBe('306598407');
    expect(innKey('-')).toBe('');
  });
});
