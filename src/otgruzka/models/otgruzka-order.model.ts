import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';
import { Dogovor } from 'src/dogovor/models/dogovor.model';
import { OtgruzkaPayment } from './otgruzka-payment.model';
import { OtgruzkaNote } from './otgruzka-note.model';

// Shartnoma seriyasi raqamdan aniqlanadi:
//   30xxx — Climavent rasmiy (Didox'da hujjat harakati bor)
//   50xxx — Climavent norasmiy (Didox yo'q)
//   10xxx — Jihozvent norasmiy (Didox yo'q)
//   1..999 — Jihozvent rasmiy (Didox'da hujjat harakati bor)
export type OtgruzkaSeries = 'cv_official' | 'cv_unofficial' | 'jv_official' | 'jv_unofficial' | 'other';

// Qo'lda qo'yiladigan yakuniy holatlar (qolgan holatlar hisoblanadi)
export const FINAL_STATUSES = ['refused', 'returned', 'stopped', 'stock'] as const;
export type FinalStatus = (typeof FINAL_STATUSES)[number];

// Shartnomadagi mahsulot qatori (ERP'da yuritiladi, jadvalga yozilmaydi)
export interface OtgruzkaItem {
  name: string;
  unit?: string | null;
  qty: number;
  price: number;
  /** Qo'lda kiritilgan otgruzka qilingan soni (bo'lmasa — schyot-fakturalardan hisoblanadi) */
  shipped?: number | null;
}

export interface OtgruzkaOrderAtr {
  sheet_key?: string | null;
  sheet_row?: number | null;
  sheet_removed?: boolean;
  source?: 'sheet' | 'erp';
  series?: OtgruzkaSeries;
  dogovor_number?: string | null;
  dogovor_date?: string | null;
  dogovor_id?: number | null;
  client_name?: string | null;
  client_inn?: string | null;
  client_contact?: string | null;
  client_phone?: string | null;
  manager_name?: string | null;
  contract_sum?: number;
  paid_sum?: number;
  ready_pct?: number;
  shipped_pct?: number;
  didox_contract?: boolean | null;
  didox_poa?: boolean | null;
  invoice_numbers?: string | null;
  sgp_date?: string | null;
  sheet_status?: string | null;
  final_status?: FinalStatus | null;
  final_reason?: string | null;
  note_main?: string | null;
  note_extra?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  ready_at?: Date | null;
  shipped_at?: Date | null;
  paid_at?: Date | null;
  erp_written_at?: Date | null;
  items?: OtgruzkaItem[] | null;
  sklad_check?: SkladCheck | null;
  sklad_requested_at?: Date | null;
  sklad_checked_at?: Date | null;
  sklad_checked_by?: number | null;
  sklad_check_note?: string | null;
  sklad_dogovor_id?: number | null;
  created_by?: number | null;
}

// Ombor tekshiruvi: yangi ERP shartnomasi kelganda 'pending' — ombor mahsulotlar borligini
// tekshirib 'done' qiladi. null — tekshiruv so'ralmagan (eski/jadvaldan kelgan kartalar).
export type SkladCheck = 'pending' | 'done';

// Otgruzka kuzatuv kartasi — bitta shartnoma bo'yicha jo'natish jarayoni.
// Mirror rejimda Google Sheets "Главная" varag'ining bir qatori.
@Table({ tableName: 'otgruzka_orders', timestamps: true })
export class OtgruzkaOrder extends Model<OtgruzkaOrder, OtgruzkaOrderAtr> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Varaqdagi qatorni tanish kaliti: raqam + kompaniya nomi kaliti (+ #2 takror bo'lsa)
  @Column({ type: DataType.STRING, allowNull: true, unique: true })
  declare sheet_key: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sheet_row: number | null;

  // Varaqdan o'chirilgan qator (ERP'da tarix uchun saqlanadi)
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare sheet_removed: boolean;

  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'sheet' })
  declare source: 'sheet' | 'erp';

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'other' })
  declare series: OtgruzkaSeries;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare dogovor_number: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare dogovor_date: string | null;

  @ForeignKey(() => Dogovor)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare dogovor_id: number | null;

  @BelongsTo(() => Dogovor, { foreignKey: 'dogovor_id', as: 'dogovor', constraints: false })
  declare dogovor?: Dogovor;

  @Column({ type: DataType.STRING, allowNull: true })
  declare client_name: string | null;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare client_inn: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare client_contact: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare client_phone: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare manager_name: string | null;

  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 0 })
  declare contract_sum: number;

  // To'lovlar jurnalining yig'indisi (kesh)
  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 0 })
  declare paid_sum: number;

  // 0..1 — tovar tayyorligi
  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 0 })
  declare ready_pct: number;

  // 0..1 — jo'natilgan qism
  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 0 })
  declare shipped_pct: number;

  // Didox: null — kerak emas ("-"), true — bor, false — yo'q
  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare didox_contract: boolean | null;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare didox_poa: boolean | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare invoice_numbers: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare sgp_date: string | null;

  // Varaqdagi "Статус товаров" xom matni (tarix va moslik uchun)
  @Column({ type: DataType.STRING, allowNull: true })
  declare sheet_status: string | null;

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare final_status: FinalStatus | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare final_reason: string | null;

  // Varaqdagi ikki izoh ustuni (oxirgi holati; o'zgarishlar tarixi otgruzka_notes'da)
  @Column({ type: DataType.TEXT, allowNull: true })
  declare note_main: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note_extra: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare next_action: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare next_action_date: string | null;

  // Holatga yetgan vaqtlar (kechikish signallari uchun)
  @Column({ type: DataType.DATE, allowNull: true })
  declare ready_at: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare shipped_at: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare paid_at: Date | null;

  // ERP'dan jadvalga oxirgi yozilgan vaqt. Google CSV eksporti bir necha soniya eski
  // ma'lumot berishi mumkin — shu oraliqda sinxron bu qatorni "qaytarib" yubormasin.
  @Column({ type: DataType.DATE, allowNull: true })
  declare erp_written_at: Date | null;

  // Mahsulotlar (nom, soni, narxi) — ERP shartnomasidan yoki PDF'dan; jadvalda bunday ustun yo'q
  @Column({ type: DataType.JSONB, allowNull: true })
  declare items: OtgruzkaItem[] | null;

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare sklad_check: SkladCheck | null;

  // Tekshiruv so'ralgan vaqt (bildirishnoma vaqti; karta tahrirlansa o'zgarmaydi)
  @Column({ type: DataType.DATE, allowNull: true })
  declare sklad_requested_at: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare sklad_checked_at: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sklad_checked_by: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare sklad_check_note: string | null;

  // Tekshiruv so'rovini qaysi ERP shartnomasi ochgan (shartnoma o'chirilsa — so'rov ham bekor bo'ladi)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sklad_dogovor_id: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare created_by: number | null;

  @HasMany(() => OtgruzkaPayment, { foreignKey: 'order_id', as: 'payments' })
  declare payments?: OtgruzkaPayment[];

  @HasMany(() => OtgruzkaNote, { foreignKey: 'order_id', as: 'notes' })
  declare notes?: OtgruzkaNote[];
}
