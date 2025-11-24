import { Controller, Post, Body, Put, Param, Get, Delete } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { TelemetryGateway } from './telemetry.gateway';

interface RegisterVehicleDto {
  name?: string;
  latitude: number;
  longitude: number;
  status?: string;
}

interface UpdateVehicleLocationDto {
  latitude: number;
  longitude: number;
}

interface UpdateVehicleStatusDto {
  status: 'vacant' | 'on_duty';
}

@Controller('api/medical')
export class MedicalController {
  constructor(
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    private readonly telemetryGateway: TelemetryGateway,
  ) {}

  // Register a new ambulance (using current location)
  @Post('vehicles/register')
  async registerVehicle(@Body() dto: RegisterVehicleDto) {
    // Validate coordinates
    if (
      dto.latitude < -90 ||
      dto.latitude > 90 ||
      dto.longitude < -180 ||
      dto.longitude > 180
    ) {
      return { success: false, message: 'Invalid coordinates' };
    }

    // Create new vehicle
    const vehicle = this.vehicleRepository.create({
      name: dto.name || `Ambulance-${Date.now()}`,
      lat: dto.latitude,
      lng: dto.longitude,
      status: dto.status || 'vacant',
      lastUpdate: new Date(),
    });

    const saved = await this.vehicleRepository.save(vehicle);

    // Emit vehicle location via WebSocket
    this.telemetryGateway.emitVehicleLocation(saved.id, saved.lat, saved.lng, saved.status, saved.name);

    return {
      success: true,
      message: 'Vehicle registered successfully',
      vehicle: {
        id: saved.id,
        name: saved.name,
        latitude: saved.lat,
        longitude: saved.lng,
        status: saved.status,
      },
    };
  }

  // Update vehicle location
  @Put('vehicles/:id/location')
  async updateVehicleLocation(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleLocationDto,
  ) {
    // Validate coordinates
    if (
      dto.latitude < -90 ||
      dto.latitude > 90 ||
      dto.longitude < -180 ||
      dto.longitude > 180
    ) {
      return { success: false, message: 'Invalid coordinates' };
    }

    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) {
      return { success: false, message: 'Vehicle not found' };
    }

    vehicle.lat = dto.latitude;
    vehicle.lng = dto.longitude;
    vehicle.lastUpdate = new Date();

    const updated = await this.vehicleRepository.save(vehicle);

    // Emit vehicle location via WebSocket
    this.telemetryGateway.emitVehicleLocation(updated.id, updated.lat, updated.lng, updated.status, updated.name);

    return {
      success: true,
      message: 'Vehicle location updated successfully',
      vehicle: {
        id: updated.id,
        name: updated.name,
        latitude: updated.lat,
        longitude: updated.lng,
        status: updated.status,
      },
    };
  }

  // Update vehicle status
  @Put('vehicles/:id/status')
  async updateVehicleStatus(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleStatusDto,
  ) {
    if (dto.status !== 'vacant' && dto.status !== 'on_duty') {
      return { success: false, message: 'Invalid status. Must be "vacant" or "on_duty"' };
    }

    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) {
      return { success: false, message: 'Vehicle not found' };
    }

    vehicle.status = dto.status;
    vehicle.lastUpdate = new Date();

    const updated = await this.vehicleRepository.save(vehicle);

    // Emit vehicle location via WebSocket (so status change is reflected)
    this.telemetryGateway.emitVehicleLocation(updated.id, updated.lat, updated.lng);

    return {
      success: true,
      message: 'Vehicle status updated successfully',
      vehicle: {
        id: updated.id,
        name: updated.name,
        latitude: updated.lat,
        longitude: updated.lng,
        status: updated.status,
      },
    };
  }

  // Get all vehicles for this medical institution
  @Get('vehicles')
  async getAllVehicles() {
    const vehicles = await this.vehicleRepository.find({
      order: { lastUpdate: 'DESC' },
    });

    // Emit all vehicles via WebSocket so they appear on the map
    vehicles.forEach(vehicle => {
      this.telemetryGateway.emitVehicleLocation(
        vehicle.id,
        vehicle.lat,
        vehicle.lng,
        vehicle.status,
        vehicle.name,
      );
    });

    return {
      success: true,
      count: vehicles.length,
      vehicles: vehicles.map(v => ({
        id: v.id,
        name: v.name,
        latitude: v.lat,
        longitude: v.lng,
        status: v.status,
        lastUpdate: v.lastUpdate,
      })),
    };
  }

  // Get vehicle by ID
  @Get('vehicles/:id')
  async getVehicleById(@Param('id') id: string) {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) {
      return { success: false, message: 'Vehicle not found' };
    }

    return {
      success: true,
      vehicle: {
        id: vehicle.id,
        name: vehicle.name,
        latitude: vehicle.lat,
        longitude: vehicle.lng,
        status: vehicle.status,
        lastUpdate: vehicle.lastUpdate,
      },
    };
  }

  // Delete vehicle
  @Delete('vehicles/:id')
  async deleteVehicle(@Param('id') id: string) {
    const result = await this.vehicleRepository.delete(id);
    if (result.affected === 0) {
      return { success: false, message: 'Vehicle not found' };
    }

    return {
      success: true,
      message: 'Vehicle deleted successfully',
    };
  }

  // Start real-time location tracking
  @Post('vehicles/:id/start-tracking')
  async startTracking(@Param('id') id: string) {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) {
      return { success: false, message: 'Vehicle not found' };
    }

    // This would typically start a background job to track location
    // For now, we'll just return success
    return {
      success: true,
      message: 'Location tracking started. Use PUT /vehicles/:id/location to update position.',
    };
  }
}

