/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OverlayType = 'dust_risk' | 'none' | 'temperature' | 'air_quality' | 'aerosol' | 'rainfall' | 'satellite_omps';
export type AirQualityMetric = 'us_aqi' | 'pm10' | 'pm2_5' | 'european_aqi';
export type OverlayMetric = 'dust_risk' | 'temperature' | AirQualityMetric | 'aerosol' | 'aod' | 'rainfall' | 'precipitation';

export const DUST_RISK_LEVELS = [
  {
    range: '0–24',
    label: 'Low Risk',
    color: '#facc15',
    category: 'Low',
    description: 'Minimal suspended dust; good ambient visibility and normal air conditions',
  },
  {
    range: '25–49',
    label: 'Moderate Risk',
    color: '#f59e0b',
    category: 'Moderate',
    description: 'Elevated airborne particulates; light haze, sensitive individuals should monitor conditions',
  },
  {
    range: '50–74',
    label: 'High Risk',
    color: '#f97316',
    category: 'High',
    description: 'Substantial airborne dust, active blowing dust, and reduced visibility',
  },
  {
    range: '75–100',
    label: 'Very High Risk',
    color: '#ef4444',
    category: 'Very High',
    description: 'Severe dust storm or dense suspended dust plume; severe visibility impairment',
  },
];

export interface GridCell {
  id: string;
  lat: number;
  lon: number;
  bounds: [[number, number], [number, number]];
  regionLabel: string;
}

export interface RainfallCellData {
  cellId: string;
  lat: number;
  lon: number;
  precipitationMm: number | null; // Accumulated precipitation in mm
  time: string;
  intervalSeconds?: number;
  status: 'ok' | 'missing' | 'error';
  regionLabel?: string;
}

export interface TemperatureCellData {
  cellId: string;
  lat: number;
  lon: number;
  temperatureC: number | null;
  time: string;
  status: 'ok' | 'missing' | 'error';
}

export interface AirQualityCellData {
  cellId: string;
  lat: number;
  lon: number;
  usAqi: number | null;
  europeanAqi: number | null;
  pm10: number | null;
  pm2_5: number | null;
  time: string;
  status: 'ok' | 'missing' | 'error';
}

export interface AerosolCellData {
  cellId: string;
  lat: number;
  lon: number;
  aod: number | null; // Column-integrated Aerosol Optical Depth at 550nm
  time: string;
  status: 'ok' | 'missing' | 'error';
}

export interface OverlayDataResult<T> {
  type: OverlayType;
  cells: T[];
  timestamp: string;
  sourceAttribution: string;
  dataSourceNature: 'model_forecast' | 'satellite_observation';
  disclaimer: string;
  isCached: boolean;
  validCount?: number;
  missingCount?: number;
  invalidCount?: number;
}

// Bounding box for the continuous UAE environmental raster overlay
// Strictly encompassing UAE territory: 22.5°N - 26.3°N, 51.3°E - 56.6°E
export const UAE_RASTER_BOUNDS: [[number, number], [number, number]] = [
  [22.5, 51.3],
  [26.3, 56.6],
];

// Regular 36-point geographic grid covering the UAE landmass and territorial waters
export const UAE_GRID_CELLS: GridCell[] = (() => {
  const lats = [23.0, 23.6, 24.2, 24.8, 25.4, 25.9];
  const lons = [51.8, 52.7, 53.6, 54.5, 55.4, 56.2];
  const halfLat = 0.3;
  const halfLon = 0.45;

  const cells: GridCell[] = [];
  for (let r = 0; r < lats.length; r++) {
    for (let c = 0; c < lons.length; c++) {
      const lat = lats[r];
      const lon = lons[c];
      const id = `cell-${lat.toFixed(1)}-${lon.toFixed(1)}`;

      let regionLabel = 'UAE Desert / Inland';
      if (lat >= 25.0 && lon >= 54.8) regionLabel = 'Northern Emirates / Coast';
      else if (lat >= 24.0 && lon >= 54.0 && lon <= 55.0) regionLabel = 'Abu Dhabi Central & Capital';
      else if (lat <= 23.5) regionLabel = 'Liwa / Empty Quarter Border';
      else if (lon <= 52.5) regionLabel = 'Al Dhafra / Western Region';
      else if (lon >= 55.8) regionLabel = 'Eastern Region / Hajar Mountains';

      cells.push({
        id,
        lat,
        lon,
        bounds: [
          [lat - halfLat, lon - halfLon],
          [lat + halfLat, lon + halfLon],
        ],
        regionLabel,
      });
    }
  }
  return cells;
})();

// In-memory overlay cache with 10-minute TTL
let cachedTempData: OverlayDataResult<TemperatureCellData> | null = null;
let cachedTempTimestamp = 0;

let cachedAqData: OverlayDataResult<AirQualityCellData> | null = null;
let cachedAqTimestamp = 0;

let cachedAerosolData: OverlayDataResult<AerosolCellData> | null = null;
let cachedAerosolTimestamp = 0;

let cachedRainfallData: OverlayDataResult<RainfallCellData> | null = null;
let cachedRainfallTimestamp = 0;

// Separate in-memory demo overlay caches to strictly isolate simulated test data from live telemetry
let cachedDemoRainfallData: OverlayDataResult<RainfallCellData> | null = null;
let cachedDemoAqData: OverlayDataResult<AirQualityCellData> | null = null;
let cachedDemoAerosolData: OverlayDataResult<AerosolCellData> | null = null;

const CACHE_TTL_MS = 10 * 60 * 1000;

export function clearOverlayCache(): void {
  cachedTempData = null;
  cachedTempTimestamp = 0;
  cachedAqData = null;
  cachedAqTimestamp = 0;
  cachedAerosolData = null;
  cachedAerosolTimestamp = 0;
  cachedRainfallData = null;
  cachedRainfallTimestamp = 0;
  cachedDemoRainfallData = null;
  cachedDemoAqData = null;
  cachedDemoAerosolData = null;
}

/**
 * Single fetch helper with timeout and 1 retry
 */
async function fetchWithTimeout(url: string, timeoutMs = 9000): Promise<unknown> {
  const attempt = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } finally {
      clearTimeout(id);
    }
  };

  try {
    return await attempt();
  } catch {
    return await attempt();
  }
}

/**
 * Fetches genuine gridded temperature across the UAE using Open-Meteo Numerical Weather Prediction models.
 */
