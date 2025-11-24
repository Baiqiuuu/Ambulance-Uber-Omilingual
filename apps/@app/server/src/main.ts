import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { 
    cors: {
      origin: '*',
      credentials: true,
    },
  });
  
  const port = process.env.PORT || 4000;
  await app.listen(port);
  
  console.log(`🚀 Server is running on: http://localhost:${port}`);
  console.log(`📡 WebSocket available at: ws://localhost:${port}/socket.io/`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
}
bootstrap();





