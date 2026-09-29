import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoSyncStateAtr {
  entity: string;
  cursor_ts?: number | null;
  last_run_at?: Date | null;
  last_status?: string | null;
  last_error?: string | null;
  items_synced?: number;
}

// Har bir sinxronizatsiya turi uchun holat: qayerdan davom etish (cursor —
// oxirgi olingan updated_at, unix soniya), oxirgi natija va xato.
@Table({ tableName: 'amo_sync_state', timestamps: true })
export class AmoSyncState extends Model<AmoSyncState, AmoSyncStateAtr> {
  @Column({ type: DataType.STRING(32), primaryKey: true })
  declare entity: string;

  @Column({ type: DataType.BIGINT, allowNull: true })
  declare cursor_ts?: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare last_run_at?: Date | null;

  // ok | error
  @Column({ type: DataType.STRING(16), allowNull: true })
  declare last_status?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare last_error?: string | null;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare items_synced: number;
}
