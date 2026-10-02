import { ApiProperty } from '@nestjs/swagger';
import { Table, Model, Column, DataType } from 'sequelize-typescript';

// Ofisdagi yuz terminallari va agentning oxirgi sinxroni.

interface HikDeviceAtr {
  device_serial: string;
  host: string;
  direction: string;
  last_sync_at?: Date;
  clock_drift_sec?: number | null;
}

@Table({ tableName: 'hik_devices' })
export class HikDevice extends Model<HikDevice, HikDeviceAtr> {
  @ApiProperty({ example: 'DS-K1T341CMF20250224V030340ENGH4151011', description: 'Terminal serial number' })
  @Column({ type: DataType.STRING, primaryKey: true })
  declare device_serial: string;

  @ApiProperty({ example: '192.168.1.222', description: 'Terminal IP in the office LAN' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare host: string;

  @ApiProperty({ example: 'in', description: 'in | out' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare direction: string;

  @ApiProperty({ description: 'Last successful agent sync' })
  @Column({ type: DataType.DATE, allowNull: true })
  declare last_sync_at: Date;

  // Terminal soati kompyuterdan necha soniya farq qilgani (agent o'lchaydi)
  @ApiProperty({ example: 1, description: 'Terminal clock drift in seconds' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare clock_drift_sec: number | null;
}
