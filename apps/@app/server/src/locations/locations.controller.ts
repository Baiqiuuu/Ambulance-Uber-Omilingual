import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { NearestQueryDto } from './dto/nearest-query.dto';
import { LocationsService } from './locations.service';

@Controller('api/locations')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('nearest')
  async getNearest(@Query() query: NearestQueryDto) {
    const data = await this.locationsService.findNearest(query.lat, query.lng, query.limit);
    const stats = this.locationsService.getIndexStats();

    return {
      data: data.map((location) => ({
        id: location.id,
        name: location.name,
        level: location.level,
        latitude: location.latitude,
        longitude: location.longitude,
        iso639P3code: location.iso639P3code,
        countryIds: location.countryIds,
        distanceMeters: location.distanceMeters,
      })),
      meta: {
        count: data.length,
        totalIndexed: stats?.indexedRows ?? 0,
        source: stats?.sourcePath ?? 'unknown',
        loadedAt: stats?.lastLoadedAt?.toISOString?.(),
        usingSpatialIndex: stats?.usingSpatialIndex ?? false,
      },
    };
  }
}

