/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  AlertTriangle,
  CloudRain,
  Compass,
  Layers,
  Radio,
  RefreshCw,
  Sparkles,
  Sun,
  Thermometer,
  Wind,
  X,
} from 'lucide-react';
import { APP_CONFIG, CITIES } from '../config.ts';
import { CityOutlook, RiskCategory } from '../types.ts';
import { scoreToCategory } from '../riskEngine.ts';
import {
  DEFAULT_UAE_VIEW,
  MAP_ZOOM_BOUNDS,
  MapViewState,
  UAE_MAP_BOUNDS,
  getMapViewState,
  resetMapViewState,
  updateMapViewState,
} from '../mapViewState.ts';

export {
  DEFAULT_UAE_VIEW,
  MAP_ZOOM_BOUNDS,
  type MapViewState,
  UAE_MAP_BOUNDS,
  getMapViewState,
  resetMapViewState,
  updateMapViewState,
};

import {
  AEROSOL_INDEX_LEVELS,
  AOD_LEVELS,
  AerosolCellData,
  AerosolDetectionConfig,
  AirQualityCellData,
  AirQualityMetric,
  DUST_RISK_LEVELS,
  GridCell,
  OverlayDataResult,
  OverlayType,
  RAINFALL_LEVELS,
  RainfallCellData,
  TemperatureCellData,
  UAE_GRID_CELLS,
  UAE_RASTER_BOUNDS,
  fetchGridAerosol,
  fetchGridAirQuality,
  fetchGridRainfall,
  fetchGridTemperature,
  generateRasterDataUrl,
  getAerosolDetectionConfig,
  getAirQualityColor,
  getAodColor,
  getRainfallColor,
  getTemperatureColor,
  interpolateValueAtPoint,
} from '../overlayService.ts';

interface UaeMapProps {
  outlooks: Record<string, CityOutlook>;
  selectedCityId: string;
  onSelectCity: (cityId: string) => void;
  viewMode: 'highest12h' | 'now';
  isDemoMode?: boolean;
}

