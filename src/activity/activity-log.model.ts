import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

// Faoliyat jurnali: kim, qachon, qayerdan, nima qildi va bazada aynan nima o'zgardi.
// Yozuvlar o'zgartirilmaydi — faqat qo'shiladi.
interface ActivityLogAttrs {
  user_id?: number | null;
  action: string;
  module?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  ok?: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_label?: string | null;
  error?: string | null;
  payload?: unknown;
  changes?: unknown;
  ip?: string | null;
  user_agent?: string | null;
  platform?: string | null;
  duration_ms?: number | null;
}

@Table({
  tableName: 'activity_logs',
  updatedAt: false,
  indexes: [
    { fields: ['user_id', 'createdAt'] },
    { fields: ['createdAt'] },
    { fields: ['module', 'createdAt'] },
  ],
})
export class ActivityLog extends Model<ActivityLog, ActivityLogAttrs> {
  @Column({ type: DataType.BIGINT, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Muvaffaqiyatsiz login'da (bunday login yo'q) — null
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL' })
  declare user_id: number | null;

  @BelongsTo(() => User, { foreignKey: 'user_id', as: 'user', constraints: false })
  declare user: User;

  // login | login_failed | login_blocked | logout | create | update | delete | import | export | view | action
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare action: string;

  // URL'ning birinchi qismi: partners, kp, dogovor, sklad...
  @Column({ type: DataType.STRING(48), allowNull: true })
  declare module: string | null;

  @Column({ type: DataType.STRING(8), allowNull: true })
  declare method: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare path: string | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  declare status: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare ok: boolean;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare entity_type: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare entity_id: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare entity_label: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;

  // Yuborilgan ma'lumot (parollarsiz, qisqartirilgan)
  @Column({ type: DataType.JSONB, allowNull: true })
  declare payload: unknown;

  // Bazadagi o'zgarishlar: [{ table, op, id, fields: { maydon: [eski, yangi] } }]
  @Column({ type: DataType.JSONB, allowNull: true })
  declare changes: unknown;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare ip: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare user_agent: string | null;

  // web | mobile
  @Column({ type: DataType.STRING(16), allowNull: true })
  declare platform: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare duration_ms: number | null;

  declare createdAt: Date;
}
