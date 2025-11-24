import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['incidentId'], { unique: true }) // Only one dispatch per incident
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


