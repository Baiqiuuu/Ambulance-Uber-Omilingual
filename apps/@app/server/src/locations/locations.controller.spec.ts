import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { join } from 'node:path';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationIndexService } from './location-index.service';

const fixturePath = join(__dirname, '../../test/fixtures/locations-sample.csv');

describe('LocationsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [LocationsController],
      providers: [
        LocationsService,
        LocationIndexService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'LOCATION_CSV_PATH') {
                return fixturePath;
              }
              return undefined;
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns nearest locations for valid query', async () => {
    const response = await request(app.getHttpServer()).get('/api/locations/nearest?lat=1&lng=1');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Alpha');
    expect(response.body.meta.totalIndexed).toBeGreaterThan(0);
  });

  it('validates query params', async () => {
    const response = await request(app.getHttpServer()).get('/api/locations/nearest?lat=200&lng=10');

    expect(response.status).toBe(400);
    expect(response.body.message).toBeDefined();
  });
});

