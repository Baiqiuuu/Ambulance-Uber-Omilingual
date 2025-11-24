import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryGateway } from './telemetry.gateway';
import { Vehicle } from './vehicle.entity';
import { Dispatch } from './dispatch.entity';
import { LocationsModule } from './locations/locations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: ['.env', 'apps/@app/server/.env'],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        // Prefer DATABASE_URL if it exists and is non-empty
        const databaseUrl = process.env.DATABASE_URL?.trim();
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            autoLoadEntities: true,
            synchronize: true, // Convenient for development; use migrations in production
          };
        }
        
        // Use individual configuration items, ensuring all values are strings
        return {
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: String(process.env.DB_USERNAME || 'postgres'),
          password: String(process.env.DB_PASSWORD || 'postgres'),
          database: process.env.DB_DATABASE || 'ems',
          autoLoadEntities: true,
          synchronize: true, // Convenient for development; use migrations in production
        };
      },
    }),
    TypeOrmModule.forFeature([Vehicle, Dispatch]),
    LocationsModule,
  ],
  providers: [TelemetryGateway],
})
export class AppModule {}


