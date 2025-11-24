import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  name?: string; // Vehicle name/identifier

  @Column({ default: 'vacant' })
  status!: string; // 'vacant' or 'on_duty'

  @Column('float', { default: 39.95 })
  lat!: number;

  @Column('float', { default: -75.16 })
  lng!: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastUpdate!: Date;
}





