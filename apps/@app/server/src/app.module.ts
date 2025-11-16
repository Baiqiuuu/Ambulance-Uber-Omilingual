import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryGateway } from './telemetry.gateway';
import { Vehicle } from './vehicle.entity';
import { Dispatch } from './dispatch.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: ['.env', 'apps/@app/server/.env'],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        // 优先使用 DATABASE_URL，如果存在且非空则使用
        const databaseUrl = process.env.DATABASE_URL?.trim();
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            autoLoadEntities: true,
            synchronize: true, // 开发期方便；生产请改为 migration
          };
        }
        
        // 使用单独的配置项，确保所有值都是字符串类型
        return {
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: String(process.env.DB_USERNAME || 'postgres'),
          password: String(process.env.DB_PASSWORD || 'postgres'),
          database: process.env.DB_DATABASE || 'ems',
          autoLoadEntities: true,
          synchronize: true, // 开发期方便；生产请改为 migration
        };
      },
    }),
    TypeOrmModule.forFeature([Vehicle, Dispatch]),
  ],
  providers: [TelemetryGateway],
})
export class AppModule {}


