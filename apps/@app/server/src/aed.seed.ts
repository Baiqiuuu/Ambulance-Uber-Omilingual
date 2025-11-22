import { DataSource } from 'typeorm';
import { AED } from './aed.entity';

// Sample AED data around Philadelphia area (39.95, -75.16)
export const sampleAEDs = [
  {
    name: 'City Hall - Main Entrance',
    latitude: 39.9526,
    longitude: -75.1652,
    address: '1400 John F Kennedy Blvd',
    building: 'City Hall',
    floor: 'Ground Floor',
    description: 'Located near the main entrance security desk',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'Independence Mall - Visitor Center',
    latitude: 39.9489,
    longitude: -75.1500,
    address: '525 Market St',
    building: 'Independence Visitor Center',
    floor: 'First Floor',
    description: 'Near the information desk',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'Reading Terminal Market',
    latitude: 39.9540,
    longitude: -75.1590,
    address: '51 N 12th St',
    building: 'Reading Terminal Market',
    floor: 'Main Level',
    description: 'Central food court area',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'Philadelphia Museum of Art',
    latitude: 39.9656,
    longitude: -75.1809,
    address: '2600 Benjamin Franklin Pkwy',
    building: 'Philadelphia Museum of Art',
    floor: 'First Floor',
    description: 'Near the main entrance',
    accessType: 'public',
    status: 'available',
  },
  {
    name: '30th Street Station',
    latitude: 39.9556,
    longitude: -75.1820,
    address: '2955 Market St',
    building: '30th Street Station',
    floor: 'Main Concourse',
    description: 'Near ticket counters',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'University of Pennsylvania Hospital',
    latitude: 39.9496,
    longitude: -75.1964,
    address: '3400 Spruce St',
    building: 'Hospital of the University of Pennsylvania',
    floor: 'Emergency Department',
    description: 'Multiple units in ER waiting area',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'Rittenhouse Square',
    latitude: 39.9496,
    longitude: -75.1723,
    address: 'Rittenhouse Square',
    building: 'Public Park',
    floor: 'Ground Level',
    description: 'Near the fountain',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'Philadelphia International Airport - Terminal A',
    latitude: 39.8719,
    longitude: -75.2411,
    address: '8000 Essington Ave',
    building: 'Terminal A',
    floor: 'Departure Level',
    description: 'Near security checkpoint',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'Wells Fargo Center',
    latitude: 39.9012,
    longitude: -75.1719,
    address: '3601 S Broad St',
    building: 'Wells Fargo Center',
    floor: 'Concourse Level',
    description: 'Multiple units throughout the arena',
    accessType: 'public',
    status: 'available',
  },
  {
    name: 'Franklin Institute',
    latitude: 39.9584,
    longitude: -75.1728,
    address: '222 N 20th St',
    building: 'Franklin Institute',
    floor: 'First Floor',
    description: 'Near the main entrance',
    accessType: 'public',
    status: 'available',
  },
];

export async function seedAEDs(dataSource: DataSource) {
  const aedRepository = dataSource.getRepository(AED);
  
  // Check if AEDs already exist
  const existingCount = await aedRepository.count();
  if (existingCount > 0) {
    console.log(`AEDs already exist (${existingCount} found). Skipping seed.`);
    return;
  }

  // Insert sample AEDs
  for (const aedData of sampleAEDs) {
    const aed = aedRepository.create(aedData);
    await aedRepository.save(aed);
  }

  console.log(`Seeded ${sampleAEDs.length} AEDs successfully.`);
}

