'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import MapGL, { Marker, Source, Layer } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import type { Map as MapboxMap, CustomLayerInterface } from 'mapbox-gl';
import mapboxgl from 'mapbox-gl';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import 'mapbox-gl/dist/mapbox-gl.css';

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
  }>({ modelInstances: [] });

  // Use useEffect to add 3D model layer
  useEffect(() => {
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
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
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

        // Add a test cube to verify rendering works
        const testGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const testMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const testCube = new THREE.Mesh(testGeometry, testMaterial);
        testCube.position.set(0, 0, 0);
        scene.add(testCube);
        console.log('Added test cube to scene');

        // Load ambulance model
        const loader = new GLTFLoader();
        console.log('Loading ambulance model: /models/ambulance.glb');
        loader.load(
          '/models/ambulance.glb',
          (gltf: any) => {
            console.log('Ambulance model loaded successfully', gltf);
            const model = gltf.scene;
            if (model) {
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              
              // Calculate appropriate scale based on model size
              // Target size: approximately 20-30 meters in real world
              // Mercator coordinates: 1 unit ≈ 40075017 meters at equator
              // So 20 meters ≈ 20 / 40075017 ≈ 0.0000005 units
              // But we need larger scale for visibility, so use 0.0001 to 0.0005
              const targetSizeInMeters = 25; // 25 meters
              const metersPerMercatorUnit = 40075017; // at equator
              const targetSizeInMercator = targetSizeInMeters / metersPerMercatorUnit;
              const finalScale = targetSizeInMercator / maxDim;
              
              // Clamp scale to reasonable range
              const clampedScale = Math.max(0.0001, Math.min(0.001, finalScale));
              
              console.log('Model size:', size, 'Max dimension:', maxDim);
              console.log('Calculated scale:', finalScale, 'Clamped scale:', clampedScale);
              model.scale.set(clampedScale, clampedScale, clampedScale);
              
              // Ensure model is visible
              model.traverse((child: any) => {
                if (child.isMesh) {
                  child.visible = true;
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
              
              layerData.model = model;
              modelLoadedRef.current = true;
              setModelReady(true);
              
              console.log('Model set, ready to create instances, current vehicle count:', vehiclesRef.current.length);
              
              // Create model instances for each vehicle
              updateModelInstances();
            }
          },
          (progress: any) => {
            console.log('Model loading progress:', progress);
          },
          (error: any) => {
            console.error('Failed to load ambulance model:', error);
          }
        );
      },
      render: function (gl: WebGLRenderingContext, matrix: number[]) {
        const { scene, camera, renderer, model, modelInstances } = layerRef.current;
        
        // Get latest vehicles from ref to avoid closure issues
        const currentVehicles = vehiclesRef.current;
        
        // If no model or no vehicles, don't render
        if (!scene || !camera || !renderer || !model) {
          if (!model) {
            console.log('render: model not loaded');
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
        camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        camera.projectionMatrixInverse = camera.projectionMatrix.clone().invert();

        // Update position of each model instance
        currentVehicles.forEach((vehicle, index) => {
          if (index >= modelInstances.length) return;
          
          const instance = modelInstances[index];
          const [lng, lat] = [vehicle.lng, vehicle.lat];
          
          // Convert lat/lng to Mercator coordinates
          // Height in meters: 50 meters above ground
          const heightInMeters = 50;
          const mercator = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], heightInMeters);
          
          // Get map center in Mercator coordinates (at same height)
          const centerMercator = mapboxgl.MercatorCoordinate.fromLngLat(
            [map.getCenter().lng, map.getCenter().lat],
            heightInMeters
          );
          
          // Calculate position relative to map center
          const x = mercator.x - centerMercator.x;
          const y = mercator.y - centerMercator.y;
          const z = mercator.z - centerMercator.z;
          
          // Mapbox uses Z-up, Three.js uses Y-up
          // Transform: Mapbox (X, Y, Z) -> Three.js (X, Z, -Y)
          // This means: X stays X, Y becomes -Z, Z becomes Y
          const threeX = x;
          const threeY = z;
          const threeZ = -y;
          
          // Create translation matrix
          const translation = new THREE.Matrix4().makeTranslation(threeX, threeY, threeZ);
          
          // Apply transformation to instance
          instance.matrix.copy(translation);
          instance.matrixAutoUpdate = false;
          instance.visible = true;
          
          // Debug info (print every 100 frames)
          if (index === 0 && Math.random() < 0.01) {
            console.log('Model position debug:', {
              lng,
              lat,
              heightInMeters,
              mercator: { x: mercator.x.toFixed(6), y: mercator.y.toFixed(6), z: mercator.z.toFixed(6) },
              position: { x: x.toFixed(6), y: y.toFixed(6), z: z.toFixed(6) },
              'objects in scene': scene.children.length,
              'model instances': modelInstances.length
            });
          }
        });

        // Render scene
        renderer.resetState();
        // Set WebGL state to ensure models render above map
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        renderer.render(scene, camera);
        
        // Force repaint
        map.triggerRepaint();
      },
    };

    function updateModelInstances() {
      const { scene, model, modelInstances } = layerRef.current;
      if (!scene || !model) return;
      
      // Get latest vehicles from ref
      const currentVehicles = vehiclesRef.current;
      
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
      
      console.log(`Created ${modelInstances.length} model instances`);
    }

    // Wait for map style to load before adding layer
    const addLayerWhenReady = () => {
      if (map.isStyleLoaded() && !map.getLayer('vehicles-3d-layer')) {
        console.log('Adding 3D model layer to map');
        map.addLayer(customLayer);
      }
    };

    if (map.isStyleLoaded()) {
      addLayerWhenReady();
    } else {
      map.once('style.load', addLayerWhenReady);
    }

    // Cleanup function - only remove layer if component unmounts
    return () => {
      // Don't remove layer on every update, only on unmount
      // This prevents losing the model when vehicles update
    };
  }, [mapLoaded, mapStyle]); // Remove vehicles from dependencies to prevent layer recreation

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
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
            Please create a <code className="bg-gray-100 px-2 py-1 rounded text-sm">.env</code> file in the project root and set <code className="bg-gray-100 px-2 py-1 rounded text-sm">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
          </p>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Steps:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
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
        style={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
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

        {/* Fallback markers - only shown when 3D model not loaded or not ready */}
        {/* Hide fallback markers when model is ready to avoid showing emoji instead of 3D model */}
        {/* Show all vehicles in both modes */}
        {mapLoaded && !modelReady && vehicles.length > 0 && vehicles.map(v => (
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
        
        {/* Debug info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-10">
            <div>Mode: {viewMode === 'medical' ? 'Medical' : 'User'}</div>
            <div>Vehicles: {vehicles.length} (on_duty: {vehicles.filter(v => v.status === 'on_duty').length}, vacant: {vehicles.filter(v => v.status === 'vacant').length})</div>
            {viewMode === 'medical' && <div>Medical Vehicles: {medicalVehicles.length}</div>}
            <div>Coordinates: {coordinates.length}</div>
            <div>Map loaded: {mapLoaded ? 'Yes' : 'No'}</div>
            <div>3D model ready: {modelReady ? 'Yes' : 'No'}</div>
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
      </MapGL>
      
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
