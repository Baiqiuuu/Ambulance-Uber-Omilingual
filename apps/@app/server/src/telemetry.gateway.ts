import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Injectable } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket'] })
@Injectable()
export class TelemetryGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  afterInit() {
    // Simulate: push random vehicle position every 2 seconds
    setInterval(() => {
      const id = 'A1';
      const baseLat = 39.95,
        baseLng = -75.16;
      const jitter = () => (Math.random() - 0.5) * 0.01;
      this.server.emit('vehicle:telemetry', {
        id,
        lat: baseLat + jitter(),
        lng: baseLng + jitter(),
      });
    }, 2000);
  }
}


