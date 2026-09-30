import { Column, DataType, Model, Table } from 'sequelize-typescript';

interface AmoLeadContactAtr {
  lead_id: number;
  contact_id: number;
}

// Lid ↔ kontakt bog'lanishi (lid `with=contacts` bilan olinganda to'ldiriladi).
// Raqamning lidi bormi — shu orqali aniqlanadi.
@Table({
  tableName: 'amo_lead_contacts',
  timestamps: false,
  indexes: [{ fields: ['contact_id'] }],
})
export class AmoLeadContact extends Model<AmoLeadContact, AmoLeadContactAtr> {
  @Column({ type: DataType.BIGINT, primaryKey: true })
  declare lead_id: number;

  @Column({ type: DataType.BIGINT, primaryKey: true })
  declare contact_id: number;
}