export async function fetchGridTemperature(): Promise<OverlayDataResult<TemperatureCellData>> {
  const now = Date.now();
  if (cachedTempData && now - cachedTempTimestamp < CACHE_TTL_MS) {
    return { ...cachedTempData, isCached: true };
  }

  const lats = UAE_GRID_CELLS.map((c) => c.lat).join(',');
  const lons = UAE_GRID_CELLS.map((c) => c.lon).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m&timezone=Asia%2FDubai`;

  try {
    const rawResponses = (await fetchWithTimeout(url)) as Array<{
      current?: { time?: string; temperature_2m?: number | null };
    }>;

    const list = Array.isArray(rawResponses) ? rawResponses : [rawResponses];
    const cells: TemperatureCellData[] = UAE_GRID_CELLS.map((cell, idx) => {
      const resp = list[idx];
      const val = resp?.current?.temperature_2m;
      const isValid = typeof val === 'number' && Number.isFinite(val);
      return {
        cellId: cell.id,
        lat: cell.lat,
        lon: cell.lon,
        temperatureC: isValid ? Math.round(val * 10) / 10 : null,
        time: resp?.current?.time || new Date().toISOString(),
        status: isValid ? 'ok' : 'missing',
      };
    });

    const result: OverlayDataResult<TemperatureCellData> = {
      type: 'temperature',
      cells,
      timestamp: cells[0]?.time || new Date().toISOString(),
      sourceAttribution: 'Open-Meteo NWP Numerical Weather Prediction Model (ECMWF IFS / ICON blend)',
      dataSourceNature: 'model_forecast',
      disclaimer: 'Gridded 2m ambient air temperature forecast (~0.4° native resolution). Rendered via continuous spatial resampling for display; not direct physical thermometer readings at every micro-location.',
      isCached: false,
    };

    cachedTempData = result;
    cachedTempTimestamp = now;
    return result;
  } catch (err) {
    throw new Error(`Failed to load gridded temperature overlay: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Deterministic simulated rainfall dataset for Demo Mode.
 * Accurately models a localized convective event over the eastern Hajar Mountains (up to 23.5 mm),
 * moderate rain in the northern emirates, trace in central Abu Dhabi, and completely dry conditions
 * in the western desert, with 1 explicit missing station.
 */
export function getDemoGridRainfall(): OverlayDataResult<RainfallCellData> {
  let validCount = 0;
  let missingCount = 0;

  const cells: RainfallCellData[] = UAE_GRID_CELLS.map((cell) => {
    const { lat, lon } = cell;

    // One explicit missing cell to verify transparent missing handling in demo mode
    if (lat === 23.0 && lon === 51.8) {
      missingCount++;
      return {
        cellId: cell.id,
        lat,
        lon,
        precipitationMm: null,
        time: new Date().toISOString(),
        intervalSeconds: 900,
        status: 'missing',
        regionLabel: cell.regionLabel,
      };
    }

    let val = 0.0;
    if (lon <= 52.7) {
      val = 0.0; // Dry western desert
    } else if (lon === 53.6) {
      val = lat <= 23.6 ? 0.0 : 0.4; // Dry Liwa, trace in north
    } else if (lon === 54.5) {
      val = lat <= 23.6 ? 0.3 : lat === 24.2 ? 1.2 : 1.8; // Trace to light rain
    } else if (lon === 55.4) {
      val = lat <= 23.6 ? 0.8 : lat === 24.2 ? 2.8 : lat === 24.8 ? 4.2 : 4.8; // Moderate rain
    } else if (lon === 56.2) {
      // Eastern mountains & Fujairah - convective core
      val = lat <= 23.6 ? 1.5 : lat === 24.2 ? 6.5 : lat === 24.8 ? 14.5 : lat === 25.4 ? 19.2 : 23.5;
    }

    validCount++;
    return {
      cellId: cell.id,
      lat,
      lon,
      precipitationMm: val,
      time: new Date().toISOString(),
      intervalSeconds: 900,
      status: 'ok',
      regionLabel: cell.regionLabel,
    };
  });

  return {
    type: 'rainfall',
    cells,
    timestamp: new Date().toISOString(),
    sourceAttribution: 'DEMO — SIMULATED RAINFALL (Deterministic Convective Storm Scenario)',
    dataSourceNature: 'model_forecast',
    disclaimer: 'DEMO — SIMULATED RAINFALL. Deterministic convective event modeling localized torrential rain over the Hajar Mountains and Eastern Region (up to 23.5 mm/interval), moderate rain in Northern Emirates, and dry conditions across the Western Desert. Never used for operational decisions.',
    isCached: false,
    validCount,
    missingCount,
    invalidCount: 0,
  };
}

/**
 * Deterministic simulated air quality dataset for Demo Mode.
 * Accurately models a western Shamal dust transport plume across Al Dhafra / Liwa tapering
 * east to clean air along the Gulf of Oman, with 1 explicit missing station.
 */
export function getDemoGridAirQuality(): OverlayDataResult<AirQualityCellData> {
  const cells: AirQualityCellData[] = UAE_GRID_CELLS.map((cell) => {
    const { lat, lon } = cell;

    if (lat === 23.0 && lon === 51.8) {
      return {
        cellId: cell.id,
        lat,
        lon,
        usAqi: null,
        europeanAqi: null,
        pm10: null,
        pm2_5: null,
        time: new Date().toISOString(),
        status: 'missing',
      };
    }

    let usAqi = 42;
    let eaAqi = 22;
    let pm10 = 38.0;
    let pm25 = 10.5;

    if (lon <= 52.7) {
      usAqi = lat <= 23.6 ? 210 : 185;
      eaAqi = 82;
      pm10 = lat <= 23.6 ? 340.0 : 275.0;
      pm25 = lat <= 23.6 ? 78.0 : 62.0;
    } else if (lon === 53.6) {
      usAqi = 165;
      eaAqi = 72;
      pm10 = 210.0;
      pm25 = 52.0;
    } else if (lon === 54.5) {
      usAqi = 115;
      eaAqi = 54;
      pm10 = 135.0;
      pm25 = 32.0;
    } else if (lon === 55.4) {
      usAqi = 68;
      eaAqi = 36;
      pm10 = 72.0;
      pm25 = 18.0;
    } else {
      usAqi = 38;
      eaAqi = 19;
      pm10 = 34.0;
      pm25 = 9.2;
    }

    return {
      cellId: cell.id,
      lat,
      lon,
      usAqi,
      europeanAqi: eaAqi,
      pm10,
      pm2_5: pm25,
      time: new Date().toISOString(),
      status: 'ok',
    };
  });

  return {
    type: 'air_quality',
    cells,
    timestamp: new Date().toISOString(),
    sourceAttribution: 'DEMO — SIMULATED AIR QUALITY (Shamal Dust Plume Scenario)',
    dataSourceNature: 'model_forecast',
    disclaimer: 'DEMO — SIMULATED AIR QUALITY. Deterministic test scenario illustrating spatial dispersion gradient between intense western Shamal dust loading and clean eastern coastal air. Not real-time CAMS observations.',
    isCached: false,
  };
}

/**
 * Deterministic simulated CAMS AOD dataset for Demo Mode.
 * Accurately models elevated column aerosol loading aloft over western desert tapering east,
 * with 1 explicit missing station.
 */
export function getDemoGridAerosol(): OverlayDataResult<AerosolCellData> {
  let validCount = 0;
  let missingCount = 0;

  const cells: AerosolCellData[] = UAE_GRID_CELLS.map((cell) => {
    const { lat, lon } = cell;

    if (lat === 23.0 && lon === 51.8) {
      missingCount++;
      return {
        cellId: cell.id,
        lat,
        lon,
        aod: null,
        time: new Date().toISOString(),
        status: 'missing',
      };
    }

    let aod = 0.18;
    if (lon <= 52.7) {
      aod = lat <= 23.6 ? 1.65 : 1.35;
    } else if (lon === 53.6) {
      aod = 1.10;
    } else if (lon === 54.5) {
      aod = 0.65;
    } else if (lon === 55.4) {
      aod = 0.35;
    } else {
      aod = 0.16;
    }

    validCount++;
    return {
      cellId: cell.id,
      lat,
      lon,
      aod,
      time: new Date().toISOString(),
      status: 'ok',
    };
  });

  return {
    type: 'aerosol',
    cells,
    timestamp: new Date().toISOString(),
    sourceAttribution: 'DEMO — SIMULATED CAMS AOD (Regional Dust Scenario)',
    dataSourceNature: 'model_forecast',
    disclaimer: 'DEMO — SIMULATED AOD. Synthetic atmospheric column optical depth at 550nm for layout testing. Not real Copernicus CAMS observations.',
    isCached: false,
    validCount,
    missingCount,
    invalidCount: 0,
  };
}

/**
 * Fetches gridded air quality (AQI, PM10, PM2.5) across the UAE using Copernicus CAMS / Open-Meteo,
 * or serves deterministic simulated scenario when in Demo Mode.
 */
export async function fetchGridAirQuality(forceRefresh = false, isDemo = false): Promise<OverlayDataResult<AirQualityCellData>> {
  if (isDemo) {
    if (!forceRefresh && cachedDemoAqData) {
      return { ...cachedDemoAqData, isCached: true };
    }
    const result = getDemoGridAirQuality();
    cachedDemoAqData = result;
    return result;
  }

  const now = Date.now();
  if (!forceRefresh && cachedAqData && now - cachedAqTimestamp < CACHE_TTL_MS) {
    return { ...cachedAqData, isCached: true };
  }

  const lats = UAE_GRID_CELLS.map((c) => c.lat).join(',');
  const lons = UAE_GRID_CELLS.map((c) => c.lon).join(',');
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm10,pm2_5,us_aqi,european_aqi&timezone=Asia%2FDubai`;

  try {
    const rawResponses = (await fetchWithTimeout(url)) as Array<{
      current?: {
        time?: string;
        us_aqi?: number | null;
        european_aqi?: number | null;
        pm10?: number | null;
        pm2_5?: number | null;
      };
    }>;

    const list = Array.isArray(rawResponses) ? rawResponses : [rawResponses];
    const cells: AirQualityCellData[] = UAE_GRID_CELLS.map((cell, idx) => {
      const resp = list[idx]?.current;
      const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
      const hasAnyData = isNum(resp?.pm10) || isNum(resp?.pm2_5) || isNum(resp?.us_aqi);

      return {
        cellId: cell.id,
        lat: cell.lat,
        lon: cell.lon,
        usAqi: isNum(resp?.us_aqi) ? Math.round(resp.us_aqi) : null,
        europeanAqi: isNum(resp?.european_aqi) ? Math.round(resp.european_aqi) : null,
        pm10: isNum(resp?.pm10) ? Math.round(resp.pm10 * 10) / 10 : null,
        pm2_5: isNum(resp?.pm2_5) ? Math.round(resp.pm2_5 * 10) / 10 : null,
        time: resp?.time || new Date().toISOString(),
        status: hasAnyData ? 'ok' : 'missing',
      };
    });

    const result: OverlayDataResult<AirQualityCellData> = {
      type: 'air_quality',
      cells,
      timestamp: cells[0]?.time || new Date().toISOString(),
      sourceAttribution: 'Copernicus Atmosphere Monitoring Service (CAMS) Global & Regional Models via Open-Meteo',
      dataSourceNature: 'model_forecast',
      disclaimer: 'Atmospheric particulate and air quality index dispersion model estimates (~0.25°–0.4° native resolution). Continuous IQAir-style surface is rendered via smooth spatial resampling; this visual smoothing does not increase physical sensor resolution.',
      isCached: false,
    };

    cachedAqData = result;
    cachedAqTimestamp = now;
    return result;
  } catch (err) {
    throw new Error(`Failed to load gridded air quality overlay: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Fetches gridded Aerosol Optical Depth (AOD @ 550nm) across the UAE using Copernicus CAMS via Open-Meteo,
 * or serves deterministic simulated scenario when in Demo Mode.
 * Does not invent observations or fill missing cells with fabricated values.
 */
export async function fetchGridAerosol(forceRefresh = false, isDemo = false): Promise<OverlayDataResult<AerosolCellData>> {
  if (isDemo) {
    if (!forceRefresh && cachedDemoAerosolData) {
      return { ...cachedDemoAerosolData, isCached: true };
    }
    const result = getDemoGridAerosol();
    cachedDemoAerosolData = result;
    return result;
  }

  const now = Date.now();
  if (!forceRefresh && cachedAerosolData && now - cachedAerosolTimestamp < CACHE_TTL_MS) {
    return { ...cachedAerosolData, isCached: true };
  }

  const lats = UAE_GRID_CELLS.map((c) => c.lat).join(',');
  const lons = UAE_GRID_CELLS.map((c) => c.lon).join(',');
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=aerosol_optical_depth&timezone=Asia%2FDubai`;

  try {
    const rawResponses = (await fetchWithTimeout(url)) as Array<{
      current?: { time?: string; aerosol_optical_depth?: number | null };
    }>;

    const list = Array.isArray(rawResponses) ? rawResponses : [rawResponses];
    let validCount = 0;
    let missingCount = 0;
    let invalidCount = 0;

    const cells: AerosolCellData[] = UAE_GRID_CELLS.map((cell, idx) => {
      const resp = list[idx];
      const val = resp?.current?.aerosol_optical_depth;

      if (val === null || val === undefined) {
        missingCount++;
        return {
          cellId: cell.id,
          lat: cell.lat,
          lon: cell.lon,
          aod: null,
          time: resp?.current?.time || new Date().toISOString(),
          status: 'missing',
        };
      }

      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
        invalidCount++;
        return {
          cellId: cell.id,
          lat: cell.lat,
          lon: cell.lon,
          aod: null,
          time: resp?.current?.time || new Date().toISOString(),
          status: 'error',
        };
      }

      validCount++;
      return {
        cellId: cell.id,
        lat: cell.lat,
        lon: cell.lon,
        aod: Math.round(val * 100) / 100,
        time: resp?.current?.time || new Date().toISOString(),
        status: 'ok',
      };
    });

    const result: OverlayDataResult<AerosolCellData> = {
      type: 'aerosol',
      cells,
      timestamp: cells[0]?.time || new Date().toISOString(),
      sourceAttribution: 'Copernicus Atmosphere Monitoring Service (CAMS) Global Atmospheric Model via Open-Meteo',
      dataSourceNature: 'model_forecast',
      disclaimer: 'Gridded column-integrated Aerosol Optical Depth (AOD at 550nm, ~0.4° native resolution). AOD measures total optical extinction throughout the atmospheric column by airborne particles (mineral dust, marine aerosol, and combustion aerosols). Rendered via continuous IDW spatial resampling for regional visualization without increasing native sensor resolution. AOD is NOT a direct measurement of ground-level PM10 or surface dust concentration.',
      isCached: false,
      validCount,
      missingCount,
      invalidCount,
    };

    cachedAerosolData = result;
    cachedAerosolTimestamp = now;
    return result;
  } catch (err) {
    throw new Error(`Failed to load gridded aerosol overlay: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const fetchGridAod = fetchGridAerosol;

/**
 * Fetches genuine gridded accumulated precipitation across the UAE using Open-Meteo Numerical Weather Prediction models,
 * or serves deterministic simulated scenario when in Demo Mode.
 * Never converts missing/null readings to zero rainfall.
 * Accurately models accumulated precipitation in mm over the preceding model forecast interval, NOT precipitation rate.
 */
export async function fetchGridRainfall(forceRefresh = false, isDemo = false): Promise<OverlayDataResult<RainfallCellData>> {
  if (isDemo) {
    if (!forceRefresh && cachedDemoRainfallData) {
      return { ...cachedDemoRainfallData, isCached: true };
    }
    const result = getDemoGridRainfall();
    cachedDemoRainfallData = result;
    return result;
  }

  const now = Date.now();
  if (!forceRefresh && cachedRainfallData && now - cachedRainfallTimestamp < CACHE_TTL_MS) {
    return { ...cachedRainfallData, isCached: true };
  }

  const lats = UAE_GRID_CELLS.map((c) => c.lat).join(',');
  const lons = UAE_GRID_CELLS.map((c) => c.lon).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=precipitation&timezone=Asia%2FDubai`;

  try {
    interface OpenMeteoRainResponse {
      current?: { time?: string; interval?: number; precipitation?: number | null };
      current_units?: { precipitation?: string };
      error?: boolean;
      reason?: string;
    }

    const rawResponses = (await fetchWithTimeout(url)) as OpenMeteoRainResponse[] | OpenMeteoRainResponse;

    if (rawResponses && typeof rawResponses === 'object' && !Array.isArray(rawResponses) && rawResponses.error) {
      throw new Error(`Open-Meteo precipitation API error: ${rawResponses.reason || 'Failed to fetch data'}`);
    }

    const list: OpenMeteoRainResponse[] = Array.isArray(rawResponses) ? rawResponses : [rawResponses];
    let validCount = 0;
    let missingCount = 0;
    let invalidCount = 0;

    const cells: RainfallCellData[] = UAE_GRID_CELLS.map((cell, idx) => {
      const resp = list[idx];
      const val = resp?.current?.precipitation;

      // Handle unavailable/null data explicitly. NEVER convert missing to 0.0 mm.
      if (val === null || val === undefined) {
        missingCount++;
        return {
          cellId: cell.id,
          lat: cell.lat,
          lon: cell.lon,
          precipitationMm: null,
          time: resp?.current?.time || new Date().toISOString(),
          intervalSeconds: resp?.current?.interval,
          status: 'missing',
          regionLabel: cell.regionLabel,
        };
      }

      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
        invalidCount++;
        return {
          cellId: cell.id,
          lat: cell.lat,
          lon: cell.lon,
          precipitationMm: null,
          time: resp?.current?.time || new Date().toISOString(),
          intervalSeconds: resp?.current?.interval,
          status: 'error',
          regionLabel: cell.regionLabel,
        };
      }

      validCount++;
      return {
        cellId: cell.id,
        lat: cell.lat,
        lon: cell.lon,
        precipitationMm: Math.round(val * 100) / 100,
        time: resp?.current?.time || new Date().toISOString(),
        intervalSeconds: resp?.current?.interval,
        status: 'ok',
        regionLabel: cell.regionLabel,
      };
    });

    const result: OverlayDataResult<RainfallCellData> = {
      type: 'rainfall',
      cells,
      timestamp: cells[0]?.time || new Date().toISOString(),
      sourceAttribution: 'Open-Meteo NWP Numerical Weather Prediction Model (ECMWF IFS / ICON blend)',
      dataSourceNature: 'model_forecast',
      disclaimer: 'Gridded accumulated precipitation forecast (~0.4° native resolution). Represents accumulated liquid precipitation in millimetres (mm) over the preceding model forecast interval, NOT instantaneous precipitation rate (mm/h). Rendered via continuous IDW spatial resampling across UAE territory; discrete city station points do not constitute a continuous observed rainfall field.',
      isCached: false,
      validCount,
      missingCount,
      invalidCount,
    };

    cachedRainfallData = result;
    cachedRainfallTimestamp = now;
    return result;
  } catch (err) {
    throw new Error(`Failed to load gridded rainfall overlay: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface AerosolDetectionConfig {
  tileUrl: string;
  attribution: string;
  dateString: string;
  productName: string;
  instrument: string;
  platform: string;
  layerIdentifier: string;
  disclaimer: string;
  dataSourceNature: 'satellite_observation';
}

export interface AerosolIndexLevel {
  range: string;
  label: string;
  color: string;
  description: string;
}

export const AEROSOL_INDEX_LEVELS: AerosolIndexLevel[] = [
  {
    range: '≤ 0.5',
    label: 'Low / Near-Zero Signal',
    color: '#e0e0e0',
    description: 'Clean atmosphere, non-absorbing particles (clouds, marine aerosol), or background',
  },
  {
    range: '0.5–1.5',
    label: 'Positive Aerosol Signal',
    color: '#facc15',
    description: 'Detectable UV-absorbing aerosols (e.g. elevated dust, haze, or smoke aloft)',
  },
  {
    range: '1.5–3.0',
    label: 'Moderate Aerosol Signal',
    color: '#f97316',
    description: 'Elevated column absorbing aerosols from dust plumes or regional smoke transport',
  },
  {
    range: '> 3.0',
    label: 'Stronger Aerosol Signal',
    color: '#881337',
    description: 'Strong column absorption from dense absorbing plumes or high-altitude transport',
  },
];

export interface AodLevel {
  range: string;
  label: string;
  color: string;
  min: number;
  max: number;
  description: string;
}

export const AOD_LEVELS: AodLevel[] = [
  {
    range: '≤ 0.20',
    label: 'Clean / Low',
    color: '#10b981',
    min: 0,
    max: 0.2,
    description: 'Clean background atmospheric column with low particulate extinction',
  },
  {
    range: '0.21–0.50',
    label: 'Moderate / Light Haze',
    color: '#facc15',
    min: 0.2,
    max: 0.5,
    description: 'Typical regional arid background with light ambient dust haze',
  },
  {
    range: '0.51–1.00',
    label: 'Elevated Aerosol',
    color: '#f97316',
    min: 0.5,
    max: 1.0,
    description: 'Elevated column aerosol loading from dust transport or haze',
  },
  {
    range: '1.01–1.80',
    label: 'High / Heavy Dust',
    color: '#ef4444',
    min: 1.0,
    max: 1.8,
    description: 'High extinction from dense mineral dust plumes aloft',
  },
  {
    range: '> 1.80',
    label: 'Very High / Extreme Plume',
    color: '#881337',
    min: 1.8,
    max: Infinity,
    description: 'Severe aerosol column loading and heavy solar attenuation',
  },
];

/**
 * Discrete color mapping for Aerosol Optical Depth (AOD @ 550nm)
 */
export function getAodColor(val: number | null): { bg: string; text: string; label: string } {
  if (val === null || !Number.isFinite(val) || Number.isNaN(val)) {
    return { bg: '#9ca3af', text: '#ffffff', label: 'Unavailable' };
  }
  if (val <= 0.2) return { bg: '#10b981', text: '#ffffff', label: 'Clean / Low (≤ 0.20)' };
  if (val <= 0.5) return { bg: '#facc15', text: '#111827', label: 'Moderate (0.21–0.50)' };
  if (val <= 1.0) return { bg: '#f97316', text: '#ffffff', label: 'Elevated (0.51–1.00)' };
  if (val <= 1.8) return { bg: '#ef4444', text: '#ffffff', label: 'High (1.01–1.80)' };
  return { bg: '#881337', text: '#ffffff', label: 'Very High (> 1.80)' };
}

export interface RainfallLevel {
  range: string;
  label: string;
  color: string;
  min: number;
  max: number;
  description: string;
}

export const RAINFALL_LEVELS: RainfallLevel[] = [
  {
    range: '0.0 mm',
    label: 'No Rain / Dry',
    color: '#cbd5e1',
    min: 0,
    max: 0.1,
    description: 'No accumulated precipitation forecast during interval',
  },
  {
    range: '0.1–0.5 mm',
    label: 'Very Light / Trace',
    color: '#38bdf8',
    min: 0.1,
    max: 0.5,
    description: 'Trace drizzle or isolated brief sprinkles dampening surfaces without substantial puddling',
  },
  {
    range: '0.5–2.0 mm',
    label: 'Light Rain',
    color: '#0284c7',
    min: 0.5,
    max: 2.0,
    description: 'Light steady rain or passing showers with light ground wetting',
  },
  {
    range: '2.0–5.0 mm',
    label: 'Moderate Rain',
    color: '#16a34a',
    min: 2.0,
    max: 5.0,
    description: 'Moderate steady rain; light street runoff, road spray and reduced traction',
  },
  {
    range: '5.0–15.0 mm',
    label: 'Heavy Rain',
    color: '#eab308',
    min: 5.0,
    max: 15.0,
    description: 'Heavy rain downpours; localized ponding on urban roads, reduced visibility',
  },
  {
    range: '15.0–30.0 mm',
    label: 'Very Heavy Rain',
    color: '#ea580c',
    min: 15.0,
    max: 30.0,
    description: 'Very heavy torrential rain; significant road waterlogging and desert wadi flow risk',
  },
  {
    range: '> 30.0 mm',
    label: 'Extreme / Torrential',
    color: '#dc2626',
    min: 30.0,
    max: Infinity,
    description: 'Severe cloudburst deluge; acute flash flood risk in low-lying depressions and wadi beds',
  },
];

/**
 * Discrete color mapping for accumulated precipitation (mm)
 * Never converts missing or null readings into 0.0 mm.
 */
export function getRainfallColor(val: number | null): { bg: string; text: string; label: string; intensity: string } {
  if (val === null || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
    return { bg: '#9ca3af', text: '#ffffff', label: 'Unavailable', intensity: 'Unavailable' };
  }
  if (val < 0.1) return { bg: '#cbd5e1', text: '#334155', label: '0.0 mm (No Rain / Dry)', intensity: 'Dry' };
  if (val < 0.5) return { bg: '#38bdf8', text: '#082f49', label: '< 0.5 mm (Very Light / Trace)', intensity: 'Trace' };
  if (val < 2.0) return { bg: '#0284c7', text: '#ffffff', label: '0.5–2.0 mm (Light Rain)', intensity: 'Light' };
  if (val < 5.0) return { bg: '#16a34a', text: '#ffffff', label: '2.0–5.0 mm (Moderate Rain)', intensity: 'Moderate' };
  if (val < 15.0) return { bg: '#eab308', text: '#111827', label: '5.0–15.0 mm (Heavy Rain)', intensity: 'Heavy' };
  if (val < 30.0) return { bg: '#ea580c', text: '#ffffff', label: '15.0–30.0 mm (Very Heavy)', intensity: 'Very Heavy' };
  return { bg: '#dc2626', text: '#ffffff', label: '≥ 30.0 mm (Extreme / Torrential)', intensity: 'Extreme' };
}

/**
 * Returns NASA GIBS satellite configuration for UV Aerosol Index detection (OMPS Nadir Mapper).
 * Transparent PNG tile layer in Web Mercator (EPSG:3857) allows underlying map and city markers to remain visible.
 */
export function getAerosolDetectionConfig(dateOverride?: string, isDemo = false): AerosolDetectionConfig {
  if (isDemo) {
    const demoDate = dateOverride || '2024-04-16';
    const layerIdentifier = 'OMPS_Aerosol_Index';
    const tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerIdentifier}/default/${demoDate}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
    return {
      tileUrl,
      attribution: 'DEMO ARCHIVE — Imagery © NASA ESDIS / GIBS / Suomi-NPP OMPS (Historic Validation Case: 2024-04-16)',
      dateString: demoDate,
      productName: 'DEMO — Suomi-NPP / OMPS UV Aerosol Index (Archived Historic Event: 2024-04-16)',
      instrument: 'Ozone Mapping and Profiler Suite (OMPS) Nadir Mapper',
      platform: 'Suomi-NPP Polar Orbiting Satellite',
      layerIdentifier,
      disclaimer: 'DEMO — HISTORIC SATELLITE RETRIEVAL. Visualizing archived NASA OMPS swath from 16 April 2024 for layout testing. Not real-time satellite telemetry.',
      dataSourceNature: 'satellite_observation',
    };
  }

  const now = new Date();
  const yr = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const da = String(now.getUTCDate()).padStart(2, '0');
  const dateString = dateOverride || `${yr}-${mo}-${da}`;

  const layerIdentifier = 'OMPS_Aerosol_Index';
  // NASA GIBS WMTS EPSG:3857 Level 6 tile template (transparent PNG)
  const tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerIdentifier}/default/${dateString}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;

  return {
    tileUrl,
    attribution: 'Imagery &copy; NASA Earth Science Data and Information System (ESDIS) / GIBS / Suomi-NPP OMPS',
    dateString,
    productName: 'Suomi-NPP / OMPS UV Aerosol Index (Level 3 Daily)',
    instrument: 'Ozone Mapping and Profiler Suite (OMPS) Nadir Mapper',
    platform: 'Suomi-NPP Polar Orbiting Satellite',
    layerIdentifier,
    disclaimer: 'Spaceborne satellite UV Aerosol Index indicates the presence of UV-absorbing aerosols (such as mineral dust, smoke, and volcanic ash) in the atmospheric column. It cannot independently identify the aerosol source or directly quantify ground-level particulate matter concentrations (PM10/PM2.5) or ground-level air quality.',
    dataSourceNature: 'satellite_observation',
  };
}

/**
 * Interpolates value at point (lat, lon) using Inverse Distance Weighting (IDW).
 * Does NOT invent values: if all nearby points are missing or distance exceeds maxDistanceDeg, returns null.
 */
export function interpolateValueAtPoint(
  lat: number,
  lon: number,
  points: Array<{ lat: number; lon: number; value: number | null }>,
  maxDistanceDeg = 1.35,
  power = 2
): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  let minDistance = Infinity;
  let exactValue: number | null = null;

  for (const p of points) {
    if (p.value === null || !Number.isFinite(p.value)) continue;

    const dLat = lat - p.lat;
    const dLon = lon - p.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

    if (dist < minDistance) {
      minDistance = dist;
    }

    // Exact or near-exact match
    if (dist < 0.01) {
      exactValue = p.value;
      break;
    }

    if (dist <= maxDistanceDeg) {
      const w = 1 / Math.pow(dist, power);
      weightedSum += p.value * w;
      weightTotal += w;
    }
  }

  if (exactValue !== null) return exactValue;
  if (weightTotal === 0 || minDistance > maxDistanceDeg) return null;

  return weightedSum / weightTotal;
}

interface ColorStop {
  val: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Continuous smooth RGB color ramp interpolation.
 */
export function getContinuousColorRgba(
  metric: OverlayMetric,
  value: number | null
): [number, number, number, number] {
  if (value === null || !Number.isFinite(value) || ((metric === 'rainfall' || metric === 'precipitation') && value < 0)) {
    return [0, 0, 0, 0]; // Transparent for missing or invalid data
  }

  let stops: ColorStop[];

  if (metric === 'dust_risk') {
    // Continuous atmospheric dust-risk score (0 to 100)
    // Low values (0-24): Clear, vibrant sunny yellow (#fde047 / #facc15)
    // Intermediate values (25-49): Warm amber to orange (#f59e0b / #f97316)
    // High values (50-74): Vivid deep orange to red-orange (#ea580c / #ef4444)
    // Very High values (75-100): Strong red to deep crimson (#dc2626 / #b91c1c / #991b1b)
    // Robust alpha (165-230) ensures continuous surface is clearly visible over satellite and OSM baselayers
    stops = [
      { val: 0, r: 253, g: 224, b: 71, a: 165 },    // Vibrant sunny yellow (Yellow 300)
      { val: 15, r: 250, g: 204, b: 21, a: 175 },   // Golden yellow (Yellow 400 / #facc15)
      { val: 25, r: 245, g: 158, b: 11, a: 185 },   // Amber (Amber 500 / #f59e0b / Low->Moderate cutoff)
      { val: 40, r: 249, g: 135, b: 22, a: 195 },   // Warm amber-orange (Amber 600 / Orange 500)
      { val: 50, r: 245, g: 115, b: 20, a: 195 },   // Vivid orange (Orange 500 / Moderate->High cutoff)
      { val: 65, r: 239, g: 80, b: 25, a: 210 },    // Red-orange (Orange 600)
      { val: 75, r: 239, g: 68, b: 68, a: 220 },    // Red (Red 500 / #ef4444 / High->Very High cutoff)
      { val: 90, r: 220, g: 38, b: 38, a: 225 },    // Strong red (Red 600 / #dc2626)
      { val: 100, r: 153, g: 27, b: 27, a: 230 },   // Crimson (Red 800 / #991b1b)
    ];
  } else if (metric === 'temperature') {
    stops = [
      { val: 14, r: 59, g: 130, b: 246, a: 160 },   // Deep blue
      { val: 20, r: 6, g: 182, b: 212, a: 168 },    // Cyan
      { val: 26, r: 16, g: 185, b: 129, a: 175 },   // Emerald
      { val: 32, r: 234, g: 179, b: 8, a: 182 },    // Yellow/Amber
      { val: 38, r: 249, g: 115, b: 22, a: 190 },   // Orange
      { val: 44, r: 239, g: 68, b: 68, a: 200 },    // Red
      { val: 50, r: 153, g: 27, b: 27, a: 215 },    // Crimson/Dark Red
    ];
  } else if (metric === 'us_aqi') {
    // Continuous EPA AQI color ramp
    stops = [
      { val: 0, r: 16, g: 185, b: 129, a: 165 },    // Good (Green)
      { val: 50, r: 74, g: 222, b: 128, a: 172 },   // Light Green
      { val: 100, r: 250, g: 204, b: 21, a: 180 },  // Moderate (Yellow)
      { val: 150, r: 249, g: 115, b: 22, a: 190 },  // Sensitive (Orange)
      { val: 200, r: 239, g: 68, b: 68, a: 200 },   // Unhealthy (Red)
      { val: 300, r: 139, g: 92, b: 246, a: 215 },  // Very Unhealthy (Purple)
      { val: 500, r: 136, g: 19, b: 55, a: 230 },   // Hazardous (Maroon)
    ];
  } else if (metric === 'pm10') {
    stops = [
      { val: 0, r: 16, g: 185, b: 129, a: 165 },
      { val: 50, r: 132, g: 204, b: 22, a: 172 },
      { val: 100, r: 250, g: 204, b: 21, a: 180 },
      { val: 250, r: 249, g: 115, b: 22, a: 195 },
      { val: 400, r: 239, g: 68, b: 68, a: 205 },
      { val: 600, r: 136, g: 19, b: 55, a: 225 },
    ];
  } else if (metric === 'pm2_5') {
    stops = [
      { val: 0, r: 16, g: 185, b: 129, a: 165 },
      { val: 12, r: 132, g: 204, b: 22, a: 172 },
      { val: 35.4, r: 250, g: 204, b: 21, a: 180 },
      { val: 55.4, r: 249, g: 115, b: 22, a: 195 },
      { val: 150, r: 239, g: 68, b: 68, a: 205 },
      { val: 250, r: 136, g: 19, b: 55, a: 225 },
    ];
  } else if (metric === 'aerosol' || metric === 'aod') {
    // Aerosol Optical Depth (AOD @ 550nm): 0.0 (clean) -> 0.2 -> 0.5 -> 1.0 -> 1.8 -> 3.0 (extreme)
    stops = [
      { val: 0.0, r: 16, g: 185, b: 129, a: 165 },   // Clean background (Emerald #10b981)
      { val: 0.2, r: 132, g: 204, b: 22, a: 172 },  // Low / Mild (Lime #84cc16)
      { val: 0.5, r: 250, g: 204, b: 21, a: 185 },  // Moderate haze (Yellow #facc15)
      { val: 1.0, r: 249, g: 115, b: 22, a: 198 },  // Elevated / Noticeable (Orange #f97316)
      { val: 1.8, r: 239, g: 68, b: 68, a: 215 },   // High / Heavy dust (Red #ef4444)
      { val: 3.0, r: 136, g: 19, b: 55, a: 230 },   // Extreme / Severe plume (Maroon #881337)
    ];
  } else if (metric === 'rainfall' || metric === 'precipitation') {
    // Accumulated liquid precipitation (mm over model forecast interval)
    // 0.0 mm -> clearly visible soft sky-tint radar wash [186, 230, 253, 55] indicating dry NWP coverage
    // 0.1 mm -> Very Light / Trace (Sky 400)
    // 0.5 mm -> Light Rain (Sky 500)
    // 2.0 mm -> Light-Moderate Rain (Sky 600)
    // 5.0 mm -> Moderate Rain (Green 600)
    // 15.0 mm -> Heavy Rain (Amber 500)
    // 30.0 mm -> Very Heavy Rain (Orange 600)
    // 50.0 mm -> Torrential / Extreme Deluge (Red 600)
    stops = [
      { val: 0.0, r: 186, g: 230, b: 253, a: 55 },
      { val: 0.1, r: 56, g: 189, b: 248, a: 150 },
      { val: 0.5, r: 14, g: 165, b: 233, a: 170 },
      { val: 2.0, r: 2, g: 132, b: 199, a: 185 },
      { val: 5.0, r: 22, g: 163, b: 74, a: 195 },
      { val: 15.0, r: 234, g: 179, b: 8, a: 210 },
      { val: 30.0, r: 234, g: 88, b: 12, a: 225 },
      { val: 50.0, r: 220, g: 38, b: 38, a: 240 },
    ];
  } else {
    // european_aqi
    stops = [
      { val: 0, r: 16, g: 185, b: 129, a: 165 },
      { val: 20, r: 132, g: 204, b: 22, a: 172 },
      { val: 40, r: 250, g: 204, b: 21, a: 180 },
      { val: 60, r: 249, g: 115, b: 22, a: 195 },
      { val: 80, r: 239, g: 68, b: 68, a: 205 },
      { val: 100, r: 153, g: 27, b: 27, a: 220 },
    ];
  }

  // Value below lowest stop
  if (value <= stops[0].val) {
    const s = stops[0];
    return [s.r, s.g, s.b, s.a];
  }

  // Value above highest stop
  const last = stops[stops.length - 1];
  if (value >= last.val) {
    return [last.r, last.g, last.b, last.a];
  }

  // Linear interpolation between surrounding stops
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (value >= s1.val && value <= s2.val) {
      const span = s2.val - s1.val;
      const t = span > 0 ? (value - s1.val) / span : 0;
      return [
        Math.round(s1.r + t * (s2.r - s1.r)),
        Math.round(s1.g + t * (s2.g - s1.g)),
        Math.round(s1.b + t * (s2.b - s1.b)),
        Math.round(s1.a + t * (s2.a - s1.a)),
      ];
    }
  }

  return [last.r, last.g, last.b, last.a];
}

/**
 * Builds continuous raster RGBA pixel buffer across UAE bounding box using IDW spatial interpolation.
 */
export function buildRasterImageData(
  width: number,
  height: number,
  bounds: [[number, number], [number, number]],
  points: Array<{ lat: number; lon: number; value: number | null }>,
  metric: OverlayMetric,
  maxDistanceDeg?: number
): Uint8ClampedArray {
  const [[south, west], [north, east]] = bounds;
  const buffer = new Uint8ClampedArray(width * height * 4);

  const latSpan = north - south;
  const lonSpan = east - west;
  const maxDist = maxDistanceDeg !== undefined ? maxDistanceDeg : (metric === 'dust_risk' ? 2.5 : 1.45);

  for (let y = 0; y < height; y++) {
    const lat = north - (y / (height - 1)) * latSpan;
    const rowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const lon = west + (x / (width - 1)) * lonSpan;
      const val = interpolateValueAtPoint(lat, lon, points, maxDist, 2);
      const [r, g, b, a] = getContinuousColorRgba(metric, val);

      const idx = rowOffset + x * 4;
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  return buffer;
}

/**
 * Generates continuous raster Data URL for Leaflet L.imageOverlay.
 * Validates that there are valid data points and verifies that the generated buffer contains visible non-zero pixels.
 * Returns null if all points are missing/invalid or if no visible pixels are produced.
 */
export function generateRasterDataUrl(
  points: Array<{ lat: number; lon: number; value: number | null }>,
  metric: OverlayMetric,
  width = 240,
  height = 180,
  bounds = UAE_RASTER_BOUNDS,
  maxDistanceDeg?: number
): string | null {
  if (typeof document === 'undefined') return null;

  try {
    const validPoints = points.filter((p) => p.value !== null && Number.isFinite(p.value));
    if (validPoints.length === 0) {
      return null;
    }

    const rawBytes = buildRasterImageData(width, height, bounds, points, metric, maxDistanceDeg);

    // Verify raster contains visible pixels (non-zero alpha)
    let hasVisiblePixels = false;
    for (let i = 3; i < rawBytes.length; i += 4) {
      if (rawBytes[i] > 0) {
        hasVisiblePixels = true;
        break;
      }
    }
    if (!hasVisiblePixels) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(width, height);
    imgData.data.set(rawBytes);
    ctx.putImageData(imgData, 0, 0);

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Failed to generate continuous raster canvas:', err);
    return null;
  }
}

/**
 * Discrete color mapping for temperature in °C (retained for legend breakpoints & tooltips)
 */
export function getTemperatureColor(tempC: number | null): { bg: string; text: string; label: string } {
  if (tempC === null || Number.isNaN(tempC)) {
    return { bg: '#9ca3af', text: '#ffffff', label: 'Unavailable' };
  }
  if (tempC < 20) return { bg: '#3b82f6', text: '#ffffff', label: '< 20°C (Mild)' };
  if (tempC < 26) return { bg: '#06b6d4', text: '#ffffff', label: '20–25°C (Pleasant)' };
  if (tempC < 32) return { bg: '#10b981', text: '#ffffff', label: '26–31°C (Warm)' };
  if (tempC < 38) return { bg: '#f59e0b', text: '#111827', label: '32–37°C (Hot)' };
  if (tempC < 44) return { bg: '#ea580c', text: '#ffffff', label: '38–43°C (Very Hot)' };
  return { bg: '#b91c1c', text: '#ffffff', label: '≥ 44°C (Extreme Heat)' };
}

/**
 * Discrete color mapping for Air Quality metrics (retained for legend breakpoints & tooltips)
 */
export function getAirQualityColor(
  metric: AirQualityMetric,
  value: number | null
): { bg: string; text: string; category: string } {
  if (value === null || Number.isNaN(value)) {
    return { bg: '#9ca3af', text: '#ffffff', category: 'Data Missing' };
  }

  if (metric === 'us_aqi') {
    if (value <= 50) return { bg: '#10b981', text: '#ffffff', category: 'Good (0–50)' };
    if (value <= 100) return { bg: '#facc15', text: '#111827', category: 'Moderate (51–100)' };
    if (value <= 150) return { bg: '#f97316', text: '#ffffff', category: 'Unhealthy for Sensitive (101–150)' };
    if (value <= 200) return { bg: '#ef4444', text: '#ffffff', category: 'Unhealthy (151–200)' };
    if (value <= 300) return { bg: '#8b5cf6', text: '#ffffff', category: 'Very Unhealthy (201–300)' };
    return { bg: '#881337', text: '#ffffff', category: 'Hazardous (301–500)' };
  }

  if (metric === 'european_aqi') {
    if (value <= 20) return { bg: '#10b981', text: '#ffffff', category: 'Good (0–20)' };
    if (value <= 40) return { bg: '#84cc16', text: '#111827', category: 'Fair (21–40)' };
    if (value <= 60) return { bg: '#facc15', text: '#111827', category: 'Moderate (41–60)' };
    if (value <= 80) return { bg: '#f97316', text: '#ffffff', category: 'Poor (61–80)' };
    return { bg: '#ef4444', text: '#ffffff', category: 'Very Poor (81–100)' };
  }

  if (metric === 'pm10') {
    if (value <= 50) return { bg: '#10b981', text: '#ffffff', category: 'Low (0–50 µg/m³)' };
    if (value <= 100) return { bg: '#facc15', text: '#111827', category: 'Moderate (51–100 µg/m³)' };
    if (value <= 250) return { bg: '#f97316', text: '#ffffff', category: 'Elevated (101–250 µg/m³)' };
    if (value <= 400) return { bg: '#ef4444', text: '#ffffff', category: 'High (251–400 µg/m³)' };
    return { bg: '#881337', text: '#ffffff', category: 'Hazardous (> 400 µg/m³)' };
  }

  // pm2_5
  if (value <= 12) return { bg: '#10b981', text: '#ffffff', category: 'Good (0–12 µg/m³)' };
  if (value <= 35.4) return { bg: '#facc15', text: '#111827', category: 'Moderate (12.1–35.4 µg/m³)' };
  if (value <= 55.4) return { bg: '#f97316', text: '#ffffff', category: 'Unhealthy for Sensitive (35.5–55.4 µg/m³)' };
  if (value <= 150.4) return { bg: '#ef4444', text: '#ffffff', category: 'Unhealthy (55.5–150.4 µg/m³)' };
  return { bg: '#881337', text: '#ffffff', category: 'Very Unhealthy (> 150.4 µg/m³)' };
}
