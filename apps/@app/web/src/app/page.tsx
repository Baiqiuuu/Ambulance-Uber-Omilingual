'use client';

import { useEffect, useState, useCallback } from 'react';
import MapGL, { Marker } from 'react-map-gl';
import { io } from 'socket.io-client';
import 'mapbox-gl/dist/mapbox-gl.css';

type Vehicle = { id: string; lat: number; lng: number };

export default function Home() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  
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

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <h2 className="text-xl font-bold text-red-600 mb-4">Mapbox Token 缺失</h2>
          <p className="text-gray-700 mb-4">
            请在项目根目录创建 <code className="bg-gray-100 px-2 py-1 rounded text-sm">.env</code> 文件并设置 <code className="bg-gray-100 px-2 py-1 rounded text-sm">NEXT_PUBLIC_MAPBOX_TOKEN</code>。
          </p>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>步骤：</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>复制 <code className="bg-gray-100 px-1 rounded">.env.example</code> 文件为 <code className="bg-gray-100 px-1 rounded">.env</code></li>
              <li>访问 <a href="https://account.mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mapbox 账户页面</a></li>
              <li>登录或注册账号</li>
              <li>在 "Access tokens" 部分获取你的 token</li>
              <li>将 token 粘贴到 <code className="bg-gray-100 px-1 rounded">.env</code> 文件中</li>
              <li>重启开发服务器</li>
            </ol>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              提示：你可以参考 <code className="bg-gray-100 px-1 rounded">SETUP.md</code> 文件获取更多帮助。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <MapGL
        initialViewState={{ longitude: -75.16, latitude: 39.95, zoom: 12 }}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
        reuseMaps
      >
        {mapLoaded && vehicles.map(v => (
          <Marker key={v.id} longitude={v.lng} latitude={v.lat}>
            <div className="bg-red-600 text-white text-xs px-1 rounded">🚑 {v.id}</div>
          </Marker>
        ))}
      </MapGL>
    </div>
  );
}


