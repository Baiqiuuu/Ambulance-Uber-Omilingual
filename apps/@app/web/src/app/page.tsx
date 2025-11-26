'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import MapGL, { Marker, MapLayerMouseEvent, Source, Layer } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import type { Map as MapboxMap, CustomLayerInterface } from 'mapbox-gl';
import mapboxgl from 'mapbox-gl';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import 'mapbox-gl/dist/mapbox-gl.css';

type NearestLocation = {
  id: string;
  name: string;
  level: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};
type Vehicle = { id: string; lat: number; lng: number; status?: string; name?: string };
type Coordinate = { id: string; lat: number; lng: number };
type SharedLocation = { id: string; lat: number; lng: number; message?: string };
type MedicalVehicle = {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  status: 'vacant' | 'on_duty';
  lastUpdate?: string;
};

type ViewMode = 'user' | 'medical';
type AED = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  building?: string;
  floor?: string;
  description?: string;
  accessType: string;
  status: string;
};

type MapStyle = 'satellite' | 'street';

const MAP_STYLES: Record<MapStyle, string> = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  street: 'mapbox://styles/mapbox/streets-v12',
};

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('user');

  // Update ref when viewMode changes
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [medicalVehicles, setMedicalVehicles] = useState<MedicalVehicle[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [sharedLocation, setSharedLocation] = useState<SharedLocation | null>(null);
  const [aeds, setAeds] = useState<AED[]>([]);
  const [showAEDs, setShowAEDs] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [clickedCoord, setClickedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [nearest, setNearest] = useState<NearestLocation[] | null>(null);
  const [nearestLoading, setNearestLoading] = useState(false);
  const [nearestError, setNearestError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPosition, setSidebarPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Medical mode states
  const [showMedicalPanel, setShowMedicalPanel] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<MedicalVehicle | null>(null);
  const [trackingInterval, setTrackingInterval] = useState<NodeJS.Timeout | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('street');
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showAddCoordinatePanel, setShowAddCoordinatePanel] = useState(false);
  const [shareLat, setShareLat] = useState('');
  const [shareLng, setShareLng] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [newCoordLat, setNewCoordLat] = useState('');
  const [newCoordLng, setNewCoordLng] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [isPositionLocked, setIsPositionLocked] = useState(false);

  // New states for renaming and map picking
  const [registerName, setRegisterName] = useState('');
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Language detection states
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const mapRef = useRef<MapRef>(null);
  const modelLoadedRef = useRef(false);
  const socketRef = useRef<any>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const viewModeRef = useRef<ViewMode>('user');

  // Ref for A1 movement step state
  const a1StepRef = useRef(0);

  // Find A1 ID to trigger effect only when A1 is created/deleted
  const a1Id = useMemo(() => vehicles.find(v => v.name === 'A1')?.id, [vehicles]);

  // Effect to handle A1 square movement
  useEffect(() => {
    if (!a1Id) return;

    console.log('🚑 Starting A1 square movement pattern (5s interval)...');

    // Philadelphia City Hall Center
    const centerLat = 39.9526;
    const centerLng = -75.1652;
    const offset = 0.005; // Square size

    const interval = setInterval(async () => {
      const step = a1StepRef.current;
      let newLat = centerLat;
      let newLng = centerLng;

      // Square pattern: TL -> TR -> BR -> BL
      switch (step % 4) {
        case 0: // Top Left
          newLat += offset;
          newLng -= offset;
          break;
        case 1: // Top Right
          newLat += offset;
          newLng += offset;
          break;
        case 2: // Bottom Right
          newLat -= offset;
          newLng += offset;
          break;
        case 3: // Bottom Left
          newLat -= offset;
          newLng -= offset;
          break;
      }

      // Add randomness (jitter)
      newLat += (Math.random() - 0.5) * 0.002;
      newLng += (Math.random() - 0.5) * 0.002;

      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
        await fetch(`${apiBase}/api/medical/vehicles/${a1Id}/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: newLat,
            longitude: newLng,
          }),
        });
      } catch (error) {
        console.error('Failed to move A1:', error);
      }

      a1StepRef.current++;
    }, 5000);

    return () => {
      console.log('🚑 Stopping A1 movement.');
      clearInterval(interval);
    };
  }, [a1Id]);

  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE || 'http://localhost:4000';
    console.log('Connecting to WebSocket server:', wsBase);
    const socket = io(wsBase, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected successfully');
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection failed:', error);
    });

    socket.on('vehicle:telemetry', (v: Vehicle) => {
      console.log('Received vehicle data:', v);

      // Show all vehicles in both modes
      setVehicles(prev => {
        const existing = prev.find(x => x.id === v.id);
        // If position hasn't changed significantly, don't update (avoid unnecessary re-renders)
        // BUT if name or status changed, we MUST update
        if (existing &&
          Math.abs(existing.lat - v.lat) < 0.000001 &&
          Math.abs(existing.lng - v.lng) < 0.000001 &&
          existing.status === v.status &&
          existing.name === v.name) {
          return prev; // No change, return previous state
        }

        const m = new Map(prev.map(x => [x.id, x]));
        m.set(v.id, v);
        const newVehicles = Array.from(m.values());
        vehiclesRef.current = newVehicles; // Update ref with latest vehicles
        console.log('Current vehicle list:', newVehicles);
        return newVehicles;
      });
    });

    socket.on('location:shared', (data: SharedLocation) => {
      console.log('Received shared location:', data);
      setSharedLocation(data);
    });

    return () => {
      socket.close();
    };
  }, [viewMode]);

  // Fetch medical vehicles when in medical mode
  useEffect(() => {
    if (viewMode === 'medical') {
      const fetchMedicalVehicles = async () => {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
          const response = await fetch(`${apiBase}/api/medical/vehicles`);
          const result = await response.json();
          if (result.success) {
            setMedicalVehicles(result.vehicles || []);
            console.log(`Loaded ${result.vehicles?.length || 0} medical vehicles`);
          }
        } catch (error) {
          console.error('Failed to fetch medical vehicles:', error);
        }
      };

      fetchMedicalVehicles();
      // Refresh every 5 seconds
      const interval = setInterval(fetchMedicalVehicles, 5000);
      return () => clearInterval(interval);
    } else {
      // Stop tracking when switching to user mode
      if (trackingInterval) {
        clearInterval(trackingInterval);
        setTrackingInterval(null);
        setSelectedVehicle(null);
      }
      setIsPickingLocation(false); // Reset picking mode
    }
  }, [viewMode, trackingInterval]);

  // Fetch AEDs from API
  useEffect(() => {
    const fetchAEDs = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
        const map = mapRef.current?.getMap();

        if (map && mapLoaded) {
          const center = map.getCenter();
          // Fetch AEDs within 10km radius of map center
          const response = await fetch(
            `${apiBase}/api/aed?lat=${center.lat}&lng=${center.lng}&radius=10`
          );
          const result = await response.json();
          if (result.success) {
            setAeds(result.aeds || []);
            console.log(`Loaded ${result.aeds?.length || 0} AEDs`);
          }
        } else {
          // If map not loaded, fetch all AEDs
          const response = await fetch(`${apiBase}/api/aed`);
          const result = await response.json();
          if (result.success) {
            setAeds(result.aeds || []);
            console.log(`Loaded ${result.aeds?.length || 0} AEDs`);
          }
        }
      } catch (error) {
        console.error('Failed to fetch AEDs:', error);
      }
    };

    fetchAEDs();

    // Refresh AEDs when map moves (debounced)
    const map = mapRef.current?.getMap();
    if (map && mapLoaded) {
      const handleMoveEnd = () => {
        const center = map.getCenter();
        fetchAEDs();
      };

      map.on('moveend', handleMoveEnd);

      return () => {
        map.off('moveend', handleMoveEnd);
      };
    }
  }, [mapLoaded]);

  // Share location to server
  const shareLocation = useCallback(async (lat: number, lng: number, message?: string, vehicleId = 'SHARED-1') => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
      const response = await fetch(`${apiBase}/api/share-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lat,
          lng,
          vehicleId,
          message,
        }),
      });

      const result = await response.json();
      if (result.success) {
        console.log('Location shared successfully:', result);
      }
    } catch (error) {
      console.error('Failed to share location:', error);
    }
  }, []);

  // Read location from URL parameters (for mobile sharing)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const lat = params.get('lat');
      const lng = params.get('lng');
      const message = params.get('message');

      if (lat && lng) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (!isNaN(latNum) && !isNaN(lngNum)) {
          shareLocation(latNum, lngNum, message || undefined);
          // Clear URL parameters
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    }
  }, [shareLocation]);

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setShareLat(latitude.toFixed(6));
          setShareLng(longitude.toFixed(6));
          shareLocation(latitude, longitude, shareMessage || undefined);
        },
        (error) => {
          console.error('Failed to get location:', error);
          alert('Unable to get current location. Please check browser permission settings.');
        }
      );
    } else {
      alert('Your browser does not support geolocation');
    }
  };

  // Manual share location
  const handleManualShare = () => {
    const lat = parseFloat(shareLat);
    const lng = parseFloat(shareLng);

    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid coordinates');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert('Coordinates out of valid range');
      return;
    }

    shareLocation(lat, lng, shareMessage || undefined);
    setShowSharePanel(false);
    setShareLat('');
    setShareLng('');
    setShareMessage('');
  };

  // Add new coordinate
  const handleAddCoordinate = () => {
    const lat = parseFloat(newCoordLat);
    const lng = parseFloat(newCoordLng);

    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid coordinates');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert('Coordinates out of valid range');
      return;
    }

    const newId = `COORD-${Date.now()}`;
    setCoordinates(prev => [...prev, { id: newId, lat, lng }]);
    setShowAddCoordinatePanel(false);
    setNewCoordLat('');
    setNewCoordLng('');
  };

  // Medical mode functions
  const registerAmbulance = useCallback(async (lat?: number, lng?: number) => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
      let finalLat = lat;
      let finalLng = lng;

      // If no coords provided, try to get current location
      if (!finalLat || !finalLng) {
        if (!navigator.geolocation) {
          alert('Your browser does not support geolocation');
          return;
        }

        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              finalLat = position.coords.latitude;
              finalLng = position.coords.longitude;
              resolve();
            },
            (error) => {
              console.error('Failed to get location:', error);
              alert('Unable to get current location. Please check browser permission settings.');
              reject(error);
            }
          );
        });
      }

      if (finalLat && finalLng) {
        const response = await fetch(`${apiBase}/api/medical/vehicles/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: registerName || undefined,
            latitude: finalLat,
            longitude: finalLng,
            status: 'vacant',
          }),
        });

        const result = await response.json();
        if (result.success) {
          alert(`Ambulance registered successfully! Name: ${result.vehicle.name}`);
          setRegisterName(''); // Clear name input
          setIsPickingLocation(false); // Exit picking mode
          // Refresh vehicle list
          const vehiclesResponse = await fetch(`${apiBase}/api/medical/vehicles`);
          const vehiclesResult = await vehiclesResponse.json();
          if (vehiclesResult.success) {
            setMedicalVehicles(vehiclesResult.vehicles || []);
          }
        } else {
          alert(`Failed to register ambulance: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('Failed to register ambulance:', error);
      // Don't alert if it was just a rejection from the geolocation promise wrapper
    }
  }, [registerName]);

  const updateVehicleLocation = useCallback(async (vehicleId: string) => {
    if (!navigator.geolocation) {
      alert('Your browser does not support geolocation');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
          const response = await fetch(`${apiBase}/api/medical/vehicles/${vehicleId}/location`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
          });

          const result = await response.json();
          if (result.success) {
            console.log('Location updated successfully');
            // Refresh vehicle list
            const vehiclesResponse = await fetch(`${apiBase}/api/medical/vehicles`);
            const vehiclesResult = await vehiclesResponse.json();
            if (vehiclesResult.success) {
              setMedicalVehicles(vehiclesResult.vehicles || []);
            }
          }
        } catch (error) {
          console.error('Failed to update location:', error);
        }
      },
      (error) => {
        console.error('Failed to get location:', error);
      }
    );
  }, []);

  const updateVehicleStatus = useCallback(async (vehicleId: string, status: 'vacant' | 'on_duty') => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
      const response = await fetch(`${apiBase}/api/medical/vehicles/${vehicleId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const result = await response.json();
      if (result.success) {
        // Refresh vehicle list
        const vehiclesResponse = await fetch(`${apiBase}/api/medical/vehicles`);
        const vehiclesResult = await vehiclesResponse.json();
        if (vehiclesResult.success) {
          setMedicalVehicles(vehiclesResult.vehicles || []);
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }, []);

  // Update Vehicle Name
  const updateVehicleName = useCallback(async (vehicleId: string, newName: string) => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
      const response = await fetch(`${apiBase}/api/medical/vehicles/${vehicleId}/name`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      });

      const result = await response.json();
      if (result.success) {
        setEditingVehicleId(null);
        setEditName('');
        // Refresh vehicle list
        const vehiclesResponse = await fetch(`${apiBase}/api/medical/vehicles`);
        const vehiclesResult = await vehiclesResponse.json();
        if (vehiclesResult.success) {
          setMedicalVehicles(vehiclesResult.vehicles || []);
        }
      } else {
        alert(`Failed to update name: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to update name:', error);
    }
  }, []);

  const startTracking = useCallback((vehicleId: string) => {
    // Stop existing tracking if any
    if (trackingInterval) {
      clearInterval(trackingInterval);
    }

    // Update location immediately
    updateVehicleLocation(vehicleId);

    // Set up interval to update every 5 seconds
    const interval = setInterval(() => {
      updateVehicleLocation(vehicleId);
    }, 5000);

    setTrackingInterval(interval);
    setSelectedVehicle(medicalVehicles.find(v => v.id === vehicleId) || null);
  }, [trackingInterval, medicalVehicles, updateVehicleLocation]);

  const stopTracking = useCallback(() => {
    if (trackingInterval) {
      clearInterval(trackingInterval);
      setTrackingInterval(null);
    }
    setSelectedVehicle(null);
  }, [trackingInterval]);

  const deleteVehicle = useCallback(async (vehicleId: string) => {
    if (!confirm('Are you sure you want to delete this ambulance?')) {
      return;
    }

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
      const response = await fetch(`${apiBase}/api/medical/vehicles/${vehicleId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (result.success) {
        // Remove from local state
        setMedicalVehicles(prev => prev.filter(v => v.id !== vehicleId));
        setVehicles(prev => prev.filter(v => v.id !== vehicleId));

        // Stop tracking if this vehicle was being tracked
        if (selectedVehicle?.id === vehicleId) {
          stopTracking();
        }

        alert('Ambulance deleted successfully');
      } else {
        alert(`Failed to delete ambulance: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to delete vehicle:', error);
      alert('Failed to delete ambulance. Please try again.');
    }
  }, [selectedVehicle, stopTracking]);

  // Initialize Demo Fleet
  const initializeDemoFleet = useCallback(async () => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

    // Philadelphia center (City Hall)
    const centerLat = 39.9526;
    const centerLng = -75.1652;
    const radius = 0.04; // Roughly 4-5km spread

    // Helper to get random coordinate nearby
    const getRandomCoord = (center: number, spread: number) => {
      return center + (Math.random() - 0.5) * spread;
    };

    const demoVehicles = [
      { name: 'A1', lat: getRandomCoord(centerLat, radius), lng: getRandomCoord(centerLng, radius), status: 'vacant' },
      { name: 'A2', lat: getRandomCoord(centerLat, radius), lng: getRandomCoord(centerLng, radius), status: 'vacant' },
      { name: 'A3', lat: getRandomCoord(centerLat, radius), lng: getRandomCoord(centerLng, radius), status: 'vacant' },
    ];

    // Check if they already exist to avoid duplicates
    const existingNames = new Set(medicalVehicles.map(v => v.name));

    let count = 0;
    for (const v of demoVehicles) {
      if (!existingNames.has(v.name)) {
        try {
          await fetch(`${apiBase}/api/medical/vehicles/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: v.name,
              latitude: v.lat,
              longitude: v.lng,
              status: v.status
            }),
          });
          count++;
        } catch (e) {
          console.error('Failed to seed vehicle', v.name, e);
        }
      }
    }

    if (count > 0) {
      alert(`Initialized ${count} new demo vehicles (A1, A2, A3) at random locations in Philadelphia.`);
    } else {
      alert('Demo vehicles (A1, A2, A3) already exist.');
    }

    // Refresh list
    const vehiclesResponse = await fetch(`${apiBase}/api/medical/vehicles`);
    const vehiclesResult = await vehiclesResponse.json();
    if (vehiclesResult.success) {
      setMedicalVehicles(vehiclesResult.vehicles || []);
    }
  }, [medicalVehicles]);

  // Generate share link
  const generateShareLink = (lat: number, lng: number, message?: string) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString() });
    if (message) {
      params.set('message', message);
    }
    return `${baseUrl}?${params.toString()}`;
  };

  // Generate paths from all vehicles and coordinates to shared location
  const generatePaths = useCallback(() => {
    if (!sharedLocation) return null;

    const allPoints: Array<{ lat: number; lng: number }> = [
      ...vehicles.map(v => ({ lat: v.lat, lng: v.lng })),
      ...coordinates.map(c => ({ lat: c.lat, lng: c.lng })),
    ];

    if (allPoints.length === 0) return null;

    const paths = allPoints.map(point => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [point.lng, point.lat],
          [sharedLocation.lng, sharedLocation.lat],
        ],
      },
    }));

    return {
      type: 'FeatureCollection' as const,
      features: paths,
    };
  }, [vehicles, coordinates, sharedLocation]);

  const pathsData = generatePaths();

  // Calculate nearest OR tracked ambulance distance
  // If a vehicle is selected/tracked, we show that one. Otherwise nearest available.
  const displayedAmbulance = useMemo(() => {
    if (!clickedCoord || vehicles.length === 0) return null;

    // If we have a selected vehicle being tracked (locked), find it in the current vehicles list
    if (selectedVehicle) {
      const tracked = vehicles.find(v => v.id === selectedVehicle.id);
      if (tracked) {
        const dist = getDistanceFromLatLonInKm(clickedCoord.lat, clickedCoord.lng, tracked.lat, tracked.lng);
        return { ...tracked, distance: dist, type: 'tracked' };
      }
    }

    // Otherwise find nearest VACANT vehicle
    const availableVehicles = vehicles.filter(v => v.status === 'vacant');

    let minDist = Infinity;
    let closest = null;

    availableVehicles.forEach(v => {
      const dist = getDistanceFromLatLonInKm(clickedCoord.lat, clickedCoord.lng, v.lat, v.lng);
      if (dist < minDist) {
        minDist = dist;
        closest = { ...v, distance: dist, type: 'nearest' };
      }
    });

    return closest;
  }, [clickedCoord, vehicles, selectedVehicle]);

  // Add 3D buildings layer helper function
  const add3DBuildings = useCallback((map: MapboxMap) => {
    // Check if 3D buildings layer already exists
    if (map.getLayer('3d-buildings')) {
      return;
    }

    // Add 3D buildings layer
    const layers = map.getStyle().layers;
    if (layers) {
      // Find label layer, insert 3D buildings after it
      const labelLayerId = layers.find(
        (layer) => layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout
      )?.id;

      if (labelLayerId && map.getSource('composite')) {
        map.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              15,
              ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              15,
              ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.6
          }
        }, labelLayerId);
      }
    }
  }, []);

  // Use useRef to store layer-related variables to avoid closure issues
  const layerRef = useRef<{
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    model?: THREE.Group | null;
    modelInstances: THREE.Group[];
    map?: MapboxMap;
    testOriginObject?: THREE.Mesh;
  }>({ modelInstances: [] });

  // 3D model layer disabled - using 2D markers instead
  // Use useEffect to add 3D model layer
  useEffect(() => {
    // DISABLED: 3D model layer - using 2D markers instead
    return;
  }, [mapLoaded, mapStyle]); // Remove vehicles from dependencies to prevent layer recreation

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    // Ensure map uses mercator projection (required for custom layers)
    const map = mapRef.current?.getMap();
    if (map) {
      // Force mercator projection if not already set
      try {
        const currentProjection = (map as any).getProjection?.();
        if (currentProjection && currentProjection.name !== 'mercator') {
          console.warn('Map projection is not mercator, custom layer may not work correctly');
        }
      } catch (e) {
        // Projection API might not be available in all versions
      }
    }
  }, []);

  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    const { lngLat } = event;

    if (isPickingLocation) {
      // In picking mode, register ambulance at location
      registerAmbulance(lngLat.lat, lngLat.lng);
    } else {
      // Normal mode: set clicked coord for query
      setClickedCoord({ lat: lngLat.lat, lng: lngLat.lng });
    }
  }, [isPickingLocation, registerAmbulance]);

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
    return `${value.toFixed(0)} m`;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (sidebarRef.current) {
      e.preventDefault();
      setIsDragging(true);
      const rect = sidebarRef.current.getBoundingClientRect();
      // Get current position (either from state or from current rect position)
      const currentX = sidebarPosition?.x ?? rect.left;
      const currentY = sidebarPosition?.y ?? rect.top;
      setDragStart({
        x: e.clientX - currentX,
        y: e.clientY - currentY,
      });
    }
  }, [sidebarPosition]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && sidebarRef.current) {
        const sidebarWidth = sidebarCollapsed ? 48 : 256;
        const sidebarHeight = sidebarRef.current.offsetHeight;

        // Calculate new position relative to viewport
        const newLeft = e.clientX - dragStart.x;
        const newTop = e.clientY - dragStart.y;

        // Constrain to viewport bounds
        const maxLeft = window.innerWidth - sidebarWidth - 16;
        const maxTop = window.innerHeight - Math.min(sidebarHeight, window.innerHeight * 0.7) - 16;

        setSidebarPosition({
          x: Math.max(16, Math.min(newLeft, maxLeft)),
          y: Math.max(16, Math.min(newTop, maxTop)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, sidebarCollapsed]);

  const hasNearestData = useMemo(() => nearest && nearest.length > 0, [nearest]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Enable 3D buildings and tilt effect (only for street style)
    if (mapStyle === 'street') {
      // Add 3D buildings layer (if style supports it)
      map.once('style.load', () => {
        add3DBuildings(map);
      });
      // If style already loaded, add directly
      if (map.isStyleLoaded()) {
        add3DBuildings(map);
      }
    }
  }, [mapStyle, add3DBuildings]);

  // Lock/unlock vehicle position
  const toggleVehicleLock = useCallback(async () => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

      if (isPositionLocked) {
        // Unlock
        const response = await fetch(`${apiBase}/api/unlock-vehicle-position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        const result = await response.json();
        if (result.success) {
          setIsPositionLocked(false);
          console.log('Vehicle position unlocked');
        }
      } else {
        // Lock - use current vehicle position if available, otherwise use default
        const currentVehicle = vehicles.length > 0 ? vehicles[0] : null;
        const lat = currentVehicle?.lat || 39.95;
        const lng = currentVehicle?.lng || -75.16;

        const response = await fetch(`${apiBase}/api/lock-vehicle-position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lat, lng }),
        });
        const result = await response.json();
        if (result.success) {
          setIsPositionLocked(true);
          console.log('Vehicle position locked at:', result.position);
        }
      }
    } catch (error) {
      console.error('Failed to toggle vehicle lock:', error);
    }
  }, [isPositionLocked, vehicles]);

  const handleMapStyleChange = useCallback((newStyle: MapStyle) => {
    setMapStyle(newStyle);
    const map = mapRef.current?.getMap();
    if (map) {
      map.setStyle(MAP_STYLES[newStyle]);

      // Listen for style load completion event
      map.once('style.load', () => {
        // Adjust view and add 3D buildings based on style
        if (newStyle === 'street') {
          // Street style: use 3D view and add 3D buildings
          map.easeTo({ pitch: 45, duration: 500 });
          add3DBuildings(map);
        } else {
          // Satellite style: use flat view, remove 3D buildings
          map.easeTo({ pitch: 0, duration: 500 });
          if (map.getLayer('3d-buildings')) {
            map.removeLayer('3d-buildings');
          }
        }
      });

      // If style already loaded, execute directly
      if (map.isStyleLoaded()) {
        if (newStyle === 'street') {
          map.easeTo({ pitch: 45, duration: 500 });
          add3DBuildings(map);
        } else {
          map.easeTo({ pitch: 0, duration: 500 });
          if (map.getLayer('3d-buildings')) {
            map.removeLayer('3d-buildings');
          }
        }
      }
    }
  }, [add3DBuildings]);

  // Language detection handlers
  const startRecording = async () => {
    try {
      setLanguageError(null);
      setDetectedLanguage(null);
      setTranscribedText(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await detectLanguage(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      setLanguageError('Failed to access microphone. Please grant permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const detectLanguage = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/detect-language', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setDetectedLanguage(result.language);
        setTranscribedText(result.text);
      } else {
        setLanguageError(result.error || 'Failed to detect language');
      }
    } catch (error) {
      console.error('Error detecting language:', error);
      setLanguageError('Failed to detect language. Please try again.');
    }
  };

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
              <li>Get your token in the "Access tokens" section</li>
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
    <div className={`h-screen w-screen relative ${isPickingLocation ? 'cursor-crosshair' : ''}`}>
      <MapGL
        ref={mapRef}
        initialViewState={{
          longitude: -75.16,
          latitude: 39.95,
          zoom: 12,
          pitch: mapStyle === 'street' ? 45 : 0,
          bearing: 0
        }}
        mapboxAccessToken={mapboxToken}
        mapStyle={MAP_STYLES[mapStyle]}
        projection={{ name: 'mercator' }}
        style={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        reuseMaps
      >
        {/* 3D model layer - added directly to map via useEffect */}

        {/* Paths from vehicles and coordinates to shared location */}
        {pathsData && (
          <Source id="paths" type="geojson" data={pathsData}>
            <Layer
              id="paths-layer-glow"
              type="line"
              paint={{
                'line-color': '#00ffff',
                'line-width': 8,
                'line-opacity': 0.4,
                'line-blur': 10,
              }}
            />
            <Layer
              id="paths-layer"
              type="line"
              paint={{
                'line-color': '#00ffff',
                'line-width': 4,
                'line-opacity': 1,
                'line-blur': 1,
              }}
            />
          </Source>
        )}

        {/* Vehicle markers - 2D markers for all vehicles */}
        {/* Show all vehicles in both modes */}
        {mapLoaded && vehicles.length > 0 && vehicles.map(v => (
          <Marker key={v.id} longitude={v.lng} latitude={v.lat}>
            <div className={`group relative flex flex-col items-center transition-transform hover:scale-110 hover:z-50 cursor-pointer`}>
              <div className={`px-3 py-1.5 rounded-full shadow-lg border-2 border-white flex items-center gap-1.5 transition-colors ${v.status === 'on_duty'
                ? 'bg-rose-500 shadow-rose-500/40'
                : 'bg-slate-500 shadow-slate-500/40'
                }`}>
                <span className="text-sm filter drop-shadow-sm">🚑</span>
                <span className="text-white text-xs font-bold tracking-wide">{v.name || v.id.slice(0, 8)}</span>
              </div>
              {v.status && (
                <div className={`absolute -bottom-6 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white/20 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 ${v.status === 'on_duty'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-600 text-white'
                  }`}>
                  {v.status === 'on_duty' ? 'BUSY' : 'VACANT'}
                </div>
              )}
            </div>
          </Marker>
        ))}

        {/* House markers for coordinates */}
        {coordinates.map(coord => (
          <Marker key={coord.id} longitude={coord.lng} latitude={coord.lat}>
            <div className="text-3xl filter drop-shadow-md hover:scale-110 transition-transform cursor-pointer">🏠</div>
          </Marker>
        ))}

        {/* AED markers */}
        {showAEDs && aeds.map(aed => (
          <Marker key={aed.id} longitude={aed.longitude} latitude={aed.latitude}>
            <div className="relative group cursor-pointer">
              <div className="bg-rose-500 w-9 h-9 rounded-full border-2 border-white shadow-xl shadow-rose-500/30 flex items-center justify-center hover:scale-110 hover:bg-rose-600 transition-all duration-300 z-10 relative">
                <span className="text-white text-[10px] font-bold">AED</span>
              </div>
              {/* Pulse effect */}
              <div className="absolute inset-0 rounded-full bg-rose-400 opacity-0 group-hover:animate-ping"></div>

              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-slate-900/10 p-4 border border-white/60 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-20 scale-95 group-hover:scale-100 origin-bottom">
                <div className="text-sm font-bold text-slate-800 mb-1">{aed.name}</div>
                {aed.address && (
                  <div className="text-xs text-slate-500 mb-2 flex items-start gap-1">
                    <span className="mt-0.5">📍</span>
                    <span className="leading-tight">{aed.address}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1 mt-2">
                  {aed.floor && (
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">FL {aed.floor}</span>
                  )}
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">{aed.accessType}</span>
                </div>
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white/95"></div>
              </div>
            </div>
          </Marker>
        ))}
        {clickedCoord && (
          <Marker longitude={clickedCoord.lng} latitude={clickedCoord.lat}>
            <div className="relative">
              <div className="w-4 h-4 rounded-full bg-indigo-500 border-2 border-white shadow-lg z-10 relative"></div>
              <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-75 h-full w-full"></div>
            </div>
          </Marker>
        )}
        {hasNearestData &&
          nearest!.map(location => (
            <Marker key={location.id} longitude={location.longitude} latitude={location.latitude}>
              <div className="bg-white/90 backdrop-blur-sm border border-indigo-100 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-full shadow-sm hover:scale-105 transition-transform cursor-pointer">
                {location.name}
              </div>
            </Marker>
          ))}
        {/* Shared location marker with message */}
        {sharedLocation && (
          <Marker longitude={sharedLocation.lng} latitude={sharedLocation.lat}>
            <div className="relative group">
              <div className="bg-rose-500 w-5 h-5 rounded-full border-2 border-white shadow-lg shadow-rose-500/40 animate-bounce"></div>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-1 bg-black/20 blur-sm rounded-full"></div>
              {sharedLocation.message && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-48 bg-white rounded-2xl shadow-xl p-3 border border-slate-100">
                  <div className="text-sm text-slate-700 font-medium whitespace-pre-wrap break-words text-center">
                    "{sharedLocation.message}"
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                </div>
              )}
            </div>
          </Marker>
        )}
      </MapGL>
      <div className="absolute left-4 bottom-8 bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl shadow-indigo-500/10 px-4 py-3 text-xs text-slate-700 pointer-events-none border border-white/50">
        <div className="text-[0.65rem] uppercase tracking-wider text-indigo-500 mb-1 font-bold">Selected Location</div>
        <div className="font-mono">Lat: {clickedCoord ? clickedCoord.lat.toFixed(5) : '--.--'}</div>
        <div className="font-mono">Lng: {clickedCoord ? clickedCoord.lng.toFixed(5) : '--.--'}</div>
        {isPickingLocation && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <div className="text-xs font-bold text-rose-500 animate-pulse">📍 Picking Location Mode Active</div>
            <div className="text-[10px] text-slate-500">Click on map to place ambulance</div>
          </div>
        )}
      </div>
      <div
        ref={sidebarRef}
        className={`absolute ${sidebarCollapsed ? 'w-14' : 'w-72'} max-h-[70vh] overflow-hidden flex flex-col bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/60 ${isDragging ? 'cursor-grabbing transition-none' : 'cursor-default transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)'} ${!sidebarPosition ? 'left-6 top-6' : ''}`}
        style={{
          left: sidebarPosition ? sidebarPosition.x : undefined,
          top: sidebarPosition ? sidebarPosition.y : undefined,
          right: sidebarPosition ? 'auto' : undefined,
        }}
      >
        <div
          className={`${sidebarCollapsed ? 'px-0 py-4' : 'px-5 py-4'} border-b border-slate-100 cursor-move hover:bg-slate-50/50 transition-colors select-none`}
          onMouseDown={handleMouseDown}
          onClick={(e) => {
            // Only toggle collapse if not dragging
            if (!isDragging && e.detail === 1) {
              const timeSinceMouseDown = Date.now() - (window as any).lastMouseDownTime;
              if (timeSinceMouseDown > 200) {
                setSidebarCollapsed(!sidebarCollapsed);
              }
            }
          }}
          onMouseDownCapture={(e) => {
            (window as any).lastMouseDownTime = Date.now();
          }}
        >
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Nearby Points</p>
                {clickedCoord ? (
                  <p className="text-sm text-slate-700 mt-1 font-medium">
                    {clickedCoord.lat.toFixed(3)}, {clickedCoord.lng.toFixed(3)}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 mt-1">Select location</p>
                )}
              </div>
              <button
                className="ml-2 p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarCollapsed(!sidebarCollapsed);
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full gap-2">
              <button
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarCollapsed(!sidebarCollapsed);
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 text-sm scrollbar-thin scrollbar-thumb-indigo-100 scrollbar-track-transparent">
            {!clickedCoord && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <span className="text-2xl">🗺️</span>
                <p>Click map to explore</p>
              </div>
            )}
            {clickedCoord && nearestLoading && (
              <div className="flex items-center justify-center py-8 text-indigo-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
              </div>
            )}
            {clickedCoord && nearestError && (
              <p className="text-rose-500 text-sm p-4 bg-rose-50 rounded-xl">Query failed: {nearestError}</p>
            )}

            {/* Nearest OR Tracked Ambulance Info */}
            {clickedCoord && displayedAmbulance && (
              <div className={`mb-3 rounded-2xl p-3 border animate-in slide-in-from-bottom-2 duration-500 ${(displayedAmbulance as any).type === 'tracked'
                ? 'bg-violet-50 border-violet-100'
                : 'bg-indigo-50 border-indigo-100'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shadow-sm ${(displayedAmbulance as any).type === 'tracked' ? 'bg-violet-100' : 'bg-indigo-100'
                      }`}>
                      {(displayedAmbulance as any).type === 'tracked' ? '🎯' : '🚑'}
                    </div>
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${(displayedAmbulance as any).type === 'tracked' ? 'text-violet-400' : 'text-indigo-400'
                        }`}>
                        {(displayedAmbulance as any).type === 'tracked' ? 'Tracked Unit' : 'Nearest Unit'}
                      </p>
                      <p className={`text-xs font-bold ${(displayedAmbulance as any).type === 'tracked' ? 'text-violet-900' : 'text-indigo-900'
                        }`}>
                        {displayedAmbulance.name || displayedAmbulance.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold leading-none ${(displayedAmbulance as any).type === 'tracked' ? 'text-violet-600' : 'text-indigo-600'
                      }`}>
                      {formatDistance(displayedAmbulance.distance)}
                    </p>
                    <p className={`text-[10px] font-medium ${(displayedAmbulance as any).type === 'tracked' ? 'text-violet-400' : 'text-indigo-400'
                      }`}>
                      away
                    </p>
                  </div>
                </div>
                <div className={`w-full h-1.5 rounded-full overflow-hidden ${(displayedAmbulance as any).type === 'tracked' ? 'bg-violet-200' : 'bg-indigo-200'
                  }`}>
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${(displayedAmbulance as any).type === 'tracked' ? 'bg-violet-500' : 'bg-indigo-500'
                      }`}
                    style={{ width: `${Math.max(5, 100 - Math.min(100, (displayedAmbulance.distance / 5000) * 100))}%` }}
                  ></div>
                </div>
              </div>
            )}

            {clickedCoord && !nearestLoading && !nearestError && hasNearestData && (
              <ul className="space-y-2 p-2">
                {nearest!.map((location, idx) => (
                  <li
                    key={location.id}
                    className="group relative bg-white border border-slate-100 rounded-xl px-4 py-3 hover:shadow-lg hover:shadow-indigo-500/10 hover:border-indigo-100 transition-all duration-300 cursor-pointer"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800 truncate pr-2">{location.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md">#{idx + 1}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-indigo-500">{formatDistance(location.distanceMeters)}</div>
                      {location.level && (
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium bg-slate-50 px-2 py-0.5 rounded-full">{location.level}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {clickedCoord && !nearestLoading && !nearestError && !hasNearestData && (
              <p className="text-slate-500 text-center py-8">No data available nearby.</p>
            )}
          </div>
        )}
      </div>

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-10">
          <div>Mode: {viewMode === 'medical' ? 'Medical' : 'User'}</div>
          <div>Vehicles: {vehicles.length} (on_duty: {vehicles.filter(v => v.status === 'on_duty').length}, vacant: {vehicles.filter(v => !v.status || v.status === 'vacant').length})</div>
          {viewMode === 'medical' && <div>Medical Vehicles: {medicalVehicles.length}</div>}
          <div>Coordinates: {coordinates.length}</div>
          <div>Map loaded: {mapLoaded ? 'Yes' : 'No'}</div>
          {vehicles.length > 0 && (
            <div className="mt-1">
              {vehicles.map(v => (
                <div key={v.id}>
                  {v.name || v.id.slice(0, 8)}: {v.lat.toFixed(4)}, {v.lng.toFixed(4)} ({v.status || 'unknown'})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View mode toggle button - top left */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setViewMode(viewMode === 'user' ? 'medical' : 'user')}
          className={`px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm ${viewMode === 'medical'
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/30'
            : 'bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 shadow-slate-300/30'
            }`}
        >
          {viewMode === 'medical' ? '🏥 Medical Mode' : '👤 User Mode'}
        </button>
        {viewMode === 'user' && (
          <button
            onClick={toggleVehicleLock}
            className={`px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm ${isPositionLocked
              ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/30'
              : 'bg-amber-400 text-white hover:bg-amber-500 shadow-amber-400/30'
              }`}
          >
            {isPositionLocked ? '🔒 Unlock Vehicle' : '🔓 Lock Vehicle (Test)'}
          </button>
        )}
      </div>

      {/* Map style toggle buttons */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => handleMapStyleChange('street')}
          className={`px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm ${mapStyle === 'street'
            ? 'bg-indigo-600 text-white shadow-indigo-500/30'
            : 'bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 shadow-slate-300/30'
            }`}
        >
          🗺️ Street Map
        </button>
        <button
          onClick={() => handleMapStyleChange('satellite')}
          className={`px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm ${mapStyle === 'satellite'
            ? 'bg-indigo-600 text-white shadow-indigo-500/30'
            : 'bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 shadow-slate-300/30'
            }`}
        >
          🛰️ Satellite Map
        </button>
        {viewMode === 'user' && (
          <button
            onClick={() => setShowSharePanel(!showSharePanel)}
            className="px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/30"
          >
            📍 Share Location
          </button>
        )}
        <button
          onClick={() => setShowAEDs(!showAEDs)}
          className={`px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm ${showAEDs
            ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/30'
            : 'bg-slate-200 text-slate-500 hover:bg-slate-300 shadow-slate-300/30'
            }`}
        >
          {showAEDs ? '❤️ Hide AEDs' : '❤️ Show AEDs'} ({aeds.length})
        </button>
        <button
          onClick={() => setShowLanguageModal(true)}
          className="px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm bg-purple-500 text-white hover:bg-purple-600 shadow-purple-500/30"
        >
          🎤 Detect Language
        </button>
      </div>

      {/* Bottom right buttons - different for each mode */}
      <div className="absolute bottom-8 right-4 z-10 flex flex-col gap-3">
        {viewMode === 'user' ? (
          <button
            onClick={() => setShowAddCoordinatePanel(!showAddCoordinatePanel)}
            className="px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm bg-violet-600 text-white hover:bg-violet-700 shadow-violet-500/30 flex items-center justify-center gap-2"
          >
            <span>➕</span> Add New Coordinate
          </button>
        ) : (
          <button
            onClick={() => setShowMedicalPanel(!showMedicalPanel)}
            className="px-6 py-3 rounded-full shadow-xl font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 backdrop-blur-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/30 flex items-center justify-center gap-2"
          >
            <span>🏥</span> Medical Panel
          </button>
        )}
      </div>

      {/* Location share panel */}
      {showSharePanel && (
        <div className="absolute top-24 right-4 z-10 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-500/10 p-6 w-80 border border-white/60 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-emerald-500">📍</span> Share Location
            </h3>
            <button
              onClick={() => setShowSharePanel(false)}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-all"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <button
              onClick={getCurrentLocation}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span>📱</span> Get Current Location
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-white text-xs font-medium text-slate-400 uppercase tracking-wider">Or Manual</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={shareLat}
                  onChange={(e) => setShareLat(e.target.value)}
                  placeholder="e.g., 39.95"
                  className="w-full px-4 py-3 bg-slate-50 border-0 rounded-2xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={shareLng}
                  onChange={(e) => setShareLng(e.target.value)}
                  placeholder="e.g., -75.16"
                  className="w-full px-4 py-3 bg-slate-50 border-0 rounded-2xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Note (Optional)</label>
                <textarea
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  placeholder="Add a message..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border-0 rounded-2xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none"
                />
              </div>
              <button
                onClick={handleManualShare}
                className="w-full px-4 py-3 bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                Share Location
              </button>
            </div>

            {mapLoaded && vehicles.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Active Share Links</p>
                {vehicles.map(v => {
                  const shareLink = generateShareLink(v.lat, v.lng);
                  return (
                    <div key={v.id} className="mb-3 bg-slate-50 p-3 rounded-2xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">Vehicle {v.id}</span>
                        <span className="text-xs font-mono text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">LINK</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shareLink}
                          readOnly
                          className="flex-1 px-3 py-1.5 text-xs bg-white border-0 rounded-xl text-slate-500 truncate"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(shareLink);
                            alert('Link copied to clipboard!');
                          }}
                          className="px-3 py-1.5 bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-200 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Coordinate panel */}
      {showAddCoordinatePanel && (
        <div className="absolute bottom-24 right-4 z-10 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-violet-500/10 p-6 w-80 border border-white/60 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-violet-500">➕</span> New Point
            </h3>
            <button
              onClick={() => setShowAddCoordinatePanel(false)}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-all"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Latitude</label>
              <input
                type="number"
                step="any"
                value={newCoordLat}
                onChange={(e) => setNewCoordLat(e.target.value)}
                placeholder="e.g., 39.95"
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-2xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Longitude</label>
              <input
                type="number"
                step="any"
                value={newCoordLng}
                onChange={(e) => setNewCoordLng(e.target.value)}
                placeholder="e.g., -75.16"
                className="w-full px-4 py-3 bg-slate-50 border-0 rounded-2xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all"
              />
            </div>
            <button
              onClick={handleAddCoordinate}
              className="w-full px-4 py-3 bg-violet-600 text-white rounded-2xl font-bold shadow-lg shadow-violet-500/20 hover:bg-violet-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Add Coordinate
            </button>
          </div>
        </div>
      )}

      {/* Medical Panel */}
      {showMedicalPanel && viewMode === 'medical' && (
        <div className="absolute bottom-24 right-4 z-10 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-500/10 p-6 w-96 max-h-[80vh] overflow-y-auto border border-white/60 animate-in slide-in-from-bottom-4 duration-300 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className="flex justify-between items-center mb-6 sticky top-0 bg-white/95 backdrop-blur-xl pb-2 z-20">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-indigo-500">🏥</span> Institution Panel
            </h3>
            <button
              onClick={() => {
                setShowMedicalPanel(false);
                setIsPickingLocation(false);
              }}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-all"
            >
              ✕
            </button>
          </div>

          <div className="space-y-6">
            {/* Initialize Demo Button */}
            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-center">
              <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">Demo Setup</h4>
              <button
                onClick={initializeDemoFleet}
                className="w-full px-4 py-2 bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-200 transition-all"
              >
                Initialize A1, A2, A3 (Philly)
              </button>
            </div>

            {/* Register new ambulance */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Register New Unit</h4>
              <div className="space-y-3">
                <input
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="Ambulance Name (e.g. A4)"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => registerAmbulance()}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
                  >
                    Use Current Loc
                  </button>
                  <button
                    onClick={() => setIsPickingLocation(!isPickingLocation)}
                    className={`flex-1 px-3 py-2 border text-xs font-bold rounded-xl transition-all ${isPickingLocation
                      ? 'bg-rose-500 border-rose-600 text-white animate-pulse'
                      : 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700'
                      }`}
                  >
                    {isPickingLocation ? 'Click Map...' : 'Pick on Map'}
                  </button>
                </div>
              </div>
            </div>

            {/* Vehicle list */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Fleet Status
                </h4>
                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-full">
                  {medicalVehicles.length} UNITS
                </span>
              </div>

              {medicalVehicles.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                  <span className="text-2xl block mb-2">🚑</span>
                  <p className="text-sm text-slate-400 font-medium">No ambulances registered.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {medicalVehicles.map(vehicle => (
                    <div
                      key={vehicle.id}
                      className={`p-4 rounded-2xl border transition-all duration-200 ${selectedVehicle?.id === vehicle.id
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-1 ring-indigo-500/20'
                        : 'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-sm'
                        }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 mr-2">
                          {editingVehicleId === vehicle.id ? (
                            <div className="flex gap-2 mb-1">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full px-2 py-1 text-xs border rounded"
                                autoFocus
                              />
                              <button onClick={() => updateVehicleName(vehicle.id, editName)} className="text-green-600">✓</button>
                              <button onClick={() => setEditingVehicleId(null)} className="text-red-600">✕</button>
                            </div>
                          ) : (
                            <div className="font-bold text-slate-800 flex items-center gap-2 cursor-pointer hover:text-indigo-600" onClick={() => {
                              setEditingVehicleId(vehicle.id);
                              setEditName(vehicle.name || '');
                            }}>
                              {vehicle.name || `Vehicle ${vehicle.id.slice(0, 8)}`}
                              <span className="text-[10px] text-slate-300">✎</span>
                            </div>
                          )}
                          <div className="text-xs font-mono text-slate-400 mt-1">
                            {vehicle.latitude.toFixed(4)}, {vehicle.longitude.toFixed(4)}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${vehicle.status === 'on_duty'
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-emerald-100 text-emerald-600'
                            }`}
                        >
                          {vehicle.status === 'on_duty' ? 'BUSY' : 'READY'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <button
                          onClick={() => updateVehicleLocation(vehicle.id)}
                          className="px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                        >
                          Update Loc
                        </button>
                        <button
                          onClick={() =>
                            updateVehicleStatus(
                              vehicle.id,
                              vehicle.status === 'on_duty' ? 'vacant' : 'on_duty',
                            )
                          }
                          className={`px-3 py-2 border text-xs font-bold rounded-xl transition-all ${vehicle.status === 'on_duty'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                            }`}
                        >
                          {vehicle.status === 'on_duty' ? 'Set Free' : 'Set Busy'}
                        </button>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-slate-100/50">
                        {selectedVehicle?.id === vehicle.id && trackingInterval ? (
                          <button
                            onClick={stopTracking}
                            className="w-full px-3 py-2 bg-rose-500 text-white text-xs font-bold rounded-xl hover:bg-rose-600 shadow-sm shadow-rose-500/20 transition-all flex items-center justify-center gap-2"
                          >
                            <span className="animate-pulse">●</span> Stop Tracking
                          </button>
                        ) : (
                          <button
                            onClick={() => startTracking(vehicle.id)}
                            className="w-full px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all"
                          >
                            Start Live Tracking
                          </button>
                        )}
                        <button
                          onClick={() => deleteVehicle(vehicle.id)}
                          className="w-full px-3 py-2 text-rose-500 text-xs font-bold rounded-xl hover:bg-rose-50 transition-all"
                        >
                          Remove Unit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Language Detection Modal */}
      {showLanguageModal && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-96 border border-white/60 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                🎤 Language Detection
              </h3>
              <button
                onClick={() => {
                  setShowLanguageModal(false);
                  if (isRecording) stopRecording();
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Recording Controls */}
              <div className="flex flex-col items-center gap-4">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="px-8 py-4 bg-purple-500 text-white rounded-full shadow-lg hover:bg-purple-600 transition-all transform hover:scale-105 active:scale-95 font-bold flex items-center gap-3"
                  >
                    <span className="text-2xl">🎤</span>
                    Start Recording
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="px-8 py-4 bg-rose-500 text-white rounded-full shadow-lg hover:bg-rose-600 transition-all transform hover:scale-105 active:scale-95 font-bold flex items-center gap-3 animate-pulse"
                  >
                    <span className="text-2xl">⏹️</span>
                    Stop Recording
                  </button>
                )}

                {isRecording && (
                  <div className="flex items-center gap-2 text-rose-500 font-medium">
                    <div className="w-3 h-3 bg-rose-500 rounded-full animate-pulse"></div>
                    Recording in progress...
                  </div>
                )}
              </div>

              {/* Error Display */}
              {languageError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                  <p className="text-rose-600 text-sm font-medium">❌ {languageError}</p>
                </div>
              )}

              {/* Results Display */}
              {detectedLanguage && (
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">Detected Language</p>
                    <p className="text-2xl font-bold text-purple-600">{detectedLanguage.toUpperCase()}</p>
                  </div>

                  {transcribedText && (
                    <div>
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Transcription</p>
                      <p className="text-slate-700 text-sm leading-relaxed bg-white/50 rounded-lg p-3">
                        "{transcribedText}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Instructions */}
              {!detectedLanguage && !languageError && !isRecording && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-slate-600 text-sm text-center">
                    Click "Start Recording" and speak in any language. The AI will detect the language and transcribe your speech.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Distance in meters
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
