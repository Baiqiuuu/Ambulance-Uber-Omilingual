import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocationIndexService } from './location-index.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [ConfigModule],
  controllers: [LocationsController],
  providers: [LocationIndexService, LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}

