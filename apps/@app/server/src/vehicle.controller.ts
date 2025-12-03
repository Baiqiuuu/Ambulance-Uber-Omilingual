import { Controller, Post, Body, Param, Get, Query } from '@nestjs/common';
import { TelemetryGateway } from './telemetry.gateway';

interface ShareLocationDto {
  lat: number;
  lng: number;
  vehicleId?: string;
  message?: string;
  liveInformation?: string;
}

@Controller('api')
export class VehicleController {
  constructor(private readonly telemetryGateway: TelemetryGateway) {}

  // 分享位置 - 通过 POST 请求
  @Post('share-location')
  async shareLocation(@Body() dto: ShareLocationDto) {
    const vehicleId = dto.vehicleId || 'SHARED-1';
    const { lat, lng, message, liveInformation } = dto;

    // 验证坐标范围
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { success: false, message: 'Invalid coordinates' };
    }

    // 通过 WebSocket 发送位置更新（包含笔记消息和liveInformation）
    this.telemetryGateway.emitSharedLocation(vehicleId, lat, lng, message, liveInformation);

    return {
      success: true,
      message: 'Location shared successfully',
      vehicleId,
      lat,
      lng,
      note: message,
      liveInformation,
    };
  }

  // 通过 URL 参数分享位置 - GET 请求（方便手机分享链接）
  @Get('share-location')
  async shareLocationByUrl(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('id') vehicleId?: string,
    @Query('message') message?: string,
  ) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const id = vehicleId || 'SHARED-1';

    // 验证坐标
    if (isNaN(latNum) || isNaN(lngNum)) {
      return { success: false, message: 'Invalid coordinates' };
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return { success: false, message: 'Coordinates out of range' };
    }

    // 通过 WebSocket 发送位置更新（包含笔记消息）
    this.telemetryGateway.emitSharedLocation(id, latNum, lngNum, message);

    return {
      success: true,
      message: 'Location shared successfully',
      vehicleId: id,
      lat: latNum,
      lng: lngNum,
      note: message,
    };
  }

  // 获取所有分享的位置
  @Get('shared-locations')
  async getSharedLocations() {
    const locations = this.telemetryGateway.getSharedLocations();
    return {
      success: true,
      locations,
    };
  }

  // 锁定车辆位置
  @Post('lock-vehicle-position')
  async lockVehiclePosition(@Body() body: { lat?: number; lng?: number }) {
    // 如果没有提供坐标，使用默认坐标
    const lat = body.lat ?? 39.95;
    const lng = body.lng ?? -75.16;
    
    this.telemetryGateway.lockPosition(lat, lng);
    
    return {
      success: true,
      message: 'Vehicle position locked',
      position: { lat, lng },
    };
  }

  // 解锁车辆位置
  @Post('unlock-vehicle-position')
  async unlockVehiclePosition() {
    this.telemetryGateway.unlockPosition();
    
    return {
      success: true,
      message: 'Vehicle position unlocked',
    };
  }

  // 获取锁定状态
  @Get('vehicle-lock-status')
  async getVehicleLockStatus() {
    const status = this.telemetryGateway.getLockStatus();
    return {
      success: true,
      ...status,
    };
  }
}




