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
  const mapRef = useRef<MapRef>(null);
  const modelLoadedRef = useRef(false);
  const socketRef = useRef<any>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const viewModeRef = useRef<ViewMode>('user');
  
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
        if (existing && 
            Math.abs(existing.lat - v.lat) < 0.000001 && 
            Math.abs(existing.lng - v.lng) < 0.000001) {
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
  const registerAmbulance = useCallback(async () => {
    if (!navigator.geolocation) {
      alert('Your browser does not support geolocation');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
          const response = await fetch(`${apiBase}/api/medical/vehicles/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              status: 'vacant',
            }),
          });

          const result = await response.json();
          if (result.success) {
            alert(`Ambulance registered successfully! ID: ${result.vehicle.id}`);
            // Refresh vehicle list
            const vehiclesResponse = await fetch(`${apiBase}/api/medical/vehicles`);
            const vehiclesResult = await vehiclesResponse.json();
            if (vehiclesResult.success) {
              setMedicalVehicles(vehiclesResult.vehicles || []);
            }
          } else {
            alert(`Failed to register ambulance: ${result.message}`);
          }
        } catch (error) {
          console.error('Failed to register ambulance:', error);
          alert('Failed to register ambulance. Please try again.');
        }
      },
      (error) => {
        console.error('Failed to get location:', error);
        alert('Unable to get current location. Please check browser permission settings.');
      }
    );
  }, []);

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
    /*
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;

    // Don't recreate layer if it already exists and model is loaded
    // This prevents losing the model when vehicles update
    if (map.getLayer('vehicles-3d-layer') && modelLoadedRef.current) {
      // Just update the map reference
      layerRef.current.map = map;
      return;
    }

    // If layer exists but model not loaded, remove it to recreate
    if (map.getLayer('vehicles-3d-layer')) {
      map.removeLayer('vehicles-3d-layer');
    }

    const layerData = layerRef.current;
    layerData.map = map;
    // Only clear instances if we're recreating the layer
    if (!modelLoadedRef.current) {
      layerData.modelInstances = [];
    }

    // Create custom layer
    const customLayer: CustomLayerInterface = {
      id: 'vehicles-3d-layer',
      type: 'custom',
      renderingMode: '3d',
      onAdd: function (mapInstance: MapboxMap, gl: WebGLRenderingContext) {
        console.log('3D layer onAdd called');
        
        // Create Three.js scene
        const scene = new THREE.Scene();
        // Camera settings - use wider FOV and larger near/far planes for custom layer
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.0001, 10000);
        
        // Use Mapbox's WebGL context
        const renderer = new THREE.WebGLRenderer({
          canvas: mapInstance.getCanvas(),
          context: gl,
          antialias: true,
        });
        renderer.autoClear = false;
        renderer.sortObjects = false;

        // Save to ref
        layerData.scene = scene;
        layerData.camera = camera;
        layerData.renderer = renderer;

        // Load ambulance model
        const loader = new GLTFLoader();
        console.log('Loading ambulance model: /models/ambulance.glb');
        loader.load(
          '/models/ambulance.glb',
          (gltf: any) => {
            console.log('Ambulance model loaded successfully', gltf);
            const model = gltf.scene;
            if (model) {
              // Center the model at origin
              const box = new THREE.Box3().setFromObject(model);
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              
              // Offset model to center it
              model.position.x = -center.x;
              model.position.y = -center.y;
              model.position.z = -center.z;
              
              // Calculate appropriate scale based on model size
              // Target size: approximately 15-20 meters in real world
              // Mercator coordinates: 1 unit ≈ 40075017 meters at equator
              const targetSizeInMeters = 20; // 20 meters (ambulance length)
              const metersPerMercatorUnit = 40075017; // at equator
              const targetSizeInMercator = targetSizeInMeters / metersPerMercatorUnit;
              const finalScale = targetSizeInMercator / maxDim;
              
              // Clamp scale to reasonable range for visibility
              // Use much larger scale to make model more visible
              // If maxDim is very small, use a fixed large scale
              let clampedScale;
              if (maxDim < 0.001) {
                // Model is very small, use a fixed large scale
                clampedScale = 0.01; // Large fixed scale
                console.warn('Model is very small, using fixed large scale:', clampedScale);
              } else {
                clampedScale = Math.max(0.001, Math.min(0.01, finalScale));
              }
              
              console.log('Model size:', size, 'Max dimension:', maxDim);
              console.log('Model center:', center);
              console.log('Calculated scale:', finalScale, 'Clamped scale:', clampedScale);
              model.scale.set(clampedScale, clampedScale, clampedScale);
              
              // Add a test sphere at origin to verify rendering works
              const testGeometry = new THREE.SphereGeometry(0.0003, 16, 16);
              const testMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xff0000, 
                transparent: true, 
                opacity: 0.9,
                side: THREE.DoubleSide
              });
              const testSphere = new THREE.Mesh(testGeometry, testMaterial);
              testSphere.position.set(0, 0, 0);
              scene.add(testSphere);
              console.log('Added red test sphere at origin (0,0,0) for debugging');
              
              // Ensure model is visible and properly configured
              model.traverse((child: any) => {
                if (child.isMesh) {
                  child.visible = true;
                  child.castShadow = true;
                  child.receiveShadow = true;
                  // Ensure materials are visible
                  if (child.material) {
                    if (Array.isArray(child.material)) {
                      child.material.forEach((mat: any) => {
                        if (mat) mat.visible = true;
                      });
                    } else {
                      child.material.visible = true;
                    }
                  }
                }
              });
              
              // Make sure the model itself is visible
              model.visible = true;
              
              // Add model to scene immediately to verify it's there
              scene.add(model);
              console.log('✅ Model added directly to scene for testing');
              
              // Log model details
              let meshCount = 0;
              model.traverse((child: any) => {
                if (child.isMesh) {
                  meshCount++;
                  console.log(`  Mesh ${meshCount}:`, {
                    name: child.name,
                    visible: child.visible,
                    position: child.position,
                    scale: child.scale,
                    material: child.material ? (Array.isArray(child.material) ? child.material.length : 1) : 0
                  });
                }
              });
              console.log(`✅ Model has ${meshCount} meshes`);
              
              layerData.model = model;
              modelLoadedRef.current = true;
              setModelReady(true);
              
              console.log('✅ Model set, ready to create instances, current vehicle count:', vehiclesRef.current.length);
              
              // Create model instances for each vehicle
              updateModelInstances();
            } else {
              console.error('Model scene is null or undefined');
            }
          },
          (progress: any) => {
            if (progress.total > 0) {
              const percent = (progress.loaded / progress.total) * 100;
              console.log('Model loading progress:', percent.toFixed(2) + '%');
            }
          },
          (error: any) => {
            console.error('Failed to load ambulance model:', error);
            console.error('Error details:', {
              message: error?.message,
              stack: error?.stack,
              url: '/models/ambulance.glb'
            });
          }
        );
      },
      render: function (gl: WebGLRenderingContext, matrix: number[]) {
        try {
          const { scene, camera, renderer, model, modelInstances } = layerRef.current;
          
          // Get latest vehicles from ref to avoid closure issues
          const currentVehicles = vehiclesRef.current;
          
          // The matrix from Mapbox is a 4x4 matrix that combines:
          // - Projection matrix
          // - Model-view matrix (transforms from Mercator to clip space)
          // We need to use this directly for the camera
          const transform = new THREE.Matrix4().fromArray(matrix);
          
          // Debug: log render call info
          if (Math.random() < 0.01) {
            console.log('🎨 Render called:', {
              hasScene: !!scene,
              hasCamera: !!camera,
              hasRenderer: !!renderer,
              hasModel: !!model,
              vehiclesCount: currentVehicles.length,
              instancesCount: modelInstances?.length || 0,
              'scene children': scene?.children?.length || 0,
              'map zoom': layerRef.current.map?.getZoom()
            });
          }
          
          // If no scene/camera/renderer, don't render
          if (!scene || !camera || !renderer) {
            return;
          }
          
          // If no model, still render test geometries if they exist
          if (!model) {
            // Only log occasionally to avoid spam
            if (Math.random() < 0.01) {
              console.log('⚠️ render: model not loaded, but rendering scene anyway');
            }
            // Still render the scene (might have test geometries)
            try {
              renderer.resetState();
              gl.enable(gl.DEPTH_TEST);
              gl.depthFunc(gl.LEQUAL);
              gl.enable(gl.BLEND);
              gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
              gl.depthMask(true);
              gl.disable(gl.CULL_FACE);
              gl.clear(gl.DEPTH_BUFFER_BIT);
              
              camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
              camera.projectionMatrixInverse = camera.projectionMatrix.clone().invert();
              
              const map = layerRef.current.map;
              if (map) {
                const canvas = map.getCanvas();
                renderer.setSize(canvas.width, canvas.height);
                renderer.render(scene, camera);
                map.triggerRepaint();
              }
            } catch (error) {
              console.error('Error rendering scene without model:', error);
            }
            return;
          }

        // Ensure we have the right number of instances
        if (currentVehicles.length !== modelInstances.length) {
          // Clear old instances
          modelInstances.forEach(instance => scene.remove(instance));
          modelInstances.length = 0;
          
          // Create new instances
          currentVehicles.forEach(() => {
            const instance = model.clone();
            instance.visible = true;
            instance.matrixAutoUpdate = false;
            
            // Ensure all child meshes are visible
            instance.traverse((child: any) => {
              if (child.isMesh) {
                child.visible = true;
              }
            });
            
            scene.add(instance);
            modelInstances.push(instance);
          });
          console.log(`Updated model instances: ${modelInstances.length}, objects in scene: ${scene.children.length}`);
        }

        if (modelInstances.length === 0 || currentVehicles.length === 0) {
          return;
        }

        // Always update positions, even if count hasn't changed
        // This ensures models stay visible when positions update

        const map = layerRef.current.map;
        if (!map) {
          console.log('render: map object does not exist');
          return;
        }

        // Set camera projection matrix (using Mapbox-provided matrix)
        // The matrix from Mapbox is a combined projection and model-view matrix
        // It transforms from Mercator coordinates (relative to map center) to clip space
        camera.projectionMatrix = transform.clone();
        camera.projectionMatrixInverse = transform.clone().invert();
        
        // Add a test object at map center (0,0,0) to verify coordinate system
        // This should appear at the center of the map view
        if (!layerRef.current.testOriginObject) {
          const testSize = 0.05; // Large test object
          const testGeometry = new THREE.BoxGeometry(testSize, testSize, testSize);
          const testMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x0000ff, // Blue - different from vehicle test cubes
            transparent: false,
            side: THREE.DoubleSide
          });
          const testObject = new THREE.Mesh(testGeometry, testMaterial);
          testObject.matrixAutoUpdate = false;
          testObject.matrix.identity(); // Position at origin (0,0,0) = map center
          testObject.visible = true;
          testObject.frustumCulled = false;
          scene.add(testObject);
          layerRef.current.testOriginObject = testObject;
          console.log('✅ Added BLUE test cube at map center (0,0,0)');
        }

        // Update position of each model instance
        currentVehicles.forEach((vehicle, index) => {
          if (index >= modelInstances.length) return;
          
          try {
            const instance = modelInstances[index];
            const [lng, lat] = [vehicle.lng, vehicle.lat];
            
            // Validate coordinates
            if (!isFinite(lng) || !isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
              console.warn(`Invalid coordinates for vehicle ${vehicle.id}:`, { lng, lat });
              return;
            }
            
            // Convert lat/lng to Mercator coordinates
            // Height in meters: 5 meters above ground (ambulance height)
            const heightInMeters = 5;
            let mercator;
            
            try {
              mercator = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], heightInMeters);
            } catch (error) {
              console.error(`Error converting coordinates for vehicle ${vehicle.id}:`, error);
              return;
            }
            
            // Mapbox custom layer uses a coordinate system where:
            // - The origin (0,0,0) is at the map center
            // - X points east, Y points north, Z points up
            // - Three.js uses Y-up, so we need to transform: (x, y, z) -> (x, z, -y)
            
            // Get map center in Mercator coordinates
            const mapCenter = map.getCenter();
            const centerMercator = mapboxgl.MercatorCoordinate.fromLngLat(
              [mapCenter.lng, mapCenter.lat],
              heightInMeters
            );
            
            // Calculate position relative to map center in Mercator space
            const x = mercator.x - centerMercator.x;
            const y = mercator.y - centerMercator.y;
            const z = mercator.z - centerMercator.z;
            
            // Validate calculated positions
            if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
              console.warn(`Invalid calculated position for vehicle ${vehicle.id}:`, { x, y, z });
              return;
            }
            
            // Transform from Mapbox coordinate system to Three.js
            // Mapbox custom layer uses: X=east, Y=north, Z=up (relative to map center)
            // Three.js uses: X=east, Y=up, Z=forward (typically negative Y from Mapbox)
            // Try both directions and see which one works
            // Based on Mapbox examples, the correct transform is:
            const threeX = x;   // East stays east
            const threeY = z;   // Up (Z) becomes up (Y) in Three.js  
            const threeZ = -y;  // North (Y) becomes -Z in Three.js (south direction)
            
            // Alternative: try without negation if above doesn't work
            // const threeZ = y;
            
            // Validate Three.js coordinates
            if (!isFinite(threeX) || !isFinite(threeY) || !isFinite(threeZ)) {
              console.warn(`Invalid Three.js coordinates for vehicle ${vehicle.id}:`, { threeX, threeY, threeZ });
              return;
            }
            
            // Create transformation matrix
            // Use makeTranslation to create a translation matrix
            const translation = new THREE.Matrix4().makeTranslation(threeX, threeY, threeZ);
            
            // Apply transformation to instance
            instance.matrix.copy(translation);
            instance.matrixAutoUpdate = false;
            instance.visible = true;
            
            // Add a VERY LARGE test cube at vehicle position for debugging (for all vehicles)
            // This will help us verify if rendering is working at all
            if (!instance.userData.testCubeAdded) {
              try {
                // Create a MUCH larger, very visible test cube
                // Scale based on zoom level to ensure visibility
                // At low zoom levels, use much larger size
                const zoom = map.getZoom();
                // Use larger base size and less aggressive scaling for low zoom
                const baseSize = zoom < 5 ? 0.1 : 0.01; // Much larger at low zoom
                const testCubeSize = Math.max(0.01, baseSize / Math.pow(2, Math.max(0, zoom - 5)));
                const testCubeGeometry = new THREE.BoxGeometry(testCubeSize, testCubeSize * 3, testCubeSize);
                const testCubeMaterial = new THREE.MeshBasicMaterial({ 
                  color: index === 0 ? 0x00ff00 : 0xff00ff, // Green for first, magenta for others
                  transparent: false, // No transparency for maximum visibility
                  opacity: 1.0,
                  side: THREE.DoubleSide,
                  depthTest: true,
                  depthWrite: true
                });
                const testCube = new THREE.Mesh(testCubeGeometry, testCubeMaterial);
                testCube.matrixAutoUpdate = false;
                testCube.matrix.identity();
                testCube.matrix.setPosition(new THREE.Vector3(threeX, threeY, threeZ));
                testCube.visible = true;
                testCube.frustumCulled = false;
                scene.add(testCube);
                instance.userData.testCube = testCube;
                instance.userData.testCubeAdded = true;
                console.log(`✅ Added VERY LARGE test cube ${index} at vehicle position:`, { 
                  vehicleId: vehicle.id,
                  lng, 
                  lat,
                  threeX: threeX.toFixed(8), 
                  threeY: threeY.toFixed(8), 
                  threeZ: threeZ.toFixed(8),
                  'map zoom': zoom,
                  'cube size': testCubeSize,
                  'scene children count': scene.children.length
                });
              } catch (error) {
                console.error(`Error creating test cube for vehicle ${vehicle.id}:`, error);
              }
            } else {
              // Update test cube position every frame
              const testCube = instance.userData.testCube;
              if (testCube) {
                try {
                  testCube.matrix.identity();
                  testCube.matrix.setPosition(new THREE.Vector3(threeX, threeY, threeZ));
                  testCube.visible = true;
                } catch (error) {
                  console.error(`Error updating test cube for vehicle ${vehicle.id}:`, error);
                }
              }
            }
            
            // Also add a test sphere at the same position for extra visibility
            if (!instance.userData.testSphereAdded) {
              try {
                const zoom = map.getZoom();
                const testSphereSize = Math.max(0.0008, 0.008 / Math.pow(2, Math.max(0, zoom - 10)));
                const testSphereGeometry = new THREE.SphereGeometry(testSphereSize, 16, 16);
                const testSphereMaterial = new THREE.MeshBasicMaterial({ 
                  color: 0xffff00, // Yellow
                  transparent: false,
                  side: THREE.DoubleSide
                });
                const testSphere = new THREE.Mesh(testSphereGeometry, testSphereMaterial);
                testSphere.matrixAutoUpdate = false;
                testSphere.matrix.identity();
                testSphere.matrix.setPosition(new THREE.Vector3(threeX, threeY + testSphereSize * 2, threeZ));
                testSphere.visible = true;
                testSphere.frustumCulled = false;
                scene.add(testSphere);
                instance.userData.testSphere = testSphere;
                instance.userData.testSphereAdded = true;
                console.log(`✅ Added yellow test sphere above vehicle ${index}`);
              } catch (error) {
                console.error(`Error creating test sphere for vehicle ${vehicle.id}:`, error);
              }
            } else {
              const testSphere = instance.userData.testSphere;
              if (testSphere) {
                try {
                  const zoom = map.getZoom();
                  const testSphereSize = Math.max(0.0008, 0.008 / Math.pow(2, Math.max(0, zoom - 10)));
                  testSphere.matrix.identity();
                  testSphere.matrix.setPosition(new THREE.Vector3(threeX, threeY + testSphereSize * 2, threeZ));
                  testSphere.visible = true;
                } catch (error) {
                  console.error(`Error updating test sphere for vehicle ${vehicle.id}:`, error);
                }
              }
            }
            
            // Ensure instance and all children are visible
            instance.traverse((child: any) => {
              if (child.isMesh) {
                child.visible = true;
              }
            });
            
            // Debug info (print for first vehicle - always log first time, then occasionally)
            if (index === 0) {
              const shouldLog = !instance.userData.positionLogged || Math.random() < 0.1;
              if (shouldLog) {
                const distance = Math.sqrt(threeX*threeX + threeY*threeY + threeZ*threeZ);
                console.log('📍 Vehicle position debug:', {
                  vehicleId: vehicle.id,
                  'geo coords': { lng, lat },
                  heightInMeters,
                  'mercator (absolute)': { 
                    x: mercator.x.toFixed(10), 
                    y: mercator.y.toFixed(10), 
                    z: mercator.z.toFixed(10) 
                  },
                  'center mercator': {
                    x: centerMercator.x.toFixed(10),
                    y: centerMercator.y.toFixed(10),
                    z: centerMercator.z.toFixed(10)
                  },
                  'relative (mercator)': { 
                    x: x.toFixed(10), 
                    y: y.toFixed(10), 
                    z: z.toFixed(10),
                    'magnitude': Math.sqrt(x*x + y*y + z*z).toFixed(10)
                  },
                  'three.js position': { 
                    x: threeX.toFixed(10), 
                    y: threeY.toFixed(10), 
                    z: threeZ.toFixed(10),
                    'magnitude': distance.toFixed(10)
                  },
                  'map center': { lng: map.getCenter().lng, lat: map.getCenter().lat },
                  'map zoom': map.getZoom(),
                  'instance visible': instance.visible,
                  'WARNING': distance > 1 ? '⚠️ Position is very far from origin! May be outside view.' : 'OK'
                });
                instance.userData.positionLogged = true;
              }
            }
          } catch (error) {
            console.error(`Error updating vehicle ${vehicle.id}:`, error);
          }
        });

          // Render scene
          try {
            renderer.resetState();
            // Set WebGL state to ensure models render above map
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(true);
            gl.disable(gl.CULL_FACE); // Disable culling to see models from all angles
            
            // Clear depth buffer to ensure models render on top
            gl.clear(gl.DEPTH_BUFFER_BIT);
            
            // Set renderer size to match canvas
            const canvas = map.getCanvas();
            if (canvas) {
              renderer.setSize(canvas.width, canvas.height);
              
              // Debug: log scene info and object positions
              if (Math.random() < 0.1) {
                const sceneObjects = scene.children.map((child: any, idx: number) => {
                  const pos = child.position || { x: 0, y: 0, z: 0 };
                  const matrixPos = new THREE.Vector3();
                  if (child.matrix) {
                    child.matrix.decompose(matrixPos, new THREE.Quaternion(), new THREE.Vector3());
                  }
                  return {
                    index: idx,
                    type: child.type,
                    name: child.name || 'unnamed',
                    visible: child.visible,
                    position: { x: pos.x?.toFixed(6), y: pos.y?.toFixed(6), z: pos.z?.toFixed(6) },
                    matrixPos: { x: matrixPos.x.toFixed(6), y: matrixPos.y.toFixed(6), z: matrixPos.z.toFixed(6) }
                  };
                });
                console.log('🎨 Rendering scene:', {
                  'scene children': scene.children.length,
                  'model instances': modelInstances.length,
                  'vehicles': currentVehicles.length,
                  'canvas size': `${canvas.width}x${canvas.height}`,
                  'objects': sceneObjects
                });
              }
              
              renderer.render(scene, camera);
              
              // Force repaint
              map.triggerRepaint();
            }
          } catch (renderError) {
            console.error('Error during render:', renderError);
          }
        } catch (error) {
          console.error('Error in render function:', error);
        }
      },
    };

    function updateModelInstances() {
      const { scene, model, modelInstances } = layerRef.current;
      if (!scene || !model) {
        console.warn('Cannot update model instances: scene or model not available', { scene: !!scene, model: !!model });
        return;
      }
      
      // Get latest vehicles from ref
      const currentVehicles = vehiclesRef.current;
      
      console.log(`Updating model instances: ${currentVehicles.length} vehicles, ${modelInstances.length} existing instances`);
      
      // Clear old instances
      modelInstances.forEach(instance => {
        scene.remove(instance);
        // Dispose of cloned geometry and materials to prevent memory leaks
        instance.traverse((child: any) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat: any) => mat?.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      });
      modelInstances.length = 0;

      // Create new instances
      currentVehicles.forEach((vehicle, index) => {
        const instance = model.clone();
        instance.visible = true;
        instance.matrixAutoUpdate = false;
        instance.userData = { vehicleId: vehicle.id, logged: false };
        
        // Ensure all child meshes are visible and properly configured
        instance.traverse((child: any) => {
          if (child.isMesh) {
            child.visible = true;
            child.frustumCulled = false; // Disable frustum culling to ensure visibility
            // Ensure materials are visible
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat: any) => {
                  if (mat) {
                    mat.visible = true;
                    mat.needsUpdate = true;
                    // Make materials more visible
                    if (mat.emissive) {
                      mat.emissive.multiplyScalar(1.2);
                    }
                  }
                });
              } else {
                child.material.visible = true;
                child.material.needsUpdate = true;
                // Make materials more visible
                if (child.material.emissive) {
                  child.material.emissive.multiplyScalar(1.2);
                }
              }
            }
          }
        });
        
        scene.add(instance);
        modelInstances.push(instance);
        
        console.log(`Created instance ${index} for vehicle ${vehicle.id}`);
      });
      
      console.log(`Created ${modelInstances.length} model instances, scene now has ${scene.children.length} objects`);
    }

    // Wait for map style to load before adding layer
    const addLayerWhenReady = () => {
      if (map.isStyleLoaded() && !map.getLayer('vehicles-3d-layer')) {
        console.log('Adding 3D model layer to map');
        try {
          // Try to add layer at the top (after all other layers)
          const layers = map.getStyle().layers;
          if (layers && layers.length > 0) {
            // Find the last layer ID to insert after it
            const lastLayerId = layers[layers.length - 1].id;
            map.addLayer(customLayer, lastLayerId);
            console.log('3D model layer added after:', lastLayerId);
          } else {
            map.addLayer(customLayer);
            console.log('3D model layer added (no existing layers)');
          }
        } catch (error) {
          console.error('Error adding 3D layer:', error);
          // Fallback: try adding without beforeId
          try {
            map.addLayer(customLayer);
            console.log('3D model layer added (fallback)');
          } catch (fallbackError) {
            console.error('Failed to add 3D layer even with fallback:', fallbackError);
          }
        }
      }
    };

    if (map.isStyleLoaded()) {
      addLayerWhenReady();
    } else {
      map.once('style.load', addLayerWhenReady);
    }
    
    // Also listen for style changes to re-add layer if needed
    const handleStyleChange = () => {
      if (!map.getLayer('vehicles-3d-layer') && modelLoadedRef.current) {
        console.log('Style changed, re-adding 3D layer');
        setTimeout(addLayerWhenReady, 100);
      }
    };
    map.on('style.load', handleStyleChange);

    // Cleanup function - only remove layer if component unmounts
    return () => {
      // Don't remove layer on every update, only on unmount
      // This prevents losing the model when vehicles update
    };
    */
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

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <h2 className="text-xl font-bold text-red-600 mb-4">Mapbox Token Missing</h2>
          <p className="text-gray-700 mb-4">
            Please create a <code className="bg-gray-100 px-2 py-1 rounded text-sm">.env</code> file in the project root directory and set <code className="bg-gray-100 px-2 py-1 rounded text-sm">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
            Please create a <code className="bg-gray-100 px-2 py-1 rounded text-sm">.env</code> file in the project root and set <code className="bg-gray-100 px-2 py-1 rounded text-sm">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
          </p>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Steps:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Copy <code className="bg-gray-100 px-1 rounded">.env.example</code> file to <code className="bg-gray-100 px-1 rounded">.env</code></li>
              <li>Visit <a href="https://account.mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mapbox account page</a></li>
              <li>Login or register an account</li>
              <li>Get your token from the "Access tokens" section</li>
              <li>Copy <code className="bg-gray-100 px-1 rounded">.env.example</code> file as <code className="bg-gray-100 px-1 rounded">.env</code></li>
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
    <div className="h-screen w-screen relative">
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
              <div className={`text-white text-xs px-2 py-1 rounded shadow-lg border-2 border-white ${
                v.status === 'on_duty' ? 'bg-red-600' : 'bg-gray-500'
              }`}>
                🚑 {v.name || v.id.slice(0, 8)}
                {v.status && (
                  <div className="text-[10px] mt-0.5">
                    {v.status === 'on_duty' ? 'ON DUTY' : 'VACANT'}
                  </div>
                )}
              </div>
            </Marker>
          ))}

        {/* House markers for coordinates */}
        {coordinates.map(coord => (
          <Marker key={coord.id} longitude={coord.lng} latitude={coord.lat}>
            <div className="text-3xl">🏠</div>
          </Marker>
        ))}

        {/* AED markers */}
        {showAEDs && aeds.map(aed => (
          <Marker key={aed.id} longitude={aed.longitude} latitude={aed.latitude}>
            <div className="relative group">
              <div className="bg-red-600 w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                <span className="text-white text-sm font-bold">AED</span>
              </div>
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-white rounded-lg shadow-xl p-3 border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                <div className="text-sm font-semibold text-gray-800 mb-1">{aed.name}</div>
                {aed.address && (
                  <div className="text-xs text-gray-600 mb-1">📍 {aed.address}</div>
                )}
                {aed.building && (
                  <div className="text-xs text-gray-600 mb-1">🏢 {aed.building}</div>
                )}
                {aed.floor && (
                  <div className="text-xs text-gray-600 mb-1">🪜 Floor: {aed.floor}</div>
                )}
                {aed.description && (
                  <div className="text-xs text-gray-500 mt-1">{aed.description}</div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  Access: {aed.accessType} | Status: {aed.status}
                </div>
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
              </div>
            </div>
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
        {/* Shared location marker with message */}
        {sharedLocation && (
          <Marker longitude={sharedLocation.lng} latitude={sharedLocation.lat}>
            <div className="relative">
              <div className="bg-red-500 w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>
              {sharedLocation.message && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-white rounded-lg shadow-xl p-3 border border-gray-200">
                  <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                    {sharedLocation.message}
                  </div>
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
                </div>
              )}
            </div>
          </Marker>
        )}
      </MapGL>
      <div className="absolute left-4 bottom-4 bg-white/90 backdrop-blur-sm rounded-md shadow-lg px-3 py-2 text-xs text-gray-800 pointer-events-none">
        <div className="text-[0.65rem] uppercase tracking-wide text-gray-500 mb-1 font-semibold">Clicked Coordinates</div>
        <div>Lat: {clickedCoord ? clickedCoord.lat.toFixed(5) : '--.--'}</div>
        <div>Lng: {clickedCoord ? clickedCoord.lng.toFixed(5) : '--.--'}</div>
      </div>
      <div 
        ref={sidebarRef}
        className={`absolute ${sidebarCollapsed ? 'w-12' : 'w-64'} max-h-[70vh] overflow-hidden flex flex-col bg-white/95 backdrop-blur rounded-xl shadow-xl border border-gray-100 ${isDragging ? 'cursor-grabbing transition-none' : 'cursor-default transition-all duration-300'} ${!sidebarPosition ? 'left-1/2 -translate-x-1/2' : ''}`}
        style={{
          left: sidebarPosition ? sidebarPosition.x : undefined,
          top: sidebarPosition ? sidebarPosition.y : 16,
          right: sidebarPosition ? 'auto' : undefined,
        }}
      >
        <div 
          className={`${sidebarCollapsed ? 'px-2 py-3' : 'px-4 py-3'} border-b border-gray-100 cursor-move hover:bg-gray-50/50 transition-colors select-none`}
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
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nearby Language Points</p>
                {clickedCoord ? (
                  <p className="text-sm text-gray-700 mt-1">
                    Lat {clickedCoord.lat.toFixed(3)}, Lng {clickedCoord.lng.toFixed(3)}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">Click on map to query</p>
                )}
              </div>
              <button
                className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarCollapsed(!sidebarCollapsed);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider writing-vertical-rl mb-2 whitespace-nowrap">
                Nearby
              </p>
              <button
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarCollapsed(!sidebarCollapsed);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {!sidebarCollapsed && (
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
        )}
      </div>
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-10">
          <div>Mode: {viewMode === 'medical' ? 'Medical' : 'User'}</div>
          <div>Vehicles: {vehicles.length} (on_duty: {vehicles.filter(v => v.status === 'on_duty').length}, vacant: {vehicles.filter(v => v.status === 'vacant').length})</div>
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
          className={`px-4 py-2 rounded-lg shadow-lg font-medium transition-all ${
            viewMode === 'medical'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-600 text-white hover:bg-gray-700'
          }`}
        >
          {viewMode === 'medical' ? '🏥 Medical Mode' : '👤 User Mode'}
        </button>
        {viewMode === 'user' && (
          <button
            onClick={toggleVehicleLock}
            className={`px-4 py-2 rounded-lg shadow-lg font-medium transition-all ${
              isPositionLocked
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-yellow-500 text-white hover:bg-yellow-600'
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
          className={`px-4 py-2 rounded-lg shadow-lg font-medium transition-all ${
            mapStyle === 'street'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          🗺️ Street Map
        </button>
        <button
          onClick={() => handleMapStyleChange('satellite')}
          className={`px-4 py-2 rounded-lg shadow-lg font-medium transition-all ${
            mapStyle === 'satellite'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          🛰️ Satellite Map
        </button>
        {viewMode === 'user' && (
          <button
            onClick={() => setShowSharePanel(!showSharePanel)}
            className="px-4 py-2 rounded-lg shadow-lg font-medium transition-all bg-green-600 text-white hover:bg-green-700"
          >
            📍 Share Location
          </button>
        )}
        <button
          onClick={() => setShowAEDs(!showAEDs)}
          className={`px-4 py-2 rounded-lg shadow-lg font-medium transition-all ${
            showAEDs
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
          }`}
        >
          {showAEDs ? '❤️ Hide AEDs' : '❤️ Show AEDs'} ({aeds.length})
        </button>
      </div>

      {/* Bottom right buttons - different for each mode */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        {viewMode === 'user' ? (
          <button
            onClick={() => setShowAddCoordinatePanel(!showAddCoordinatePanel)}
            className="px-4 py-2 rounded-lg shadow-lg font-medium transition-all bg-purple-600 text-white hover:bg-purple-700"
          >
            ➕ Add New Coordinate
          </button>
        ) : (
          <button
            onClick={() => setShowMedicalPanel(!showMedicalPanel)}
            className="px-4 py-2 rounded-lg shadow-lg font-medium transition-all bg-blue-600 text-white hover:bg-blue-700"
          >
            🏥 Medical Panel
          </button>
        )}
      </div>

      {/* Location share panel */}
      {showSharePanel && (
        <div className="absolute top-20 right-4 z-10 bg-white rounded-lg shadow-xl p-4 w-80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">Share Location</h3>
            <button
              onClick={() => setShowSharePanel(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={getCurrentLocation}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              📱 Get Current Location
            </button>
            
            <div className="border-t pt-3">
              <p className="text-sm text-gray-600 mb-2">Or enter coordinates manually:</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Latitude (Lat)</label>
                  <input
                    type="number"
                    step="any"
                    value={shareLat}
                    onChange={(e) => setShareLat(e.target.value)}
                    placeholder="e.g., 39.95"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Longitude (Lng)</label>
                  <input
                    type="number"
                    step="any"
                    value={shareLng}
                    onChange={(e) => setShareLng(e.target.value)}
                    placeholder="e.g., -75.16"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Note (Optional)</label>
                  <textarea
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Enter a message..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <button
                  onClick={handleManualShare}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Share Location
                </button>
              </div>
            </div>

            {mapLoaded && vehicles.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm text-gray-600 mb-2">Generate share link:</p>
                {vehicles.map(v => {
                  const shareLink = generateShareLink(v.lat, v.lng);
                  return (
                    <div key={v.id} className="mb-2">
                      <p className="text-xs text-gray-500 mb-1">Vehicle {v.id}:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shareLink}
                          readOnly
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(shareLink);
                            alert('Link copied to clipboard!');
                          }}
                          className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
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
        <div className="absolute bottom-20 right-4 z-10 bg-white rounded-lg shadow-xl p-4 w-80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">Add New Coordinate</h3>
            <button
              onClick={() => setShowAddCoordinatePanel(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Latitude (Lat)</label>
              <input
                type="number"
                step="any"
                value={newCoordLat}
                onChange={(e) => setNewCoordLat(e.target.value)}
                placeholder="e.g., 39.95"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Longitude (Lng)</label>
              <input
                type="number"
                step="any"
                value={newCoordLng}
                onChange={(e) => setNewCoordLng(e.target.value)}
                placeholder="e.g., -75.16"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={handleAddCoordinate}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Add Coordinate
            </button>
          </div>
        </div>
      )}

      {/* Medical Panel */}
      {showMedicalPanel && viewMode === 'medical' && (
        <div className="absolute bottom-20 right-4 z-10 bg-white rounded-lg shadow-xl p-4 w-96 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">Medical Institution Panel</h3>
            <button
              onClick={() => setShowMedicalPanel(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Register new ambulance */}
            <div className="border-b pb-4">
              <h4 className="font-semibold text-gray-700 mb-2">Register Ambulance</h4>
              <button
                onClick={registerAmbulance}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                📍 Register Using Current Location
              </button>
            </div>

            {/* Vehicle list */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">
                Your Ambulances ({medicalVehicles.length})
              </h4>
              {medicalVehicles.length === 0 ? (
                <p className="text-sm text-gray-500">No ambulances registered yet.</p>
              ) : (
                <div className="space-y-2">
                  {medicalVehicles.map(vehicle => (
                    <div
                      key={vehicle.id}
                      className={`p-3 rounded-lg border-2 ${
                        selectedVehicle?.id === vehicle.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-gray-800">
                            {vehicle.name || `Vehicle ${vehicle.id.slice(0, 8)}`}
                          </div>
                          <div className="text-xs text-gray-600">
                            {vehicle.latitude.toFixed(4)}, {vehicle.longitude.toFixed(4)}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            vehicle.status === 'on_duty'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {vehicle.status === 'on_duty' ? 'ON DUTY' : 'VACANT'}
                        </span>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => updateVehicleLocation(vehicle.id)}
                          className="flex-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                        >
                          📍 Update Location
                        </button>
                        <button
                          onClick={() =>
                            updateVehicleStatus(
                              vehicle.id,
                              vehicle.status === 'on_duty' ? 'vacant' : 'on_duty',
                            )
                          }
                          className="flex-1 px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600"
                        >
                          {vehicle.status === 'on_duty' ? 'Set Vacant' : 'Set On Duty'}
                        </button>
                      </div>

                      <div className="mt-2 space-y-2">
                        {selectedVehicle?.id === vehicle.id && trackingInterval ? (
                          <button
                            onClick={stopTracking}
                            className="w-full px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                          >
                            ⏹️ Stop Tracking
                          </button>
                        ) : (
                          <button
                            onClick={() => startTracking(vehicle.id)}
                            className="w-full px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                          >
                            ▶️ Start Real-time Tracking
                          </button>
                        )}
                        <button
                          onClick={() => deleteVehicle(vehicle.id)}
                          className="w-full px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                        >
                          🗑️ Delete Ambulance
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
    </div>
  );
}
