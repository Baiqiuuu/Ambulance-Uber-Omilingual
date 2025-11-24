'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import MapGL, { Marker, MapLayerMouseEvent } from 'react-map-gl';
import { io } from 'socket.io-client';
import 'mapbox-gl/dist/mapbox-gl.css';

type Vehicle = { id: string; lat: number; lng: number };
type NearestLocation = {
  id: string;
  name: string;
  level: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

export default function Home() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [clickedCoord, setClickedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [nearest, setNearest] = useState<NearestLocation[] | null>(null);
  const [nearestLoading, setNearestLoading] = useState(false);
  const [nearestError, setNearestError] = useState<string | null>(null);
  
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_BASE!, { transports: ['websocket'] });
    
    socket.on('vehicle:telemetry', (v: Vehicle) => {
      setVehicles(prev => {
        const m = new Map(prev.map(x => [x.id, x]));
        m.set(v.id, v);
        return Array.from(m.values());
      });
    });
    
    return () => socket.close();
  }, []);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
  }, []);
  
  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    const { lngLat } = event;
    setClickedCoord({ lat: lngLat.lat, lng: lngLat.lng });
  }, []);

  useEffect(() => {
    if (!clickedCoord) {
      setNearest(null);
      setNearestError(null);
      return;
    }

    const controller = new AbortController();
    const fetchNearest = async () => {
      setNearestLoading(true);
      setNearestError(null);
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, '') ?? '';
        const params = new URLSearchParams({
          lat: clickedCoord.lat.toString(),
          lng: clickedCoord.lng.toString(),
          limit: '5',
        });
        const res = await fetch(`${base}/api/locations/nearest?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }

        const payload = await res.json();
        setNearest(payload.data);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setNearestError((error as Error).message || 'Query failed');
          setNearest(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setNearestLoading(false);
        }
      }
    };

    fetchNearest();
    return () => controller.abort();
  }, [clickedCoord]);

  const formatDistance = useCallback((value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)} km`;
    }
    return `${value} m`;
  }, []);

  const hasNearestData = useMemo(() => nearest && nearest.length > 0, [nearest]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <h2 className="text-xl font-bold text-red-600 mb-4">Mapbox Token Missing</h2>
          <p className="text-gray-700 mb-4">
            Please create a <code className="bg-gray-100 px-2 py-1 rounded text-sm">.env</code> file in the project root directory and set <code className="bg-gray-100 px-2 py-1 rounded text-sm">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
          </p>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Steps:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Copy <code className="bg-gray-100 px-1 rounded">.env.example</code> file to <code className="bg-gray-100 px-1 rounded">.env</code></li>
              <li>Visit <a href="https://account.mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mapbox account page</a></li>
              <li>Login or register an account</li>
              <li>Get your token from the "Access tokens" section</li>
              <li>Paste the token into the <code className="bg-gray-100 px-1 rounded">.env</code> file</li>
              <li>Restart the development server</li>
            </ol>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Tip: You can refer to the <code className="bg-gray-100 px-1 rounded">SETUP.md</code> file for more help.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative">
      <MapGL
        initialViewState={{ longitude: -75.16, latitude: 39.95, zoom: 12 }}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        reuseMaps
      >
        {mapLoaded && vehicles.map(v => (
          <Marker key={v.id} longitude={v.lng} latitude={v.lat}>
            <div className="bg-red-600 text-white text-xs px-1 rounded">🚑 {v.id}</div>
          </Marker>
        ))}
        {clickedCoord && (
          <Marker longitude={clickedCoord.lng} latitude={clickedCoord.lat}>
            <div className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-md" />
          </Marker>
        )}
        {hasNearestData &&
          nearest!.map(location => (
            <Marker key={location.id} longitude={location.longitude} latitude={location.latitude}>
              <div className="bg-blue-600/80 text-white text-[10px] px-1 rounded">{location.name}</div>
            </Marker>
          ))}
      </MapGL>
      <div className="absolute left-4 bottom-4 bg-white/90 backdrop-blur-sm rounded-md shadow-lg px-3 py-2 text-xs text-gray-800 pointer-events-none">
        <div className="text-[0.65rem] uppercase tracking-wide text-gray-500 mb-1 font-semibold">Clicked Coordinates</div>
        <div>Lat: {clickedCoord ? clickedCoord.lat.toFixed(5) : '--.--'}</div>
        <div>Lng: {clickedCoord ? clickedCoord.lng.toFixed(5) : '--.--'}</div>
      </div>
      <div className="absolute right-4 top-4 w-64 max-h-[70vh] overflow-hidden flex flex-col bg-white/95 backdrop-blur rounded-xl shadow-xl border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nearby Language Points</p>
          {clickedCoord ? (
            <p className="text-sm text-gray-700 mt-1">
              Lat {clickedCoord.lat.toFixed(3)}, Lng {clickedCoord.lng.toFixed(3)}
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-1">Click on map to query</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm text-gray-800">
          {!clickedCoord && <p className="text-gray-500">No coordinates selected yet.</p>}
          {clickedCoord && nearestLoading && <p className="text-blue-600">Loading...</p>}
          {clickedCoord && nearestError && (
            <p className="text-red-500 text-sm">Query failed: {nearestError}</p>
          )}
          {clickedCoord && !nearestLoading && !nearestError && hasNearestData && (
            <ul className="space-y-2">
              {nearest!.map((location, idx) => (
                <li
                  key={location.id}
                  className="border border-gray-100 rounded-lg px-3 py-2 hover:border-blue-200 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 truncate">{location.name}</span>
                    <span className="text-xs text-gray-500">#{idx + 1}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">{formatDistance(location.distanceMeters)}</div>
                  {location.level && (
                    <div className="mt-0.5 text-xs text-gray-400 uppercase tracking-wide">{location.level}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {clickedCoord && !nearestLoading && !nearestError && !hasNearestData && (
            <p className="text-gray-500">No data available near this location.</p>
          )}
        </div>
      </div>
    </div>
  );
}


