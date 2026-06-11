import { ApiProperty } from '@nestjs/swagger';
import {
  Table,
  Model,
  Column,
  DataType,
  BelongsTo,
  ForeignKey,
} from 'sequelize-typescript';
import { User } from 'src/users/models/user.model';

// status qiymatlari:
//  direct_object      🟢 ofisga kelmay to'g'ri obyektga
//  office_then_object 🟡 ofisga kelib, keyin obyektga
//  office             🔵 ofisda ishladi
//  absent             🔴 kelmadi (sababsiz/shaxsiy)
//  dayoff             ⚪ dam olish / bayram

interface AttendanceAtr {
  user_id: number;
  date: string;
  status?: string;
  work_hours?: number;
  check_in?: string;
  check_out?: string;
  note?: string;
  created_by?: number;
}

@Table({ tableName: 'attendance' })
export class Attendance extends Model<Attendance, AttendanceAtr> {
  @ApiProperty({ example: 1, description: 'Unique id' })
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Davomat egasi — xodim
  @ForeignKey(() => User)
  @ApiProperty({ example: 4, description: 'Employee id' })
  @Column({ type: DataType.INTEGER, allowNull: false })
  user_id: number;
  @BelongsTo(() => User, { foreignKey: 'user_id', as: 'employee' })
  employee: User;

  @ApiProperty({ example: '2026-06-11', description: 'Day (YYYY-MM-DD)' })
  @Column({ type: DataType.DATEONLY, allowNull: false })
  date: string;

  @ApiProperty({ example: 'office', description: 'Attendance status' })
  @Column({ type: DataType.STRING, defaultValue: 'office' })
  status: string;

  @ApiProperty({ example: 8, description: 'Worked hours (default 8)' })
  @Column({ type: DataType.FLOAT, defaultValue: 8 })
  work_hours: number;

  @ApiProperty({ example: '09:00', description: 'Check-in time HH:mm' })
  @Column({ type: DataType.STRING, allowNull: true })
  check_in: string;

  @ApiProperty({ example: '18:00', description: 'Check-out time HH:mm' })
  @Column({ type: DataType.STRING, allowNull: true })
  check_out: string;

  @ApiProperty({ example: 'Tushdan keyin obyektga ketdi', description: 'Note' })
  @Column({ type: DataType.TEXT, allowNull: true })
  note: string;

  // Kiritgan admin
  @ForeignKey(() => User)
  @ApiProperty({ example: 1, description: 'Admin who entered the record' })
  @Column({ type: DataType.INTEGER, allowNull: true })
  created_by: number;
  @BelongsTo(() => User, { foreignKey: 'created_by', as: 'creator' })
  creator: User;
}
