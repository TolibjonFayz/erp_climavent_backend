import { ApiProperty } from '@nestjs/swagger';
import { Table, Model, Column, DataType } from 'sequelize-typescript';

// Hikvision yuz terminalidagi bitta "yuz tasdiqlandi" qaydi (xom ma'lumot).
// (device_serial, serial_no) unikal — agent bir hodisani qayta yuborsa, dublikat bo'lmaydi.

interface HikEventAtr {
  device_serial: string;
  direction: string;
  serial_no: number;
  employee_no: string;
  event_time: Date;
}

@Table({
  tableName: 'attendance_events',
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['device_serial', 'serial_no'] },
    { fields: ['employee_no', 'event_time'] },
  ],
})
export class HikEvent extends Model<HikEvent, HikEventAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ApiProperty({ example: 'DS-K1T341CMF20250224V030340ENGH4151011', description: 'Terminal serial number' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare device_serial: string;

  // in = kirish terminali, out = chiqish terminali
  @ApiProperty({ example: 'in', description: 'in | out' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare direction: string;

  @ApiProperty({ example: 38056, description: 'Event serial number on the terminal' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare serial_no: number;

  @ApiProperty({ example: '00000002', description: 'Employee number on the terminal' })
  @Column({ type: DataType.STRING, allowNull: false })
  declare employee_no: string;

  @ApiProperty({ example: '2026-10-02T09:02:18+05:00', description: 'Event time' })
  @Column({ type: DataType.DATE, allowNull: false })
  declare event_time: Date;
}
