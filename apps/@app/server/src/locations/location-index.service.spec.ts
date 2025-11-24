import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { LocationIndexService } from './location-index.service';

const fixturePath = join(__dirname, '../../test/fixtures/locations-sample.csv');

describe('LocationIndexService', () => {
  const config = {
    get: (key: string) => {
      if (key === 'LOCATION_CSV_PATH') {
        return fixturePath;
      }
      return undefined;
    },
  } as ConfigService;

  it('builds spatial index and returns nearest records', async () => {
    const service = new LocationIndexService(config);

    await service.initIndex();
    const results = await service.findNearest(1.1, 1.1, 2);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Alpha');
    expect(results[1].name).toBe('Beta');
    expect(results[0].distanceMeters).toBeLessThan(results[1].distanceMeters);
  });

  it('falls back to linear search when index is unavailable', async () => {
    const service = new LocationIndexService(config);

    await service.initIndex();
    (service as unknown as { index: null }).index = null;

    const results = await service.findNearest(-9.5, 121, 1);
    expect(results[0].name).toBe('Gamma');
  });
});

