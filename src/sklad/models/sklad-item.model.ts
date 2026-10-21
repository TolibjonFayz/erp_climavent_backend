import { ApiProperty } from '@nestjs/swagger';
import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { SkladMovement } from './sklad-movement.model';

export interface SkladItemAtr {
  code: string;
  name: string;
  name_key: string;
  group_name?: string | null;
  sub_group?: string | null;
  unit?: string;
  sap_code?: string | null;
  sap_name?: string | null;
  min_qty?: number | null;
  sort_order?: number | null;
  is_active?: boolean;
}

// Ombordagi mahsulot (nomenklatura). Google Sheets'dagi har bir qator — bitta mahsulot.
// DIQQAT: har bir maydon `declare` bilan (tsconfig target ES2023).
@Table({ tableName: 'sklad_items', timestamps: true })
export class SkladItem extends Model<SkladItem, SkladItemAtr> {
  @ApiProperty({ example: 1 })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // ERP ichki texnik kodi (VEN-0001) — ekranda ko'rsatilmaydi, o'rniga SAP kodi.
  @ApiProperty({ example: 'VEN-0001' })
  @Column({ type: DataType.STRING(32), allowNull: false, unique: true })
  declare code: string;

  @ApiProperty({ example: 'ВКП 70х40-4D35,5 3/1400' })
  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  // Nomning solishtirish kaliti (kichik harf, ortiqcha bo'shliqsiz) —
  // jadvaldan qayta import qilganda mahsulotni shu bo'yicha topamiz.
  @Column({ type: DataType.TEXT, allowNull: false, unique: true })
  declare name_key: string;

  @ApiProperty({ example: 'Вентильяторы' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare group_name: string | null;

  @ApiProperty({ example: 'вент' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare sub_group: string | null;

  @ApiProperty({ example: 'dona' })
  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'dona' })
  declare unit: string;

  // Xodimlar mahsulotni SAP kodi va nomi bilan taniydi — ekranda shular ko'rsatiladi.
  // Jadvaldan sinxron bu maydonlarga tegmaydi (SAP ro'yxatini yuklash yoki qo'lda).
  @ApiProperty({ example: '01-0001', description: 'SAP kodi' })
  @Column({ type: DataType.STRING, allowNull: true })
  declare sap_code: string | null;

  @ApiProperty({ example: 'ВКП 70х40-4D35,5 3/1400', description: 'SAP nomi' })
  @Column({ type: DataType.TEXT, allowNull: true })
  declare sap_name: string | null;

  // Shu miqdordan kam qolsa "kam qoldi" deb belgilanadi
  @ApiProperty({ example: 5 })
  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare min_qty: number | null;

  // Jadvaldagi tartib raqami (№) — ro'yxatni jadvaldagidek tartibda ko'rsatish uchun
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sort_order: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare is_active: boolean;

  @HasMany(() => SkladMovement)
  declare movements?: SkladMovement[];
}
