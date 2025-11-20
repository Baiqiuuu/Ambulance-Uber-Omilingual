export interface LocationRecord {
  id: string;
  name: string;
  level: string | null;
  latitude: number;
  longitude: number;
  iso639P3code: string | null;
  countryIds: string[];
  metadata: Record<string, string>;
}

export interface NearestLocationResult extends LocationRecord {
  distanceMeters: number;
}

export interface LocationIndexStats {
  sourcePath: string;
  totalRows: number;
  indexedRows: number;
  skippedRows: number;
  buildDurationMs: number;
  lastLoadedAt: Date;
  usingSpatialIndex: boolean;
}

