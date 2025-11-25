import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Injectable } from '@nestjs/common';

@WebSocketGateway({ 
  cors: { 
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'], // 允许多种传输方式以提高兼容性
  allowEIO3: true, // 允许 Socket.IO v3 客户端连接
})
@Injectable()
export class TelemetryGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  // 存储车辆位置
  private vehiclePositions = new Map<string, { lat: number; lng: number }>();
  
  // 存储分享的位置和笔记
  private sharedLocations = new Map<string, { lat: number; lng: number; message?: string }>();

  // 锁定状态：是否锁定车辆位置
  private isPositionLocked = false;
  private lockedPosition: { lat: number; lng: number } | null = null;

  private intervalId: NodeJS.Timeout | null = null;

  afterInit(server: Server) {
    console.log('WebSocket Gateway initialized');
    console.log(`Server listening on port ${process.env.PORT || 4000}`);
    
    // 监听连接事件
    server.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
      });
      
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });
    // Simulate: push random vehicle position every 2 seconds
    // DISABLED: We are using the frontend demo initialization instead
    /*
    setInterval(() => {
      const id = 'A1';
      const baseLat = 39.95,
        baseLng = -75.16;
      const jitter = () => (Math.random() - 0.5) * 0.01;
      
      // 如果位置已锁定，只发送一次锁定位置，然后停止更新
      if (this.isPositionLocked && this.lockedPosition) {
        this.server.emit('vehicle:telemetry', {
          id,
          lat: this.lockedPosition.lat,
          lng: this.lockedPosition.lng,
        });
        return;
      }
      
      // 如果车辆位置已存在（通过分享设置），使用分享的位置
      const sharedPosition = this.vehiclePositions.get(id);
      if (sharedPosition) {
        this.server.emit('vehicle:telemetry', {
          id,
          lat: sharedPosition.lat,
          lng: sharedPosition.lng,
        });
      } else {
        const newLat = baseLat + jitter();
        const newLng = baseLng + jitter();
        this.server.emit('vehicle:telemetry', {
          id,
          lat: newLat,
          lng: newLng,
        });
      }
    }, 2000);
    */
  }

  // 手动发送车辆位置（用于位置分享）
  emitVehicleLocation(vehicleId: string, lat: number, lng: number, status?: string, name?: string) {
    // 保存位置
    this.vehiclePositions.set(vehicleId, { lat, lng });
    
    // 立即发送位置更新
    this.server.emit('vehicle:telemetry', {
      id: vehicleId,
      lat,
      lng,
      status,
      name,
    });
  }

  // 发送分享的位置（包含笔记消息）
  emitSharedLocation(vehicleId: string, lat: number, lng: number, message?: string) {
    // 保存分享的位置和笔记
    this.sharedLocations.set(vehicleId, { lat, lng, message });
    
    // 发送分享位置事件
    this.server.emit('location:shared', {
      id: vehicleId,
      lat,
      lng,
      message,
    });
  }

  // 获取所有分享的位置
  getSharedLocations() {
    return Array.from(this.sharedLocations.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
  }

  // 锁定车辆位置（使用当前位置）
  lockPosition(lat: number, lng: number) {
    this.isPositionLocked = true;
    this.lockedPosition = { lat, lng };
    // 立即发送锁定位置
    const id = 'A1';
    this.server.emit('vehicle:telemetry', {
      id,
      lat,
      lng,
    });
  }

  // 解锁车辆位置
  unlockPosition() {
    this.isPositionLocked = false;
    this.lockedPosition = null;
  }

  // 获取锁定状态
  getLockStatus() {
    return {
      locked: this.isPositionLocked,
      position: this.lockedPosition,
    };
  }
}


