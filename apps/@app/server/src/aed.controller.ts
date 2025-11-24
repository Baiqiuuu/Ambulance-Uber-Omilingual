import { Controller, Get, Post, Body, Put, Param, Delete, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AED } from './aed.entity';
import { sampleAEDs } from './aed.seed';

interface CreateAEDDto {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  building?: string;
  floor?: string;
  description?: string;
  accessType?: string;
  status?: string;
}

interface UpdateAEDDto {
  name?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  building?: string;
  floor?: string;
  description?: string;
  accessType?: string;
  status?: string;
}

@Controller('api/aed')
export class AEDController {
  constructor(
    @InjectRepository(AED)
    private aedRepository: Repository<AED>,
  ) {}

  // Get all AEDs
  @Get()
  async getAllAEDs(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string, // radius in kilometers
  ) {
    if (lat && lng && radius) {
      // Get AEDs within radius
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const radiusKm = parseFloat(radius);

      // Get all available AEDs first
      const allAeds = await this.aedRepository.find({
        where: { status: 'available' },
      });

      // Calculate distance using Haversine formula
      const aedsWithinRadius = allAeds.filter(aed => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          aed.latitude,
          aed.longitude,
        );
        return distance <= radiusKm;
      });

      return {
        success: true,
        count: aedsWithinRadius.length,
        aeds: aedsWithinRadius.map(aed => ({
          id: aed.id,
          name: aed.name,
          latitude: aed.latitude,
          longitude: aed.longitude,
          address: aed.address,
          building: aed.building,
          floor: aed.floor,
          description: aed.description,
          accessType: aed.accessType,
          status: aed.status,
        })),
      };
    }

    // Get all AEDs
    const aeds = await this.aedRepository.find({
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      count: aeds.length,
      aeds: aeds.map(aed => ({
        id: aed.id,
        name: aed.name,
        latitude: aed.latitude,
        longitude: aed.longitude,
        address: aed.address,
        building: aed.building,
        floor: aed.floor,
        description: aed.description,
        accessType: aed.accessType,
        status: aed.status,
      })),
    };
  }

  // Get AED by ID
  @Get(':id')
  async getAEDById(@Param('id') id: string) {
    const aed = await this.aedRepository.findOne({ where: { id } });
    if (!aed) {
      return {
        success: false,
        message: 'AED not found',
      };
    }

    return {
      success: true,
      aed: {
        id: aed.id,
        name: aed.name,
        latitude: aed.latitude,
        longitude: aed.longitude,
        address: aed.address,
        building: aed.building,
        floor: aed.floor,
        description: aed.description,
        accessType: aed.accessType,
        status: aed.status,
      },
    };
  }

  // Create new AED
  @Post()
  async createAED(@Body() dto: CreateAEDDto) {
    // Validate coordinates
    if (dto.latitude < -90 || dto.latitude > 90 || dto.longitude < -180 || dto.longitude > 180) {
      return {
        success: false,
        message: 'Invalid coordinates',
      };
    }

    const aed = this.aedRepository.create({
      name: dto.name,
      latitude: dto.latitude,
      longitude: dto.longitude,
      address: dto.address,
      building: dto.building,
      floor: dto.floor,
      description: dto.description,
      accessType: dto.accessType || 'public',
      status: dto.status || 'available',
    });

    const saved = await this.aedRepository.save(aed);

    return {
      success: true,
      message: 'AED created successfully',
      aed: {
        id: saved.id,
        name: saved.name,
        latitude: saved.latitude,
        longitude: saved.longitude,
        address: saved.address,
        building: saved.building,
        floor: saved.floor,
        description: saved.description,
        accessType: saved.accessType,
        status: saved.status,
      },
    };
  }

  // Update AED
  @Put(':id')
  async updateAED(@Param('id') id: string, @Body() dto: UpdateAEDDto) {
    const aed = await this.aedRepository.findOne({ where: { id } });
    if (!aed) {
      return {
        success: false,
        message: 'AED not found',
      };
    }

    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      const lat = dto.latitude ?? aed.latitude;
      const lng = dto.longitude ?? aed.longitude;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return {
          success: false,
          message: 'Invalid coordinates',
        };
      }
    }

    Object.assign(aed, dto);
    const updated = await this.aedRepository.save(aed);

    return {
      success: true,
      message: 'AED updated successfully',
      aed: {
        id: updated.id,
        name: updated.name,
        latitude: updated.latitude,
        longitude: updated.longitude,
        address: updated.address,
        building: updated.building,
        floor: updated.floor,
        description: updated.description,
        accessType: updated.accessType,
        status: updated.status,
      },
    };
  }

  // Delete AED
  @Delete(':id')
  async deleteAED(@Param('id') id: string) {
    const result = await this.aedRepository.delete(id);
    if (result.affected === 0) {
      return {
        success: false,
        message: 'AED not found',
      };
    }

    return {
      success: true,
      message: 'AED deleted successfully',
    };
  }

  // Seed sample AEDs (for development/testing)
  @Post('seed')
  async seedAEDs() {
    const existingCount = await this.aedRepository.count();
    if (existingCount > 0) {
      return {
        success: false,
        message: `AEDs already exist (${existingCount} found). Delete existing AEDs first or use a different endpoint.`,
        count: existingCount,
      };
    }

    const created = [];
    for (const aedData of sampleAEDs) {
      const aed = this.aedRepository.create(aedData);
      const saved = await this.aedRepository.save(aed);
      created.push({
        id: saved.id,
        name: saved.name,
        latitude: saved.latitude,
        longitude: saved.longitude,
      });
    }

    return {
      success: true,
      message: `Seeded ${created.length} AEDs successfully`,
      count: created.length,
      aeds: created,
    };
  }

  // Calculate distance between two coordinates using Haversine formula
  // Returns distance in kilometers
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

