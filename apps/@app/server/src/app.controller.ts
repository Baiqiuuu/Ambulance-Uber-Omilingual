import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      message: 'EMS Server is running',
      timestamp: new Date().toISOString(),
      endpoints: {
        websocket: '/socket.io/',
        api: '/api',
      },
    };
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}

