import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['incidentId'], { unique: true }) // 同一 incident 只能有一个派单
export class Dispatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  incidentId!: string;

  @Column()
  vehicleId!: string;

  @Column({ default: 'assigned' })
  status!: string;
}





