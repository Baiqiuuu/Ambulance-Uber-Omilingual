import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class AED {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('float')
  latitude!: number;

  @Column('float')
  longitude!: number;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  building?: string;

  @Column({ nullable: true })
  floor?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: 'public' })
  accessType!: string; // 'public', 'restricted', 'private'

  @Column({ default: 'available' })
  status!: string; // 'available', 'maintenance', 'unavailable'

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}

