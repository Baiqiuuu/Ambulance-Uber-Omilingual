import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse, ParserOptionsArgs } from 'fast-csv';
import * as geokdbush from 'geokdbush';
import KDBush = require('kdbush');
import { createReadStream, promises as fs } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { LocationIndexStats, LocationRecord, NearestLocationResult } from './location.types';

interface CsvRow extends Record<string, string> {
  latitude?: string;
  longitude?: string;
}

const EARTH_RADIUS_METERS = 6371000;

@Injectable()
export class LocationIndexService implements OnModuleInit {
  private readonly logger = new Logger(LocationIndexService.name);
  private readonly parserOptions: ParserOptionsArgs = {
    headers: true,
    ignoreEmpty: true,
    trim: true,
  };
  private readonly maxNeighbors = 50;

  private records: LocationRecord[] = [];
  private index: KDBush | null = null;
  private stats: LocationIndexStats | null = null;
  private loadingPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.initIndex();
    } catch (error) {
      this.logger.error('初始化地理索引失败', error as Error);
      throw error;
    }
  }

  async initIndex(): Promise<void> {
    await this.ensureReady();
  }

  async findNearest(lat: number, lng: number, limit = 1): Promise<NearestLocationResult[]> {
    await this.ensureReady();

    if (!this.records.length) {
      return [];
    }

    const neighbors = Math.min(Math.max(Math.floor(limit) || 1, 1), this.maxNeighbors);
    const normalizedLat = this.clamp(lat, -90, 90);
    const normalizedLng = this.normalizeLng(lng);

    if (this.index) {
      const results = geokdbush.around(this.index, normalizedLng, normalizedLat, neighbors);
      return results.map((record) => this.withDistance(record, normalizedLat, normalizedLng));
    }

    this.logger.warn('Spatial index unavailable, falling back to linear scan');
    return this.linearNearest(normalizedLat, normalizedLng, neighbors);
  }

  getStats(): LocationIndexStats | null {
    return this.stats;
  }

  private async ensureReady(): Promise<void> {
    if (this.records.length) {
      return;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.buildIndex().finally(() => {
        this.loadingPromise = null;
      });
    }

    await this.loadingPromise;
  }

  private async buildIndex(): Promise<void> {
    const csvPath = await this.resolveCsvPath();
    const startedAt = performance.now();

    const rows: LocationRecord[] = [];
    let totalRows = 0;
    let skippedRows = 0;

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const csvStream = parse(this.parserOptions)
        .on('error', (error) => rejectPromise(error))
        .on('data', (row: CsvRow) => {
          totalRows += 1;
          const parsed = this.toLocationRecord(row);

          if (!parsed) {
            skippedRows += 1;
            return;
          }

          rows.push(parsed);
        })
        .on('end', () => resolvePromise());

      createReadStream(csvPath).on('error', (error) => rejectPromise(error)).pipe(csvStream);
    });

    this.records = rows;

    try {
      this.index = new KDBush(rows, (record) => record.longitude, (record) => record.latitude, 64);
    } catch (error) {
      this.index = null;
      this.logger.error('构建空间索引失败，系统将退化为线性搜索', error as Error);
    }

    const elapsed = performance.now() - startedAt;
    this.stats = {
      sourcePath: csvPath,
      totalRows,
      indexedRows: rows.length,
      skippedRows,
      buildDurationMs: Math.round(elapsed),
      lastLoadedAt: new Date(),
      usingSpatialIndex: !!this.index,
    };

    this.logger.log(
      `已加载 ${rows.length} 个地理点，耗时 ${this.stats.buildDurationMs}ms（跳过 ${skippedRows} 行）`,
    );
  }

  private async resolveCsvPath(): Promise<string> {
    const configuredPath = this.configService.get<string>('LOCATION_CSV_PATH');
    const candidates = [
      configuredPath && resolve(configuredPath),
      resolve(process.cwd(), 'languoid.csv'),
      resolve(process.cwd(), '../../languoid.csv'),
      resolve(__dirname, '../../../../../languoid.csv'),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // continue
      }
    }

    throw new Error(
      `未能定位 CSV 数据源，请通过 LOCATION_CSV_PATH 指定文件。尝试路径：${candidates.join(', ')}`,
    );
  }

  private toLocationRecord(row: CsvRow): LocationRecord | null {
    const latitude = this.safeNumber(row.latitude);
    const longitude = this.safeNumber(row.longitude);

    if (latitude === null || longitude === null) {
      return null;
    }

    return {
      id: row.id ?? '',
      name: row.name ?? '',
      level: row.level ?? null,
      latitude,
      longitude,
      iso639P3code: row.iso639P3code ?? null,
      countryIds: this.parseCountryIds(row.country_ids),
      metadata: { ...row },
    };
  }

  private parseCountryIds(raw?: string): string[] {
    if (!raw) {
      return [];
    }

    return raw
      .split(/[;,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private safeNumber(value?: string): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private withDistance(record: LocationRecord, lat: number, lng: number): NearestLocationResult {
    return {
      ...record,
      distanceMeters: this.computeDistance(lat, lng, record.latitude, record.longitude),
    };
  }

  private linearNearest(lat: number, lng: number, limit: number): NearestLocationResult[] {
    return [...this.records]
      .map((record) => this.withDistance(record, lat, lng))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);
  }

  private computeDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(EARTH_RADIUS_METERS * c);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private normalizeLng(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const normalized = ((value + 180) % 360) - 180;
    return normalized < -180 ? normalized + 360 : normalized;
  }
}

