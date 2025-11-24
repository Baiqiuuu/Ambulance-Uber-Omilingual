import { Injectable } from '@nestjs/common';
import { LocationIndexService } from './location-index.service';
import { LocationIndexStats, NearestLocationResult } from './location.types';

@Injectable()
export class LocationsService {
  constructor(private readonly indexService: LocationIndexService) {}

  async findNearest(lat: number, lng: number, limit: number): Promise<NearestLocationResult[]> {
    return this.indexService.findNearest(lat, lng, limit);
  }

  getIndexStats(): LocationIndexStats | null {
    return this.indexService.getStats();
  }
}