export const UaeMap: React.FC<UaeMapProps> = ({
  outlooks,
  selectedCityId,
  onSelectCity,
  viewMode,
  isDemoMode = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const gridMarkersRef = useRef<Record<string, L.Marker>>({});
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const aerosolTileLayerRef = useRef<L.TileLayer | null>(null);

  // Active overlay state - default to continuous atmospheric dust risk overlay
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>('dust_risk');
  const [aqMetric, setAqMetric] = useState<AirQualityMetric>('us_aqi');
  const [showGridReadings, setShowGridReadings] = useState<boolean>(true);
  const [isLoadingOverlay, setIsLoadingOverlay] = useState<boolean>(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  // Hover sampling coordinates
  const [hoverSample, setHoverSample] = useState<{
    lat: number;
    lon: number;
    valText: string;
    categoryText: string;
    metricLabel: string;
  } | null>(null);

  // Mobile legend expandable state
  const [mobileLegendOpen, setMobileLegendOpen] = useState<boolean>(false);

  // Fetched data caches in component state
  const [tempData, setTempData] = useState<OverlayDataResult<TemperatureCellData> | null>(null);
  const [aqData, setAqData] = useState<OverlayDataResult<AirQualityCellData> | null>(null);
  const [aerosolData, setAerosolData] = useState<OverlayDataResult<AerosolCellData> | null>(null);
  const [rainfallData, setRainfallData] = useState<OverlayDataResult<RainfallCellData> | null>(null);
  const [aerosolMeta, setAerosolMeta] = useState<AerosolDetectionConfig | null>(null);

  // Initialize Leaflet Map: default to UAE on fresh start or preserve user pan/zoom coordinates
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initialView = getMapViewState();

    // Map navigation strictly restricted to UAE boundaries without snapping or jitter
    const map = L.map(mapContainerRef.current, {
      center: initialView.center,
      zoom: initialView.zoom,
      minZoom: MAP_ZOOM_BOUNDS.minZoom,
      maxZoom: MAP_ZOOM_BOUNDS.maxZoom,
      maxBounds: UAE_MAP_BOUNDS,
      maxBoundsViscosity: 1.0, // Hard stop at bounds, prevents dragging outside UAE or jittery bouncing
      scrollWheelZoom: true,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: MAP_ZOOM_BOUNDS.minZoom,
      maxZoom: MAP_ZOOM_BOUNDS.maxZoom,
      maxNativeZoom: MAP_ZOOM_BOUNDS.osmMaxNativeZoom,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Track user movements so center and zoom persist across screen navigation and data updates
    const handleMoveOrZoom = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      updateMapViewState([center.lat, center.lng], zoom);
    };

    map.on('moveend', handleMoveOrZoom);
    map.on('zoomend', handleMoveOrZoom);

    mapInstanceRef.current = map;
    setMapInstance(map);

    // Keep map and overlay layers strictly aligned during resizing without causing panning shifts
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      map.off('moveend', handleMoveOrZoom);
      map.off('zoomend', handleMoveOrZoom);
      resizeObserver.disconnect();
      Object.values(gridMarkersRef.current).forEach((m) => m.remove());
      gridMarkersRef.current = {};
      map.remove();
      mapInstanceRef.current = null;
      setMapInstance(null);
      imageOverlayRef.current = null;
      aerosolTileLayerRef.current = null;
    };
  }, []);

  // Update city markers
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    // When station readings are toggled off during an active overlay (dust_risk, etc.), hide the municipal marker pins
    if (!showGridReadings && activeOverlay !== 'none') {
      return;
    }

    CITIES.forEach((city) => {
      const outlook = outlooks[city.id];
      const category: RiskCategory = outlook
        ? viewMode === 'highest12h'
          ? outlook.peakLevel
          : outlook.levelNow
        : 'Low';

      const colorCfg = APP_CONFIG.colors[category];
      const isSelected = city.id === selectedCityId;

      const markerHtml = `
        <div class="relative flex flex-col items-center group cursor-pointer focus:outline-none" role="button" tabindex="0" aria-label="${city.name}, Risk: ${category}">
          <div
            style="background-color: ${colorCfg.bg}; color: ${colorCfg.text}; border: ${isSelected ? '3px solid #244C3B' : '2px solid white'};"
            class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-all duration-200 transform ${
              isSelected ? 'scale-120 ring-4 ring-[#244C3B]/30' : 'hover:scale-110'
            }"
          >
            ${colorCfg.abbr}
          </div>
          ${
            isSelected
              ? `<div class="mt-1 bg-white text-[#1E2522] border border-[#CBD5CD] px-2.5 py-0.5 rounded-md shadow-xs text-xs font-bold whitespace-nowrap transition-all">
                   ${city.name}: ${category}
                 </div>`
              : `<div class="mt-0.5 bg-[#1E2522]/90 text-white px-2 py-0.5 rounded text-[10px] font-medium hidden group-hover:block whitespace-nowrap shadow-xs">
                   ${city.name}
                 </div>`
          }
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-city-marker',
        html: markerHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker([city.latitude, city.longitude], {
        icon: customIcon,
        riseOnHover: true,
        zIndexOffset: 1000, // City markers remain elevated on top of all raster/grid overlays
        alt: `${city.name} ${category}`,
      });

      marker.on('click', () => {
        onSelectCity(city.id);
      });

      marker.addTo(map);
      markersRef.current[city.id] = marker;
    });
  }, [mapInstance, outlooks, selectedCityId, viewMode, onSelectCity, showGridReadings, activeOverlay]);

  // Load overlay data when activeOverlay or isDemoMode changes
  const loadOverlayData = useCallback(async (overlay: OverlayType, demo = isDemoMode) => {
    setOverlayError(null);
    setHoverSample(null);
    if (overlay === 'none' || overlay === 'dust_risk') {
      return;
    }

    setIsLoadingOverlay(true);
    try {
      if (overlay === 'temperature') {
        // Temperature layer is explicitly excluded from demo changes as per requirements
        const data = await fetchGridTemperature();
        setTempData(data);
      } else if (overlay === 'air_quality') {
        const data = await fetchGridAirQuality(false, demo);
        setAqData(data);
      } else if (overlay === 'aerosol') {
        const aerosolConfig = getAerosolDetectionConfig(undefined, demo);
        setAerosolMeta(aerosolConfig);
        const data = await fetchGridAerosol(false, demo);
        const validCells = data.cells.filter((c) => c.status === 'ok' && c.aod !== null);
        if (validCells.length === 0) {
          setAerosolData(null);
          setOverlayError('Aerosol Optical Depth (AOD) data is currently unavailable. No synthetic data is displayed.');
        } else {
          setAerosolData(data);
        }
      } else if (overlay === 'rainfall') {
        const data = await fetchGridRainfall(false, demo);
        const validCells = data.cells.filter((c) => c.status === 'ok' && c.precipitationMm !== null);
        if (validCells.length === 0) {
          setRainfallData(null);
          setOverlayError('NWP precipitation data is currently unavailable. Missing data is never treated as zero.');
        } else {
          setRainfallData(data);
        }
      } else if (overlay === 'satellite_omps') {
        let aerosolConfig = getAerosolDetectionConfig(undefined, demo);
        setAerosolMeta(aerosolConfig);

        if (!demo) {
          // Pre-validate today's swath availability; if NASA GIBS hasn't ingested today yet (HTTP 404), gracefully fallback to yesterday's completed daily swath
          try {
            const testTileUrl = aerosolConfig.tileUrl
              .replace('{z}', '6')
              .replace('{y}', '27')
              .replace('{x}', '41');
            const checkRes = await fetch(testTileUrl, { method: 'HEAD' });
            if (!checkRes.ok && checkRes.status === 404) {
              const yesterday = new Date(Date.now() - 86400000);
              const yDateStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;
              aerosolConfig = getAerosolDetectionConfig(yDateStr, false);
              setAerosolMeta(aerosolConfig);
            }
          } catch {
            // Network / offline check error: continue with initial config safely
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load overlay';
      setOverlayError(msg);
    } finally {
      setIsLoadingOverlay(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    loadOverlayData(activeOverlay, isDemoMode);
  }, [activeOverlay, isDemoMode, loadOverlayData]);

  // Render continuous raster or aerosol satellite layers onto Leaflet
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    // 0. Remove previous grid markers if present
    Object.values(gridMarkersRef.current).forEach((m) => m.remove());
    gridMarkersRef.current = {};

    // 1. Remove previous continuous image overlay if present
    if (imageOverlayRef.current) {
      imageOverlayRef.current.remove();
      imageOverlayRef.current = null;
    }

    // 2. Remove previous aerosol tile layer if present
    if (aerosolTileLayerRef.current) {
      aerosolTileLayerRef.current.remove();
      aerosolTileLayerRef.current = null;
    }

    // 3. Render according to active overlay
    if (activeOverlay === 'dust_risk') {
      const points = CITIES.map((city) => {
        const outlook = outlooks[city.id];
        const score = outlook
          ? viewMode === 'highest12h'
            ? outlook.peakScore
            : outlook.scoreNow
          : null;
        return {
          lat: city.latitude,
          lon: city.longitude,
          value: score !== undefined && score !== null && Number.isFinite(score) ? score : null,
        };
      });

      const validPoints = points.filter((p) => p.value !== null && Number.isFinite(p.value));

      if (validPoints.length === 0) {
        setOverlayError('Atmospheric dust risk data is currently unavailable. No synthetic surface is displayed.');
      } else {
        setOverlayError(null);
        const dataUrl = generateRasterDataUrl(points, 'dust_risk', 320, 240, UAE_RASTER_BOUNDS, 2.5);
        if (dataUrl) {
          const overlay = L.imageOverlay(dataUrl, UAE_RASTER_BOUNDS, {
            opacity: 0.78,
            interactive: false,
            className: 'dust-risk-raster-overlay',
            zIndex: 10,
          });

          overlay.on('error', () => {
            setOverlayError('Failed to display continuous dust risk surface.');
          });

          overlay.addTo(map);
          overlay.bringToFront();
          imageOverlayRef.current = overlay;
        }
      }
    } else if (activeOverlay === 'rainfall' && rainfallData) {
      const points = rainfallData.cells.map((c) => ({
        lat: c.lat,
        lon: c.lon,
        value: c.precipitationMm,
      }));

      const validPoints = points.filter((p) => p.value !== null && Number.isFinite(p.value));
      if (validPoints.length === 0) {
        setOverlayError('NWP precipitation data is currently unavailable. Missing data is never treated as zero.');
      } else {
        setOverlayError(null);
        const dataUrl = generateRasterDataUrl(points, 'rainfall', 320, 240, UAE_RASTER_BOUNDS, 1.45);
        if (dataUrl) {
          const overlay = L.imageOverlay(dataUrl, UAE_RASTER_BOUNDS, {
            opacity: 0.78,
            interactive: false,
            className: 'rainfall-raster-overlay',
            zIndex: 10,
          });

          overlay.on('error', () => {
            setOverlayError('Failed to display continuous rainfall surface.');
          });

          overlay.addTo(map);
          overlay.bringToFront();
          imageOverlayRef.current = overlay;
        }
      }

      // Render honest NWP grid station readings across UAE
      if (showGridReadings) {
        rainfallData.cells.forEach((cell) => {
          let badgeHtml = '';
          const color = getRainfallColor(cell.precipitationMm);

          if (cell.status === 'ok' && cell.precipitationMm !== null) {
            if (cell.precipitationMm === 0.0) {
              badgeHtml = `
                <div class="cursor-pointer flex items-center justify-center bg-white/95 text-slate-700 border border-slate-300 rounded px-1 py-0.5 shadow-xs text-[10px] font-mono hover:border-blue-500 hover:scale-110 transition-transform">
                  <span>0.0mm</span>
                </div>
              `;
            } else {
              badgeHtml = `
                <div class="cursor-pointer flex items-center justify-center font-bold text-white rounded px-1.5 py-0.5 shadow-sm text-[10px] font-mono hover:scale-110 transition-transform" style="background-color: ${color.bg}; color: ${color.text};">
                  <span>${cell.precipitationMm.toFixed(1)}mm</span>
                </div>
              `;
            }
          } else {
            badgeHtml = `
              <div class="cursor-pointer flex items-center justify-center bg-amber-50 text-amber-800 border border-dashed border-amber-400 rounded px-1 py-0.5 text-[9px] font-mono">
                <span>N/A</span>
              </div>
            `;
          }

          const customIcon = L.divIcon({
            className: 'rainfall-grid-marker',
            html: badgeHtml,
            iconSize: [42, 20],
            iconAnchor: [21, 10],
          });

          const marker = L.marker([cell.lat, cell.lon], {
            icon: customIcon,
            riseOnHover: true,
            zIndexOffset: 500,
          });

          const intervalMin = cell.intervalSeconds ? Math.round(cell.intervalSeconds / 60) : 15;
          const statusText =
            cell.precipitationMm !== null
              ? `${cell.precipitationMm.toFixed(2)} mm (${color.intensity})`
              : 'Unavailable (N/A)';

          const popupContent = `
            <div class="text-xs p-1">
              <div class="font-bold text-gray-900">${cell.regionLabel || 'UAE NWP Station'}</div>
              <div class="text-[10px] text-gray-500">${cell.lat.toFixed(2)}°N, ${cell.lon.toFixed(2)}°E</div>
              ${
                isDemoMode
                  ? '<div class="mt-1 inline-block bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.5 rounded text-[10px]">DEMO — SIMULATED RAINFALL</div>'
                  : ''
              }
              <div class="mt-1.5 pt-1 border-t border-gray-200">
                <span class="font-semibold text-gray-700">Precipitation (${intervalMin}-min):</span>
                <span class="font-mono font-bold ml-1 ${cell.precipitationMm && cell.precipitationMm > 0 ? 'text-blue-700' : 'text-gray-900'}">
                  ${statusText}
                </span>
              </div>
              <div class="text-[10px] text-gray-500 mt-1">
                Forecast Interval: ${intervalMin} min model accumulation
              </div>
              <div class="text-[10px] text-gray-400 mt-1 italic leading-tight">
                ${
                  isDemoMode
                    ? 'Deterministic simulation for system evaluation. Not real-time observation.'
                    : 'Open-Meteo NWP (~0.4° resolution). Discrete model point reading.'
                }
              </div>
            </div>
          `;

          marker.bindPopup(popupContent);
          marker.addTo(map);
          gridMarkersRef.current[cell.cellId] = marker;
        });
      }
    } else if (activeOverlay === 'aerosol' && aerosolData) {
      const points = aerosolData.cells.map((c) => ({
        lat: c.lat,
        lon: c.lon,
        value: c.aod,
      }));

      const dataUrl = generateRasterDataUrl(points, 'aerosol', 280, 200, UAE_RASTER_BOUNDS);
      if (dataUrl) {
        const overlay = L.imageOverlay(dataUrl, UAE_RASTER_BOUNDS, {
          opacity: 0.72,
          interactive: false,
        });
        overlay.addTo(map);
        imageOverlayRef.current = overlay;
      }
    } else if (activeOverlay === 'temperature' && tempData) {
      // Build continuous raster canvas
      const points = tempData.cells.map((c) => ({
        lat: c.lat,
        lon: c.lon,
        value: c.temperatureC,
      }));

      const dataUrl = generateRasterDataUrl(points, 'temperature', 280, 200, UAE_RASTER_BOUNDS);
      if (dataUrl) {
        const overlay = L.imageOverlay(dataUrl, UAE_RASTER_BOUNDS, {
          opacity: 0.72,
          interactive: false,
        });
        overlay.addTo(map);
        imageOverlayRef.current = overlay;
      }
    } else if (activeOverlay === 'air_quality' && aqData) {
      // Extract values according to selected air quality metric
      const points = aqData.cells.map((c) => {
        let val: number | null = null;
        if (aqMetric === 'us_aqi') val = c.usAqi;
        else if (aqMetric === 'pm10') val = c.pm10;
        else if (aqMetric === 'pm2_5') val = c.pm2_5;
        else if (aqMetric === 'european_aqi') val = c.europeanAqi;
        return { lat: c.lat, lon: c.lon, value: val };
      });

      const dataUrl = generateRasterDataUrl(points, aqMetric, 280, 200, UAE_RASTER_BOUNDS);
      if (dataUrl) {
        const overlay = L.imageOverlay(dataUrl, UAE_RASTER_BOUNDS, {
          opacity: 0.74,
          interactive: false,
        });
        overlay.addTo(map);
        imageOverlayRef.current = overlay;
      }
    } else if (activeOverlay === 'satellite_omps' && aerosolMeta) {
      const tileLayer = L.tileLayer(aerosolMeta.tileUrl, {
        opacity: 0.65,
        minZoom: MAP_ZOOM_BOUNDS.minZoom,
        maxZoom: MAP_ZOOM_BOUNDS.maxZoom,
        maxNativeZoom: MAP_ZOOM_BOUNDS.ompsMaxNativeZoom,
        attribution: aerosolMeta.attribution,
      });
      tileLayer.addTo(map);
      aerosolTileLayerRef.current = tileLayer;
    }
  }, [activeOverlay, aqMetric, tempData, aqData, aerosolData, rainfallData, aerosolMeta, showGridReadings, outlooks, viewMode]);

  // Interactive mouse sampling over continuous raster
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    if (
      activeOverlay !== 'dust_risk' &&
      activeOverlay !== 'temperature' &&
      activeOverlay !== 'air_quality' &&
      activeOverlay !== 'aerosol' &&
      activeOverlay !== 'rainfall'
    ) {
      setHoverSample(null);
      return;
    }

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      const { lat, lng: lon } = e.latlng;
      const [[south, west], [north, east]] = UAE_RASTER_BOUNDS;

      if (lat < south || lat > north || lon < west || lon > east) {
        setHoverSample(null);
        return;
      }

      if (activeOverlay === 'dust_risk') {
        const points = CITIES.map((city) => {
          const outlook = outlooks[city.id];
          const score = outlook
            ? viewMode === 'highest12h'
              ? outlook.peakScore
              : outlook.scoreNow
            : null;
          return {
            lat: city.latitude,
            lon: city.longitude,
            value: score !== undefined && score !== null && Number.isFinite(score) ? score : null,
          };
        });
        const val = interpolateValueAtPoint(lat, lon, points, 2.5, 2);
        if (val !== null) {
          const rounded = Math.round(val);
          const cat = scoreToCategory(rounded);
          setHoverSample({
            lat,
            lon,
            valText: `${rounded} / 100 (${cat})`,
            categoryText: `${cat} Dust Risk`,
            metricLabel: `Estimated Regional Dust Risk (${viewMode === 'highest12h' ? '12h Peak' : 'Current'})`,
          });
        } else {
          setHoverSample(null);
        }
      } else if (activeOverlay === 'rainfall' && rainfallData) {
        const points = rainfallData.cells.map((c) => ({
          lat: c.lat,
          lon: c.lon,
          value: c.precipitationMm,
        }));
        const val = interpolateValueAtPoint(lat, lon, points, 1.45, 2);
        if (val !== null) {
          const rounded = Math.round(val * 100) / 100;
          const color = getRainfallColor(rounded);
          setHoverSample({
            lat,
            lon,
            valText: `${rounded.toFixed(2)} mm`,
            categoryText: color.label,
            metricLabel: isDemoMode
              ? 'DEMO — Simulated Precipitation (15-min)'
              : 'Accumulated Precipitation (15-min Forecast)',
          });
        } else {
          setHoverSample(null);
        }
      } else if (activeOverlay === 'temperature' && tempData) {
        const points = tempData.cells.map((c) => ({
          lat: c.lat,
          lon: c.lon,
          value: c.temperatureC,
        }));
        const val = interpolateValueAtPoint(lat, lon, points, 1.35, 2);
        if (val !== null) {
          const color = getTemperatureColor(val);
          setHoverSample({
            lat,
            lon,
            valText: `${Math.round(val * 10) / 10} °C`,
            categoryText: color.label,
            metricLabel: '2m Ambient Temperature',
          });
        } else {
          setHoverSample(null);
        }
      } else if (activeOverlay === 'air_quality' && aqData) {
        let unit = '';
        let label = 'US EPA AQI';
        const points = aqData.cells.map((c) => {
          let v: number | null = null;
          if (aqMetric === 'us_aqi') { v = c.usAqi; unit = 'AQI'; label = 'US EPA AQI'; }
          else if (aqMetric === 'pm10') { v = c.pm10; unit = 'µg/m³'; label = 'PM10 Particulate'; }
          else if (aqMetric === 'pm2_5') { v = c.pm2_5; unit = 'µg/m³'; label = 'PM2.5 Particles'; }
          else if (aqMetric === 'european_aqi') { v = c.europeanAqi; unit = 'EAQI'; label = 'European AQI'; }
          return { lat: c.lat, lon: c.lon, value: v };
        });

        const val = interpolateValueAtPoint(lat, lon, points, 1.35, 2);
        if (val !== null) {
          const rounded = Math.round(val * 10) / 10;
          const color = getAirQualityColor(aqMetric, rounded);
          setHoverSample({
            lat,
            lon,
            valText: `${rounded} ${unit}`,
            categoryText: color.category,
            metricLabel: isDemoMode ? `DEMO — Simulated ${label}` : label,
          });
        } else {
          setHoverSample(null);
        }
      } else if (activeOverlay === 'aerosol' && aerosolData) {
        const points = aerosolData.cells.map((c) => ({
          lat: c.lat,
          lon: c.lon,
          value: c.aod,
        }));
        const val = interpolateValueAtPoint(lat, lon, points, 1.35, 2);
        if (val !== null) {
          const rounded = Math.round(val * 100) / 100;
          const color = getAodColor(rounded);
          setHoverSample({
            lat,
            lon,
            valText: `${rounded.toFixed(2)} AOD`,
            categoryText: color.label,
            metricLabel: isDemoMode ? 'DEMO — Simulated Aerosol Optical Depth (550nm)' : 'Aerosol Optical Depth (550nm)',
          });
        } else {
          setHoverSample(null);
        }
      }
    };

    map.on('mousemove', handleMouseMove);
    return () => {
      map.off('mousemove', handleMouseMove);
    };
  }, [mapInstance, activeOverlay, aqMetric, tempData, aqData, aerosolData, rainfallData, outlooks, viewMode, isDemoMode]);

  const handleResetToUae = useCallback(() => {
    const map = mapInstanceRef.current;
    const def = resetMapViewState();
    if (map) {
      map.setView(def.center, def.zoom);
    }
  }, []);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-[#DFCBB3] bg-[#F7F1E8] shadow-xs flex flex-col">
      {/* 1. Interactive Layer Selector Bar */}
      <div className="bg-[#FFFDFB] border-b border-[#DFCBB3] p-2 sm:p-2.5 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        {/* Horizontally scrollable overlay pills on mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto shrink-0 touch-pan-x">
          <span className="font-bold text-[#713F2B] flex items-center gap-1 mr-1 shrink-0 text-xs">
            <Layers className="w-4 h-4 text-[#E8874A]" />
            <span className="hidden xs:inline">Overlays:</span>
          </span>

          <button
            type="button"
            onClick={() => setActiveOverlay('dust_risk')}
            className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] text-xs ${
              activeOverlay === 'dust_risk'
                ? 'bg-[#244C3B] text-white shadow-xs'
                : 'bg-[#E8D2B4]/40 text-[#713F2B] border border-[#DFCBB3] hover:bg-[#E8D2B4]/80 font-bold'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#E8874A]" />
            <span>Dust Risk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOverlay('none')}
            className={`px-3 py-2 rounded-lg font-semibold transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] text-xs ${
              activeOverlay === 'none'
                ? 'bg-[#244C3B] text-white shadow-xs'
                : 'bg-[#F7F1E8] text-[#5A453A] border border-[#DFCBB3] hover:bg-[#E8D2B4]/40 hover:text-[#713F2B]'
            }`}
          >
            Stations (10)
          </button>

          <button
            type="button"
            onClick={() => setActiveOverlay('temperature')}
            className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] text-xs ${
              activeOverlay === 'temperature'
                ? 'bg-[#244C3B] text-white shadow-xs'
                : 'bg-[#F7F1E8] text-[#5A453A] border border-[#DFCBB3] hover:bg-[#E8D2B4]/40 hover:text-[#713F2B]'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5 text-amber-600" />
            <span>Temperature</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOverlay('rainfall')}
            className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] text-xs ${
              activeOverlay === 'rainfall'
                ? 'bg-[#244C3B] text-white shadow-xs'
                : 'bg-[#F7F1E8] text-[#5A453A] border border-[#DFCBB3] hover:bg-[#E8D2B4]/40 hover:text-[#713F2B]'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5 text-sky-600" />
            <span>Rainfall</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOverlay('air_quality')}
            className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] text-xs ${
              activeOverlay === 'air_quality'
                ? 'bg-[#244C3B] text-white shadow-xs'
                : 'bg-[#F7F1E8] text-[#5A453A] border border-[#DFCBB3] hover:bg-[#E8D2B4]/40 hover:text-[#713F2B]'
            }`}
          >
            <Wind className="w-3.5 h-3.5 text-purple-600" />
            <span>Air Quality</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOverlay('aerosol')}
            className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] text-xs ${
              activeOverlay === 'aerosol'
                ? 'bg-[#244C3B] text-white shadow-xs'
                : 'bg-[#F7F1E8] text-[#5A453A] border border-[#DFCBB3] hover:bg-[#E8D2B4]/40 hover:text-[#713F2B]'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-600" />
            <span>Aerosol (CAMS)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOverlay('satellite_omps')}
            className={`px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] text-xs ${
              activeOverlay === 'satellite_omps'
                ? 'bg-[#244C3B] text-white shadow-xs'
                : 'bg-[#F7F1E8] text-[#5A453A] border border-[#DFCBB3] hover:bg-[#E8D2B4]/40 hover:text-[#713F2B]'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-600" />
            <span>NASA Satellite</span>
          </button>
        </div>

        {/* Navigation Action & Loading Indicator */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleResetToUae}
            title="Reset map view to UAE overview"
            className="px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer bg-white border border-[#DFCBB3] text-[#713F2B] hover:bg-[#E8D2B4]/30 hover:text-[#244C3B] shadow-2xs min-h-[40px] text-xs"
          >
            <Compass className="w-4 h-4 text-[#E8874A]" />
            <span>Reset to UAE</span>
          </button>

          {isLoadingOverlay && (
            <span className="flex items-center gap-1 text-[11px] text-[#713F2B] font-semibold bg-[#E8D2B4]/40 px-2.5 py-1.5 rounded-lg border border-[#DFCBB3] min-h-[40px]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#E8874A]" />
              <span className="hidden md:inline">
                {activeOverlay === 'rainfall'
                  ? 'Loading NWP precipitation raster...'
                  : activeOverlay === 'aerosol'
                  ? 'Loading CAMS AOD raster...'
                  : activeOverlay === 'satellite_omps'
                  ? 'Configuring OMPS layer...'
                  : 'Generating raster...'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* 1a. Dust Risk Surface Statistics & Station Readings Toggle (When Dust Risk Overlay is Active) */}
      {activeOverlay === 'dust_risk' && (
        <div className="bg-amber-50/80 border-b border-amber-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-amber-950 text-[11px]">Continuous Dust Risk Surface:</span>
            <span className="text-[11px] text-amber-900 bg-white border border-amber-200 px-2 py-0.5 rounded font-mono">
              {viewMode === 'highest12h' ? '12-Hour Peak Forecast' : 'Current Evaluated Risk'} •{' '}
              {(() => {
                const reporting = CITIES.filter((c) => {
                  const o = outlooks[c.id];
                  const s = o ? (viewMode === 'highest12h' ? o.peakScore : o.scoreNow) : null;
                  return s !== null && s !== undefined && Number.isFinite(s);
                });
                return `${reporting.length}/10 municipal stations reporting`;
              })()}
            </span>
            <span className="text-[11px] text-amber-800/80 hidden sm:inline italic">
              Continuous IDW interpolation between municipal locations (p=2.5)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGridReadings((prev) => !prev)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer border transition-colors min-h-[36px] active:scale-[0.98] ${
                showGridReadings
                  ? 'bg-amber-700 text-white border-amber-700 shadow-xs'
                  : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
              }`}
            >
              {showGridReadings ? 'Hide Station Readings (10)' : 'Show Station Readings (10)'}
            </button>
          </div>
        </div>
      )}

      {/* 1b. Air Quality Metric Sub-selector (When Air Quality Overlay is Active) */}
      {activeOverlay === 'air_quality' && (
        <div className="bg-purple-50/70 border-b border-purple-200 px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-purple-950 text-[11px] shrink-0">
            {isDemoMode ? 'DEMO — Simulated Air Quality Metric:' : 'Select Air Quality Metric:'}
          </span>
          {isDemoMode && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 shrink-0">
              DEMO DATA
            </span>
          )}
          <div className="flex items-center rounded-lg p-0.5 bg-white border border-purple-200 gap-1 overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setAqMetric('us_aqi')}
              className={`px-2.5 py-1.5 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap min-h-[36px] ${
                aqMetric === 'us_aqi' ? 'bg-purple-700 text-white shadow-xs' : 'text-purple-950 hover:bg-purple-100'
              }`}
            >
              US EPA AQI (0–500)
            </button>
            <button
              type="button"
              onClick={() => setAqMetric('pm10')}
              className={`px-2.5 py-1.5 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap min-h-[36px] ${
                aqMetric === 'pm10' ? 'bg-purple-700 text-white shadow-xs' : 'text-purple-950 hover:bg-purple-100'
              }`}
            >
              PM10 (µg/m³)
            </button>
            <button
              type="button"
              onClick={() => setAqMetric('pm2_5')}
              className={`px-2.5 py-1.5 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap min-h-[36px] ${
                aqMetric === 'pm2_5' ? 'bg-purple-700 text-white shadow-xs' : 'text-purple-950 hover:bg-purple-100'
              }`}
            >
              PM2.5 (µg/m³)
            </button>
            <button
              type="button"
              onClick={() => setAqMetric('european_aqi')}
              className={`px-2.5 py-1.5 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap min-h-[36px] ${
                aqMetric === 'european_aqi' ? 'bg-purple-700 text-white shadow-xs' : 'text-purple-950 hover:bg-purple-100'
              }`}
            >
              European AQI (0–100)
            </button>
          </div>
        </div>
      )}

      {/* 1c. Rainfall Station Statistics & Toggle (When Rainfall Overlay is Active) */}
      {activeOverlay === 'rainfall' && (
        <div className="bg-sky-50/80 border-b border-sky-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sky-950 text-[11px]">
              {isDemoMode ? 'DEMO — Simulated NWP Precipitation:' : 'NWP Precipitation Observations:'}
            </span>
            {rainfallData && (
              <span className="text-[11px] text-sky-900 bg-white border border-sky-200 px-2 py-0.5 rounded font-mono">
                {rainfallData.cells.filter((c) => c.status === 'ok').length}/36 stations reporting •{' '}
                {(() => {
                  const rainy = rainfallData.cells.filter((c) => c.status === 'ok' && c.precipitationMm !== null && c.precipitationMm > 0);
                  if (rainy.length === 0) return 'All stations 0.00 mm (Dry across UAE)';
                  const maxVal = Math.max(...rainy.map((c) => c.precipitationMm || 0));
                  return `Rain forecast at ${rainy.length} station(s) (Max: ${maxVal.toFixed(2)} mm)`;
                })()}
              </span>
            )}
            {isDemoMode && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                DEMO — SIMULATED RAINFALL
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGridReadings((prev) => !prev)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer border transition-colors ${
                showGridReadings
                  ? 'bg-sky-700 text-white border-sky-700 shadow-xs'
                  : 'bg-white text-sky-900 border-sky-300 hover:bg-sky-100'
              }`}
            >
              {showGridReadings ? 'Hide Station Readings (36)' : 'Show Station Readings (36)'}
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {overlayError && (
        <div className="bg-red-50 border-b border-red-300 p-2 text-xs text-red-900 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{overlayError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadOverlayData(activeOverlay)}
            className="px-2 py-0.5 bg-red-700 hover:bg-red-800 text-white rounded text-[11px] font-semibold cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Map Canvas Container - Expanded for comfortable mobile interaction */}
      <div className="relative w-full h-[410px] sm:h-[490px] md:h-[550px]">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Live Hover Sample Badge (Bottom Left) */}
        {hoverSample && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm border border-[#D5D9DF] rounded-lg px-2.5 py-1.5 shadow-md text-xs pointer-events-none max-w-[200px] sm:max-w-none">
            <div className="text-[10px] text-[#4A4F57] uppercase tracking-wider font-semibold truncate">
              Sample ({hoverSample.lat.toFixed(2)}°N, {hoverSample.lon.toFixed(2)}°E)
            </div>
            <div className="font-bold text-[#1A1A1A] mt-0.5 truncate">
              {hoverSample.metricLabel}: <span className="text-blue-700">{hoverSample.valText}</span>
            </div>
            <div className="text-[11px] text-[#5F6368] truncate">
              Classification: {hoverSample.categoryText}
            </div>
          </div>
        )}

        {/* Mobile Legend Expand Button (phones only, when collapsed) */}
        {!mobileLegendOpen && (
          <button
            type="button"
            onClick={() => setMobileLegendOpen(true)}
            className="sm:hidden absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm border border-[#D5D9DF] rounded-lg px-3 py-1.5 shadow-md text-xs font-bold text-[#713F2B] flex items-center gap-1.5 cursor-pointer interactive-tap min-h-[38px]"
            aria-label="Open Map Legend"
          >
            <Layers className="w-3.5 h-3.5 text-[#E8874A]" />
            <span>Legend</span>
          </button>
        )}

        {/* Dynamic Map Legend Overlay (Always visible on sm+, expandable on phones) */}
        <div
          className={`${
            mobileLegendOpen ? 'block' : 'hidden sm:block'
          } absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm border border-[#D5D9DF] rounded-xl p-3 shadow-md text-xs max-w-[240px] max-h-[340px] overflow-y-auto`}
        >
          {/* Mobile Close Button header */}
          <div className="flex sm:hidden items-center justify-between pb-2 mb-2 border-b border-gray-200">
            <span className="font-bold text-[#713F2B] text-xs flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#E8874A]" />
              <span>Map Legend</span>
            </span>
            <button
              type="button"
              onClick={() => setMobileLegendOpen(false)}
              className="p-1 text-gray-500 hover:text-black rounded min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer"
              aria-label="Close Map Legend"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {activeOverlay === 'dust_risk' && (
            <div>
              <div className="font-bold text-[#1A1A1A] mb-0.5">Atmospheric Dust Risk</div>
              <div className="text-[10px] text-[#5F6368] mb-1.5 font-medium">
                {viewMode === 'highest12h' ? '12-Hour Peak Forecast Surface' : 'Current Continuous Surface'}
              </div>
              {Object.values(outlooks).length > 0 ? (
                <>
                  {/* Continuous Gradient Bar: Yellow -> Orange -> Red */}
                  <div
                    className="h-2.5 w-full rounded mb-1.5"
                    style={{ background: 'linear-gradient(to right, #fef08a, #facc15, #f59e0b, #f97316, #ef4444, #991b1b)' }}
                  />
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded shrink-0" style={{ backgroundColor: '#facc15' }} />
                      <span><strong>0–24:</strong> Low (Yellow)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                      <span><strong>25–49:</strong> Moderate (Amber)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded shrink-0" style={{ backgroundColor: '#f97316' }} />
                      <span><strong>50–74:</strong> High (Vivid Orange)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded shrink-0" style={{ backgroundColor: '#ef4444' }} />
                      <span><strong>75–100:</strong> Very High (Red)</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-gray-200 text-[10px] text-[#5F6368] leading-tight">
                    Continuous surface resampled via IDW spatial interpolation from 10 municipal stations. Discrete stations do not constitute a native continuous sensor grid.
                  </div>
                </>
              ) : (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900">
                  <div className="font-semibold">Dust Risk Unavailable</div>
                  <div className="text-[10px] mt-0.5 text-amber-800">
                    Station evaluations are missing. No synthetic surface is generated.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeOverlay === 'none' && (
            <div>
              <div className="font-semibold text-[#1A1A1A] mb-1.5">City Risk Levels</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    style={{ backgroundColor: APP_CONFIG.colors.Low.bg, color: APP_CONFIG.colors.Low.text }}
                    className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px]"
                  >
                    L
                  </span>
                  <span className="text-[#1A1A1A]">Low</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    style={{ backgroundColor: APP_CONFIG.colors.Moderate.bg, color: APP_CONFIG.colors.Moderate.text }}
                    className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px]"
                  >
                    M
                  </span>
                  <span className="text-[#1A1A1A]">Moderate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    style={{ backgroundColor: APP_CONFIG.colors.High.bg, color: APP_CONFIG.colors.High.text }}
                    className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px]"
                  >
                    H
                  </span>
                  <span className="text-[#1A1A1A]">High</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    style={{ backgroundColor: APP_CONFIG.colors['Very High'].bg, color: APP_CONFIG.colors['Very High'].text }}
                    className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px]"
                  >
                    VH
                  </span>
                  <span className="text-[#1A1A1A]">Very High</span>
                </div>
              </div>
            </div>
          )}

          {activeOverlay === 'temperature' && (
            <div>
              <div className="font-bold text-[#1A1A1A] mb-1">Continuous Temperature (°C)</div>
              {/* Continuous Gradient Bar */}
              <div className="h-2.5 w-full rounded mb-1.5" style={{ background: 'linear-gradient(to right, #3b82f6, #06b6d4, #10b981, #f59e0b, #ea580c, #b91c1c)' }} />
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded" style={{ backgroundColor: '#3b82f6' }} />
                  <span>&lt; 20°C (Mild)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded" style={{ backgroundColor: '#06b6d4' }} />
                  <span>20–25°C</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded" style={{ backgroundColor: '#10b981' }} />
                  <span>26–31°C</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded" style={{ backgroundColor: '#f59e0b' }} />
                  <span>32–37°C</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded" style={{ backgroundColor: '#ea580c' }} />
                  <span>38–43°C</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded" style={{ backgroundColor: '#b91c1c' }} />
                  <span>≥ 44°C (Extreme)</span>
                </div>
              </div>
            </div>
          )}

          {activeOverlay === 'rainfall' && (
            <div>
              <div className="font-bold text-[#1A1A1A] mb-0.5">
                {isDemoMode ? 'DEMO — Simulated Rainfall' : 'Accumulated Rainfall (mm)'}
              </div>
              <div className="text-[10px] text-[#5F6368] mb-1.5 font-medium">
                {isDemoMode ? 'DEMO — Simulated NWP Convective Event' : 'Open-Meteo NWP Forecast (15-min Interval)'}
              </div>
              {rainfallData ? (
                <>
                  {/* Continuous Gradient Bar */}
                  <div
                    className="h-2.5 w-full rounded mb-1.5"
                    style={{ background: 'linear-gradient(to right, #cbd5e1, #38bdf8, #0284c7, #16a34a, #eab308, #ea580c, #dc2626)' }}
                  />
                  <div className="space-y-1 text-[11px]">
                    {RAINFALL_LEVELS.map((lvl) => (
                      <div key={lvl.range} className="flex items-center gap-1.5">
                        <span className="w-3 h-2.5 rounded shrink-0" style={{ backgroundColor: lvl.color }} />
                        <span className="truncate"><strong>{lvl.range}:</strong> {lvl.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900">
                  <div className="font-semibold">Rainfall Data Unavailable</div>
                  <div className="text-[10px] mt-0.5 text-amber-800">
                    Precipitation forecast data could not be retrieved. Missing data is never treated as zero.
                  </div>
                </div>
              )}
              <div className="mt-2 pt-1.5 border-t border-gray-200 text-[10px] text-[#5F6368] leading-tight">
                {isDemoMode
                  ? 'DEMO — SIMULATED RAINFALL. Deterministic convective event for system evaluation. Not real forecast.'
                  : 'Represents accumulated liquid precipitation (mm) over the preceding model forecast interval, NOT instantaneous precipitation rate (mm/h). Discrete city stations do not constitute a continuous observed rainfall field.'}
              </div>
            </div>
          )}

          {activeOverlay === 'air_quality' && (
            <div>
              <div className="font-bold text-[#1A1A1A] mb-0.5">
                {isDemoMode ? 'DEMO — Simulated Air Quality' : 'Continuous Air Quality'}
              </div>
              <div className="text-[10px] text-[#5F6368] mb-1 font-medium">
                {aqMetric === 'us_aqi' && (isDemoMode ? 'DEMO — US EPA AQI (0–500)' : 'US EPA AQI (0–500)')}
                {aqMetric === 'pm10' && (isDemoMode ? 'DEMO — PM10 Particulate (µg/m³)' : 'PM10 Particulate (µg/m³)')}
                {aqMetric === 'pm2_5' && (isDemoMode ? 'DEMO — PM2.5 Particles (µg/m³)' : 'PM2.5 Particles (µg/m³)')}
                {aqMetric === 'european_aqi' && (isDemoMode ? 'DEMO — European AQI (0–100)' : 'European AQI (0–100)')}
              </div>
              {/* Continuous Gradient Bar */}
              <div className="h-2.5 w-full rounded mb-1.5" style={{ background: 'linear-gradient(to right, #10b981, #facc15, #f97316, #ef4444, #8b5cf6, #881337)' }} />
              <div className="space-y-1 text-[11px]">
                {aqMetric === 'us_aqi' && (
                  <>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#10b981]" /><span>0–50 Good</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#facc15]" /><span>51–100 Moderate</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#f97316]" /><span>101–150 Sensitive</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#ef4444]" /><span>151–200 Unhealthy</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#8b5cf6]" /><span>201–300 Very Unhealthy</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#881337]" /><span>301+ Hazardous</span></div>
                  </>
                )}
                {aqMetric === 'pm10' && (
                  <>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#10b981]" /><span>0–50 µg/m³ Low</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#facc15]" /><span>51–100 Moderate</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#f97316]" /><span>101–250 Elevated</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#ef4444]" /><span>251–400 High</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#881337]" /><span>&gt; 400 Hazardous</span></div>
                  </>
                )}
                {aqMetric === 'pm2_5' && (
                  <>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#10b981]" /><span>0–12 µg/m³ Good</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#facc15]" /><span>12.1–35.4 Moderate</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#f97316]" /><span>35.5–55.4 Sensitive</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#ef4444]" /><span>55.5–150.4 Unhealthy</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#881337]" /><span>&gt; 150.4 Very Unhealthy</span></div>
                  </>
                )}
                {aqMetric === 'european_aqi' && (
                  <>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#10b981]" /><span>0–20 Good</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#84cc16]" /><span>21–40 Fair</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#facc15]" /><span>41–60 Moderate</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#f97316]" /><span>61–80 Poor</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded bg-[#ef4444]" /><span>81–100 Very Poor</span></div>
                  </>
                )}
              </div>
              <div className="mt-2 pt-1.5 border-t border-gray-200 text-[10px] text-[#5F6368] leading-tight">
                {isDemoMode
                  ? 'DEMO — SIMULATED AIR QUALITY. Deterministic test scenario illustrating western Shamal dust transport. Not real CAMS observations.'
                  : 'Atmospheric particulate and air quality index dispersion model estimates (~0.25°–0.4° native resolution). Continuous IQAir-style surface is rendered via smooth spatial resampling.'}
              </div>
            </div>
          )}

          {activeOverlay === 'aerosol' && (
            <div>
              <div className="font-bold text-[#1A1A1A] mb-0.5">
                {isDemoMode ? 'DEMO — Simulated Aerosol AOD' : 'Aerosol Optical Depth (AOD)'}
              </div>
              <div className="text-[10px] text-[#5F6368] mb-1.5 font-medium">
                {isDemoMode ? 'DEMO — Simulated CAMS Optical Extinction (550nm)' : 'Copernicus CAMS Model (550nm)'}
              </div>
              {aerosolData ? (
                <>
                  {/* Continuous Gradient Bar */}
                  <div
                    className="h-2.5 w-full rounded mb-1.5"
                    style={{ background: 'linear-gradient(to right, #10b981, #84cc16, #facc15, #f97316, #ef4444, #881337)' }}
                  />
                  <div className="space-y-1 text-[11px]">
                    {AOD_LEVELS.map((lvl) => (
                      <div key={lvl.range} className="flex items-center gap-1.5">
                        <span className="w-3 h-2.5 rounded shrink-0" style={{ backgroundColor: lvl.color }} />
                        <span className="truncate"><strong>{lvl.range}:</strong> {lvl.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900">
                  <div className="font-semibold">AOD Data Unavailable</div>
                  <div className="text-[10px] mt-0.5 text-amber-800">
                    Model aerosol extinction data could not be retrieved. No synthetic or substitute data is displayed.
                  </div>
                </div>
              )}
              <div className="mt-2 pt-1.5 border-t border-gray-200 text-[10px] text-[#5F6368] leading-tight">
                {isDemoMode
                  ? 'DEMO — SIMULATED AOD. Synthetic atmospheric column optical depth at 550nm for layout testing. Not real CAMS observations.'
                  : 'Column-integrated measure of light extinction. Indicates atmospheric aerosol loading aloft; not direct ground-level PM10 or surface dust concentration.'}
              </div>
            </div>
          )}

          {activeOverlay === 'satellite_omps' && (
            <div>
              <div className="font-bold text-[#1A1A1A] mb-0.5">
                {isDemoMode ? 'DEMO — Historic OMPS Swath' : 'NASA OMPS Aerosol Index'}
              </div>
              <div className="text-[10px] text-[#5F6368] mb-1.5 font-medium">
                {isDemoMode ? 'Suomi-NPP Spaceborne Swath (2024-04-16 Historic Event)' : 'Suomi-NPP Spaceborne Satellite'}
              </div>
              <div className="space-y-1 text-[11px]">
                {AEROSOL_INDEX_LEVELS.map((lvl) => (
                  <div key={lvl.range} className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded shrink-0 border border-gray-300" style={{ backgroundColor: lvl.color }} />
                    <span className="truncate"><strong>{lvl.range}:</strong> {lvl.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-1.5 border-t border-gray-200 text-[10px] text-[#5F6368] leading-tight">
                {isDemoMode
                  ? 'DEMO — HISTORIC SATELLITE RETRIEVAL. Visualizing archived Suomi-NPP OMPS swath from 16 April 2024 for testing. Not real-time satellite telemetry.'
                  : 'UV Aerosol Index detects UV-absorbing particles (dust plumes & smoke aloft) across the atmospheric column. Does not quantify ground-level PM10 or surface dust.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Layer Metadata, Timestamp & Scientific Attribution Bar */}
      <div className="bg-[#FFFDFB] border-t border-[#DFCBB3] p-3 text-xs text-[#5A453A] space-y-1 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[#713F2B]">
              Active Layer:
            </span>
            <span className="px-1.5 py-0.2 rounded bg-amber-50 border border-amber-300 text-amber-950 font-semibold">
              {activeOverlay === 'dust_risk' && `Continuous Atmospheric Dust-Risk Surface (${viewMode === 'highest12h' ? '12-Hour Peak Forecast' : 'Current'})`}
              {activeOverlay === 'none' && 'Ten City Risk Monitoring Stations'}
              {activeOverlay === 'temperature' && 'Full-Country Continuous 2m Temperature Forecast Heatmap'}
              {activeOverlay === 'rainfall' && 'Full-Country Continuous Accumulated Rainfall Forecast (mm)'}
              {activeOverlay === 'air_quality' && `Full-Country Continuous Air Quality Heatmap: ${aqMetric.toUpperCase()}`}
              {activeOverlay === 'aerosol' && 'Copernicus CAMS Column Aerosol Optical Depth (AOD @ 550nm)'}
              {activeOverlay === 'satellite_omps' && 'NASA Suomi-NPP OMPS UV Aerosol Index (Satellite Observation)'}
            </span>
            <span className="text-[10px] text-gray-500">
              {activeOverlay === 'dust_risk' ? '[Proprietary Multi-Factor Risk Model (10 UAE Municipalities, IDW Resampled)]' : activeOverlay === 'rainfall' ? '[Atmospheric NWP Precipitation Forecast (~0.4° Resampled)]' : activeOverlay === 'aerosol' ? '[Atmospheric Composition NWP Forecast (~0.4° Resampled)]' : activeOverlay === 'satellite_omps' ? '[Spaceborne Satellite Observation (Daily Level 3)]' : activeOverlay === 'none' ? '' : '[Atmospheric NWP / CAMS Model Forecast (Resampled)]'}
            </span>
          </div>

          <div className="text-[10px] text-[#717680]">
            {activeOverlay === 'dust_risk' && `Updated: ${Object.values(outlooks)[0]?.fetchTime || 'Live Evaluated'}`}
            {activeOverlay === 'temperature' && tempData && `Model Run: ${tempData.timestamp}`}
            {activeOverlay === 'rainfall' && rainfallData && `Model Run: ${rainfallData.timestamp}`}
            {activeOverlay === 'air_quality' && aqData && `CAMS Model Run: ${aqData.timestamp}`}
            {activeOverlay === 'aerosol' && aerosolData && `CAMS Model Run: ${aerosolData.timestamp}`}
            {activeOverlay === 'satellite_omps' && aerosolMeta && `Daily Swath: ${aerosolMeta.dateString}`}
          </div>
        </div>

        {/* Clear source attribution, methodology and non-conflation disclaimer */}
        <p className="text-[11px] leading-relaxed text-[#5F6368] pt-1 border-t border-gray-100">
          {activeOverlay === 'dust_risk' && (
            <span className="text-amber-950 bg-amber-50/70 p-2 rounded border border-amber-200 block text-[11px] leading-relaxed">
              <strong>Continuous Atmospheric Dust-Risk Surface:</strong> Spatial visualization synthesized from DustWatch's multi-factor particulate and meteorological risk model across the 10 official UAE municipality coordinates. Continuous gradient surface is generated via Inverse Distance Weighting (IDW, power=2) spatial resampling without rectangular cell seams, employing yellow (low), orange (intermediate), and red (higher) color progression.
              <span className="block mt-1 font-medium text-amber-900">
                Spatial Resolution & Transparency: Station evaluations are derived from 10 distinct municipal monitoring coordinates. Spatial interpolation provides a regional synoptic overview across the UAE; it does not synthesize native micro-scale physical sensors between stations.
              </span>
            </span>
          )}
          {activeOverlay === 'none' && (
            <span>
              DustWatch monitors particulate and meteorological risk across 10 official UAE municipality coordinates. Select an overlay above to inspect continuous environmental heatmaps, rainfall, or aerosol detection.
            </span>
          )}
          {activeOverlay === 'temperature' && (
            <span>
              <strong>Attribution & Methodology:</strong> Data from Open-Meteo NWP Numerical Weather Prediction blend (ECMWF IFS / ICON). Native model resolution is ~0.4° (~40km); continuous IQAir-style visual surface is generated via Inverse Distance Weighting (IDW) spatial resampling. <em>Visual interpolation does not increase native physical sensor resolution.</em>
            </span>
          )}
          {activeOverlay === 'rainfall' && (
            <span className="text-sky-950 bg-sky-50/80 p-2 rounded border border-sky-200 block text-[11px] leading-relaxed">
              <strong>NWP Accumulated Precipitation Forecast:</strong> Gridded forecast derived from Open-Meteo Numerical Weather Prediction blend (ECMWF IFS / ICON, ~0.4° native resolution, ~40 km grid). Continuous surface is rendered via Inverse Distance Weighting (IDW) spatial resampling across UAE territory.
              <span className="block mt-1 font-medium text-sky-900">
                Scientific Semantics & Limitations: This layer measures accumulated liquid water precipitation equivalent in millimetres (mm) over the preceding model forecast interval (~15 minutes). It is strictly accumulated precipitation, NOT instantaneous precipitation rate (mm/h). Missing or null forecast values are handled explicitly as unavailable and are never converted into zero rainfall. Point-based city station readings do not constitute a continuous observed rainfall field.
              </span>
            </span>
          )}
          {activeOverlay === 'air_quality' && (
            <span>
              <strong>Attribution & Methodology:</strong> Atmospheric particulate dispersion model from Copernicus Atmosphere Monitoring Service (CAMS) via Open-Meteo. Native resolution is ~0.25°–0.4°; continuous gradient surface is rendered via IDW spatial resampling without rectangular cell seams. Distinguishes between US EPA AQI (0–500), European AQI (0–100), and PM mass concentrations. <em>Spatial resampling does not increase physical sensor resolution or replace micro-scale station observations.</em>
            </span>
          )}
          {activeOverlay === 'aerosol' && (
            <span className="text-amber-950 bg-amber-50/80 p-2 rounded border border-amber-200 block text-[11px] leading-relaxed">
              <strong>Atmospheric Aerosol Optical Depth (AOD @ 550nm):</strong> Derived from Copernicus Atmosphere Monitoring Service (CAMS) global aerosol models via Open-Meteo (~0.4° native resolution, ~40 km grid). Continuous surface is generated via Inverse Distance Weighting (IDW) spatial resampling across 36 UAE regional locations.
              <span className="block mt-1 font-medium text-amber-900">
                Scientific Limitations & Non-Conflation: Aerosol Optical Depth is a column-integrated, dimensionless optical measurement of light extinction by airborne aerosols (mineral dust, sea salt, sulfates) from surface to the top of the atmosphere. It is NOT a direct measurement of ground-level PM10 or PM2.5 concentrations, nor a micro-sensor reading. Spatial resampling illustrates regional gradients and does not increase native physical sensor resolution.
              </span>
            </span>
          )}
          {activeOverlay === 'satellite_omps' && (
            <span className="text-blue-950 bg-blue-50/80 p-2 rounded border border-blue-200 block text-[11px] leading-relaxed">
              <strong>Spaceborne Satellite Aerosol Index (NASA OMPS):</strong> Acquired daily by the Ozone Mapping and Profiler Suite (OMPS) aboard the Suomi-NPP satellite. Uses 340/378nm UV spectral contrast to observe absorbing aerosol plumes (mineral dust storms and elevated smoke).
              <span className="block mt-1 font-medium text-blue-900">
                Scientific Limitations & Non-Conflation: Aerosol Index is a qualitative spaceborne column indicator of UV-absorbing particles aloft. It does not identify chemical composition, nor does it quantify ground-level PM10 / PM2.5 concentrations or surface health hazard.
              </span>
            </span>
          )}
        </p>

        {/* Navigation & Resolution Transparency Note */}
        <div className="text-[10px] text-[#717680] pt-1 border-t border-gray-100 flex items-center justify-between">
          <span>
            <strong>Map Navigation & Boundaries:</strong> Map view is strictly focused on and bounded to the UAE territory and its 10 monitoring locations (zoom levels 6–16). Unconstrained panning into neighboring countries or distant waters is prevented. Zooming in does not synthesize additional atmospheric sensor resolution beyond the native NWP or satellite grid.
          </span>
        </div>
      </div>
    </div>
  );
};
