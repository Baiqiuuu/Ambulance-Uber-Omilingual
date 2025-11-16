import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ default: 'available' })
  status!: string;

  @Column('float', { default: 39.95 })
  lat!: number;

  @Column('float', { default: -75.16 })
  lng!: number;
}


