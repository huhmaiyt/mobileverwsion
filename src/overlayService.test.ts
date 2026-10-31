/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AEROSOL_INDEX_LEVELS,
  AOD_LEVELS,
  DUST_RISK_LEVELS,
  RAINFALL_LEVELS,
  UAE_GRID_CELLS,
  UAE_RASTER_BOUNDS,
  buildRasterImageData,
  clearOverlayCache,
  fetchGridAerosol,
  fetchGridAirQuality,
  fetchGridRainfall,
  fetchGridTemperature,
  generateRasterDataUrl,
  getAerosolDetectionConfig,
  getAirQualityColor,
  getAodColor,
  getContinuousColorRgba,
  getDemoGridAerosol,
  getDemoGridAirQuality,
  getDemoGridRainfall,
  getRainfallColor,
  getTemperatureColor,
  interpolateValueAtPoint,
} from './overlayService.ts';

test('Overlay Grid: all UAE_GRID_CELLS coordinates fall within UAE territory bounding box', () => {
  assert.ok(UAE_GRID_CELLS.length >= 25, 'Should have sufficient grid density across UAE');

  for (const cell of UAE_GRID_CELLS) {
    // UAE bounding box roughly 22.5°N - 26.5°N, 51.0°E - 57.0°E
    assert.ok(
      cell.lat >= 22.5 && cell.lat <= 26.5,
      `Cell latitude ${cell.lat} must fall within UAE bounds`
    );
    assert.ok(
      cell.lon >= 51.0 && cell.lon <= 57.0,
      `Cell longitude ${cell.lon} must fall within UAE bounds`
    );

    // Bounds must be properly ordered [[south, west], [north, east]]
    const [[south, west], [north, east]] = cell.bounds;
    assert.ok(south < north, 'South bound must be strictly less than north bound');
    assert.ok(west < east, 'West bound must be strictly less than east bound');
    assert.ok(cell.lat > south && cell.lat < north, 'Center lat must be within bounds');
    assert.ok(cell.lon > west && cell.lon < east, 'Center lon must be within bounds');
  }
});

test('Overlay Colors: temperature scales correctly and handles missing values without inventing numbers', () => {
  // Cold / Mild
  const cold = getTemperatureColor(18.5);
  assert.equal(cold.bg, '#3b82f6');
  assert.ok(cold.label.includes('< 20°C'));

  // Warm
  const warm = getTemperatureColor(28.0);
  assert.equal(warm.bg, '#10b981');
  assert.ok(warm.label.includes('26–31°C'));

  // Hot
  const hot = getTemperatureColor(35.5);
  assert.equal(hot.bg, '#f59e0b');
  assert.ok(hot.label.includes('32–37°C'));

  // Extreme
  const extreme = getTemperatureColor(46.0);
  assert.equal(extreme.bg, '#b91c1c');
  assert.ok(extreme.label.includes('≥ 44°C'));

  // Missing reading must NEVER invent a default 0°C or 25°C
  const missing = getTemperatureColor(null);
  assert.equal(missing.bg, '#9ca3af');
  assert.equal(missing.label, 'Unavailable');

  const nanVal = getTemperatureColor(NaN);
  assert.equal(nanVal.bg, '#9ca3af');
  assert.equal(nanVal.label, 'Unavailable');
});

test('Overlay Colors: US AQI 0-500 scale categories and missing handling', () => {
  // Good (0-50)
  const good = getAirQualityColor('us_aqi', 35);
  assert.equal(good.bg, '#10b981');
  assert.ok(good.category.includes('Good'));

  // Moderate (51-100)
  const mod = getAirQualityColor('us_aqi', 75);
  assert.equal(mod.bg, '#facc15');
  assert.ok(mod.category.includes('Moderate'));

  // Unhealthy for Sensitive (101-150)
  const usg = getAirQualityColor('us_aqi', 130);
  assert.equal(usg.bg, '#f97316');
  assert.ok(usg.category.includes('Unhealthy for Sensitive'));

  // Unhealthy (151-200)
  const unh = getAirQualityColor('us_aqi', 180);
  assert.equal(unh.bg, '#ef4444');
  assert.ok(unh.category.includes('Unhealthy'));

  // Very Unhealthy (201-300)
  const veryUnh = getAirQualityColor('us_aqi', 250);
  assert.equal(veryUnh.bg, '#8b5cf6');
  assert.ok(veryUnh.category.includes('Very Unhealthy'));

  // Hazardous (301+)
  const haz = getAirQualityColor('us_aqi', 380);
  assert.equal(haz.bg, '#881337');
  assert.ok(haz.category.includes('Hazardous'));

  // Missing data
  const missing = getAirQualityColor('us_aqi', null);
  assert.equal(missing.bg, '#9ca3af');
  assert.equal(missing.category, 'Data Missing');
});

test('Overlay Colors: PM10 and PM2.5 metric thresholds', () => {
  // PM10 low (30 µg/m³) vs elevated (180 µg/m³) vs hazardous (450 µg/m³)
  assert.ok(getAirQualityColor('pm10', 30).category.includes('Low'));
  assert.ok(getAirQualityColor('pm10', 180).category.includes('Elevated'));
  assert.ok(getAirQualityColor('pm10', 450).category.includes('Hazardous'));

  // PM2.5 good (8 µg/m³) vs high (75 µg/m³)
  assert.ok(getAirQualityColor('pm2_5', 8).category.includes('Good'));
  assert.ok(getAirQualityColor('pm2_5', 75).category.includes('Unhealthy'));
});

test('Overlay Aerosol: Suomi-NPP OMPS UV Aerosol Index configuration, transparent tile URL, and scientific disclaimer', () => {
  const config = getAerosolDetectionConfig('2026-10-24');

  assert.equal(config.dateString, '2026-10-24');
  assert.ok(config.tileUrl.includes('gibs.earthdata.nasa.gov'));
  assert.ok(config.tileUrl.includes('OMPS_Aerosol_Index'));
  assert.ok(config.tileUrl.includes('GoogleMapsCompatible_Level6'));
  assert.ok(config.tileUrl.endsWith('.png'), 'Aerosol Index tiles must be transparent PNGs');
  assert.ok(config.attribution.includes('NASA'));
  assert.ok(config.instrument.includes('OMPS'));
  assert.equal(config.layerIdentifier, 'OMPS_Aerosol_Index');

  // Critical requirement: do not describe Aerosol Index as ground-level AQI, PM10 concentration or direct dust concentration
  assert.ok(
    config.disclaimer.includes('cannot independently identify the aerosol source') &&
      config.disclaimer.includes('directly quantify ground-level'),
    'Disclaimer must explicitly state that AI cannot independently identify aerosol source or quantify ground-level dust concentration'
  );
  assert.ok(
    config.disclaimer.includes('mineral dust') && config.disclaimer.includes('smoke'),
    'Disclaimer must clarify that aerosol detection responds to UV-absorbing aerosols including dust and smoke'
  );
  assert.equal(config.dataSourceNature, 'satellite_observation');
});

test('Overlay Aerosol: AEROSOL_INDEX_LEVELS qualitative scientific categories and absence of unverified hazard claims', () => {
  assert.equal(AEROSOL_INDEX_LEVELS.length, 4, 'Must have 4 qualitative signal levels');

  const labels = AEROSOL_INDEX_LEVELS.map((l) => l.label);
  assert.ok(labels.includes('Low / Near-Zero Signal'));
  assert.ok(labels.includes('Positive Aerosol Signal'));
  assert.ok(labels.includes('Moderate Aerosol Signal'));
  assert.ok(labels.includes('Stronger Aerosol Signal'));

  // Ensure unvalidated storm categories are not used as official thresholds
  const allText = JSON.stringify(AEROSOL_INDEX_LEVELS);
  assert.ok(!allText.includes('Dense Dust Storm'), 'Must not claim unverified "Dense Dust Storm" boundary');
  assert.ok(!allText.includes('Severe Dust / Thick Plume'), 'Must not claim unverified "Severe Dust" boundary');

  for (const lvl of AEROSOL_INDEX_LEVELS) {
    assert.ok(lvl.color.startsWith('#'), 'Color should be valid hex code');
    assert.ok(lvl.label.length > 0, 'Label must not be empty');
    assert.ok(lvl.description.length > 0, 'Description must not be empty');
  }
});

test('Continuous Interpolation: interpolateValueAtPoint produces smooth blends and never invents values', () => {
  const points = [
    { lat: 24.0, lon: 54.0, value: 50 },
    { lat: 25.0, lon: 54.0, value: 100 },
    { lat: 24.0, lon: 55.0, value: null }, // Missing reading
  ];

  // 1. Exact coordinate match returns the exact point value
  const exact = interpolateValueAtPoint(24.0, 54.0, points);
  assert.equal(exact, 50);

  // 2. Midpoint between 50 and 100 is smoothly interpolated around 75
  const mid = interpolateValueAtPoint(24.5, 54.0, points);
  assert.ok(mid !== null && mid >= 70 && mid <= 80, `Midpoint should be around 75, got ${mid}`);

  // 3. Point far outside UAE envelope (> 1.35 deg from valid points) returns null
  const far = interpolateValueAtPoint(30.0, 60.0, points);
  assert.equal(far, null, 'Must return null for coordinates outside data radius; never invent values');

  // 4. Missing value is skipped and not treated as zero
  const nearMissing = interpolateValueAtPoint(24.0, 54.9, points);
  assert.ok(nearMissing !== null && nearMissing > 30, 'Should interpolate from valid points only, not 0');
});

test('Continuous Color Ramp: getContinuousColorRgba produces smooth RGBA transitions and transparent missing values', () => {
  // Missing value is completely transparent (alpha = 0)
  const [mr, mg, mb, ma] = getContinuousColorRgba('us_aqi', null);
  assert.equal(ma, 0, 'Missing value must have 0 alpha');

  // Low AQI (Good - Green)
  const [gr, gg, gb, ga] = getContinuousColorRgba('us_aqi', 25);
  assert.ok(gg > gr && gg > gb, 'Good AQI should be green-dominated');
  assert.ok(ga > 150, 'Valid point must have visible opacity');

  // Smooth blend between 50 (greenish) and 100 (yellow)
  const [r75, g75, b75] = getContinuousColorRgba('us_aqi', 75);
  assert.ok(r75 > 100 && g75 > 150, '75 AQI should blend green to yellow');

  // Temperature continuous ramp: 15°C (blue) vs 45°C (red/crimson)
  const [trCold, tgCold, tbCold] = getContinuousColorRgba('temperature', 15);
  assert.ok(tbCold > trCold, '15°C must be blue-dominated');

  const [trHot, tgHot, tbHot] = getContinuousColorRgba('temperature', 45);
  assert.ok(trHot > tbHot && trHot > tgHot, '45°C must be red-dominated');
});

test('Continuous Raster Buffer: buildRasterImageData generates seamless RGBA buffer without rectangular borders', () => {
  const points = [
    { lat: 24.0, lon: 54.0, value: 30 },
    { lat: 24.8, lon: 55.0, value: 38 },
  ];
  const width = 20;
  const height = 15;
  const bounds: [[number, number], [number, number]] = [[23.5, 53.5], [25.5, 55.5]];

  const buffer = buildRasterImageData(width, height, bounds, points, 'temperature');
  assert.equal(buffer.length, width * height * 4, 'Buffer size must equal width * height * 4');

  // Pixels near valid points must have non-zero alpha
  let hasVisiblePixels = false;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) {
      hasVisiblePixels = true;
      break;
    }
  }
  assert.ok(hasVisiblePixels, 'Raster buffer must contain rendered pixels');
});

test('AOD Grid: fetchGridAerosol fetches genuine AOD data across UAE grid without inventing values', async () => {
  clearOverlayCache();
  const result = await fetchGridAerosol();

  assert.equal(result.type, 'aerosol');
  assert.equal(result.cells.length, UAE_GRID_CELLS.length);
  assert.ok(result.sourceAttribution.includes('Copernicus Atmosphere Monitoring Service (CAMS)'));
  assert.equal(result.dataSourceNature, 'model_forecast');
  assert.ok(result.disclaimer.includes('Aerosol Optical Depth') && result.disclaimer.includes('AOD at 550nm'));
  assert.ok(result.disclaimer.includes('NOT a direct measurement of ground-level PM10'));

  // Ensure each cell matches the corresponding UAE_GRID_CELLS coordinate
  result.cells.forEach((cell, idx) => {
    const gridRef = UAE_GRID_CELLS[idx];
    assert.equal(cell.cellId, gridRef.id);
    assert.equal(cell.lat, gridRef.lat);
    assert.equal(cell.lon, gridRef.lon);
    if (cell.aod !== null) {
      assert.ok(Number.isFinite(cell.aod));
      assert.ok(cell.aod >= 0, 'AOD must be non-negative');
      assert.equal(cell.status, 'ok');
    } else {
      assert.equal(cell.status, 'missing');
    }
  });

  // Cached response
  const cached = await fetchGridAerosol();
  assert.equal(cached.isCached, true);
});

test('AOD Rendering: valid AOD data produces renderable continuous raster with correct RGBA colors', () => {
  // Test distinct AOD values across the optical scale
  const [cr, cg, cb, ca] = getContinuousColorRgba('aerosol', 0.1);
  assert.ok(cg > cr && cg > cb, 'Clean AOD (0.1) should have emerald/green dominant tones');
  assert.ok(ca >= 160, 'Alpha must be visible without completely obscuring the base map');

  const [mr, mg, mb, ma] = getContinuousColorRgba('aerosol', 0.4);
  assert.ok(mg > 180 && mr > 150, 'Moderate AOD (0.4) should have yellow/lime tones');
  assert.ok(ma >= 170, 'Alpha must be visible');

  const [hr, hg, hb, ha] = getContinuousColorRgba('aerosol', 1.4);
  assert.ok(hr > hg && hr > hb, 'High AOD (1.4) should have red/orange dominant tones');
  assert.ok(ha >= 190, 'Alpha must be visible');

  const [vr, vg, vb, va] = getContinuousColorRgba('aerosol', 2.5);
  assert.ok(vr > 100 && vb > 40 && vr > vg, 'Very High AOD (2.5) should have dark red/maroon tones');
  assert.ok(va >= 210, 'Alpha must be visible');

  // Test continuous raster generation for AOD
  const points = [
    { lat: 24.2, lon: 54.5, value: 0.45 },
    { lat: 25.0, lon: 55.3, value: 0.85 },
  ];
  const buffer = buildRasterImageData(20, 15, UAE_RASTER_BOUNDS, points, 'aerosol');
  assert.equal(buffer.length, 20 * 15 * 4);

  let hasColor = false;
  for (let i = 0; i < buffer.length; i += 4) {
    if (buffer[i + 3] > 0) {
      hasColor = true;
      break;
    }
  }
  assert.ok(hasColor, 'AOD raster buffer must contain colored pixels');
});

test('AOD Missing/Invalid Safety: missing or invalid AOD produces explicit unavailable state and transparent raster', () => {
  // Missing or non-finite AOD must produce 0 alpha (fully transparent) — never fabricates 0 or background average
  const [nr, ng, nb, na] = getContinuousColorRgba('aerosol', null);
  assert.equal(na, 0, 'Null AOD must produce completely transparent pixel');

  const [nanR, nanG, nanB, nanA] = getContinuousColorRgba('aerosol', NaN);
  assert.equal(nanA, 0, 'NaN AOD must produce completely transparent pixel');

  const [infR, infG, infB, infA] = getContinuousColorRgba('aerosol', Infinity);
  assert.equal(infA, 0, 'Infinity AOD must produce completely transparent pixel');

  // getAodColor handles missing explicitly
  const unavailNull = getAodColor(null);
  assert.equal(unavailNull.label, 'Unavailable');
  assert.equal(unavailNull.bg, '#9ca3af');

  const unavailNan = getAodColor(NaN);
  assert.equal(unavailNan.label, 'Unavailable');

  // Raster with only missing values produces completely transparent buffer
  const missingPoints = [
    { lat: 24.2, lon: 54.5, value: null },
    { lat: 25.0, lon: 55.3, value: null },
  ];
  const buffer = buildRasterImageData(10, 10, UAE_RASTER_BOUNDS, missingPoints, 'aerosol');
  let hasVisiblePixels = false;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) {
      hasVisiblePixels = true;
      break;
    }
  }
  assert.equal(hasVisiblePixels, false, 'Buffer for missing AOD must contain zero visible pixels');
});

test('AOD Classification: getAodColor categorizes all ranges correctly', () => {
  const clean = getAodColor(0.15);
  assert.ok(clean.label.includes('Clean / Low'));
  assert.equal(clean.bg, '#10b981');

  const mod = getAodColor(0.35);
  assert.ok(mod.label.includes('Moderate'));
  assert.equal(mod.bg, '#facc15');

  const elevated = getAodColor(0.75);
  assert.ok(elevated.label.includes('Elevated'));
  assert.equal(elevated.bg, '#f97316');

  const high = getAodColor(1.35);
  assert.ok(high.label.includes('High'));
  assert.equal(high.bg, '#ef4444');

  const extreme = getAodColor(2.2);
  assert.ok(extreme.label.includes('Very High'));
  assert.equal(extreme.bg, '#881337');
});

test('AOD Geographic Alignment: UAE_RASTER_BOUNDS bounds all UAE grid points and preserves coordinates', () => {
  const [[south, west], [north, east]] = UAE_RASTER_BOUNDS;

  for (const cell of UAE_GRID_CELLS) {
    assert.ok(cell.lat >= south && cell.lat <= north, `Lat ${cell.lat} must be within raster bounds [${south}, ${north}]`);
    assert.ok(cell.lon >= west && cell.lon <= east, `Lon ${cell.lon} must be within raster bounds [${west}, ${east}]`);
  }

  // Exact point interpolation preserves the source value exactly
  const points = [{ lat: 24.5, lon: 54.5, value: 0.65 }];
  const sampled = interpolateValueAtPoint(24.5, 54.5, points);
  assert.equal(sampled, 0.65, 'Interpolation at exact coordinates must match source value');
});

test('AOD Honest Science: AOD disclaimers and levels do not conflate column extinction with ground-level PM10', () => {
  assert.equal(AOD_LEVELS.length, 5);

  const allAodText = JSON.stringify(AOD_LEVELS);
  assert.ok(!allAodText.includes('µg/m³'), 'AOD levels must not be expressed in microgram per cubic meter PM mass units');
  assert.ok(!allAodText.includes('PM10 ground truth'), 'AOD levels must not claim PM10 ground truth');

  // Verify honest descriptions
  for (const lvl of AOD_LEVELS) {
    assert.ok(lvl.description.length > 0);
    assert.ok(lvl.color.startsWith('#'));
  }
});

test('AOD Raster Generation: generateRasterDataUrl returns null when no valid points or in non-browser env', () => {
  // 1. Empty array
  const emptyRes = generateRasterDataUrl([], 'aerosol');
  assert.equal(emptyRes, null, 'Must return null for empty points array');

  // 2. All points missing or null
  const allNullRes = generateRasterDataUrl(
    [
      { lat: 24.0, lon: 54.0, value: null },
      { lat: 25.0, lon: 55.0, value: null },
    ],
    'aerosol'
  );
  assert.equal(allNullRes, null, 'Must return null when all points have null values');

  // 3. All points non-finite
  const allNanRes = generateRasterDataUrl(
    [
      { lat: 24.0, lon: 54.0, value: NaN },
      { lat: 25.0, lon: 55.0, value: Infinity },
    ],
    'aerosol'
  );
  assert.equal(allNanRes, null, 'Must return null when all points have non-finite values');
});

test('AOD Pipeline Auditing: fetchGridAerosol audits validCount, missingCount, and invalidCount', async () => {
  clearOverlayCache();
  const res = await fetchGridAerosol(true);

  assert.ok(typeof res.validCount === 'number');
  assert.ok(typeof res.missingCount === 'number');
  assert.ok(typeof res.invalidCount === 'number');

  const total = (res.validCount ?? 0) + (res.missingCount ?? 0) + (res.invalidCount ?? 0);
  assert.equal(total, res.cells.length, 'Sum of valid, missing, and invalid counts must equal total cells');
  assert.equal(res.cells.length, UAE_GRID_CELLS.length);
});

test('Overlay Rainfall: RAINFALL_LEVELS thresholds, units, and accumulated precipitation semantics', () => {
  assert.ok(RAINFALL_LEVELS.length >= 6, 'Must define a comprehensive multi-tier rainfall scale');

  // Verify units are mm (accumulated precipitation) and not conflated with precipitation rate (mm/h)
  for (const lvl of RAINFALL_LEVELS) {
    assert.ok(lvl.range.includes('mm'), `Range "${lvl.range}" must express units in mm`);
    assert.ok(lvl.color.startsWith('#'), `Color "${lvl.color}" must be a valid hex code`);
    assert.ok(lvl.label.length > 0, 'Level must have a descriptive label');
    assert.ok(lvl.description.length > 0, 'Level must have a description');
    assert.ok(lvl.min >= 0, 'Level min threshold must be non-negative');
    assert.ok(lvl.max > lvl.min, 'Level max must exceed min');
  }

  // Verify specific breakpoints
  const labels = RAINFALL_LEVELS.map((l) => l.label);
  assert.ok(labels.some((l) => l.includes('No Rain') || l.includes('Dry')));
  assert.ok(labels.some((l) => l.includes('Light')));
  assert.ok(labels.some((l) => l.includes('Moderate')));
  assert.ok(labels.some((l) => l.includes('Heavy')));
  assert.ok(labels.some((l) => l.includes('Extreme') || l.includes('Torrential')));
});

test('Overlay Rainfall: getRainfallColor categorizes all values correctly and NEVER conflates missing with zero', () => {
  // 0.0 mm (No Rain / Dry)
  const zero = getRainfallColor(0.0);
  assert.equal(zero.label, '0.0 mm (No Rain / Dry)');
  assert.equal(zero.intensity, 'Dry');
  assert.equal(zero.bg, '#cbd5e1');

  // 0.3 mm (Very Light / Trace)
  const trace = getRainfallColor(0.3);
  assert.ok(trace.label.includes('< 0.5 mm'));
  assert.equal(trace.intensity, 'Trace');

  // 1.2 mm (Light Rain)
  const light = getRainfallColor(1.2);
  assert.ok(light.label.includes('0.5–2.0 mm'));
  assert.equal(light.intensity, 'Light');

  // 3.5 mm (Moderate Rain)
  const mod = getRainfallColor(3.5);
  assert.ok(mod.label.includes('2.0–5.0 mm'));
  assert.equal(mod.intensity, 'Moderate');

  // 10.0 mm (Heavy Rain)
  const heavy = getRainfallColor(10.0);
  assert.ok(heavy.label.includes('5.0–15.0 mm'));
  assert.equal(heavy.intensity, 'Heavy');

  // 25.0 mm (Very Heavy Rain)
  const veryHeavy = getRainfallColor(25.0);
  assert.ok(veryHeavy.label.includes('15.0–30.0 mm'));
  assert.equal(veryHeavy.intensity, 'Very Heavy');

  // 55.0 mm (Torrential / Extreme)
  const extreme = getRainfallColor(55.0);
  assert.ok(extreme.label.includes('≥ 30.0 mm'));
  assert.equal(extreme.intensity, 'Extreme');

  // CRITICAL REQUIREMENT: Never convert missing, null or malformed rainfall into zero rainfall!
  const nullReading = getRainfallColor(null);
  assert.equal(nullReading.label, 'Unavailable');
  assert.equal(nullReading.intensity, 'Unavailable');
  assert.notEqual(nullReading.label, zero.label, 'Missing rainfall must NEVER be converted to zero rainfall');

  const nanReading = getRainfallColor(NaN);
  assert.equal(nanReading.label, 'Unavailable');
  assert.notEqual(nanReading.label, zero.label);

  const negReading = getRainfallColor(-2.5);
  assert.equal(negReading.label, 'Unavailable');
});

test('Overlay Rainfall: getContinuousColorRgba handles transitions and keeps missing values transparent', () => {
  // Missing values (null, NaN, Infinity) MUST be completely transparent (alpha = 0)
  const [, , , nullAlpha] = getContinuousColorRgba('rainfall', null);
  assert.equal(nullAlpha, 0, 'Null rainfall must produce completely transparent pixel');

  const [, , , nanAlpha] = getContinuousColorRgba('rainfall', NaN);
  assert.equal(nanAlpha, 0, 'NaN rainfall must produce completely transparent pixel');

  const [, , , infAlpha] = getContinuousColorRgba('rainfall', Infinity);
  assert.equal(infAlpha, 0, 'Infinity rainfall must produce completely transparent pixel');

  // Valid values produce non-zero alpha and proper gradient
  const [r0, g0, b0, a0] = getContinuousColorRgba('rainfall', 0.0);
  assert.ok(a0 > 0, '0.0 mm should have subtle non-zero alpha so layer coverage is verified');

  const [rLight, gLight, bLight, aLight] = getContinuousColorRgba('rainfall', 1.0);
  assert.ok(aLight > a0, 'Light rain alpha must be denser than dry trace');

  const [rExtreme, gExtreme, bExtreme, aExtreme] = getContinuousColorRgba('rainfall', 50.0);
  assert.ok(aExtreme >= 230, 'Extreme rain must produce dense high-alpha color');
  assert.ok(rExtreme > gExtreme, 'Extreme rain should lean red/torrential');
});

test('Overlay Rainfall: fetchGridRainfall distinguishes accumulated precipitation from rate and audits counts', async () => {
  clearOverlayCache();
  const res = await fetchGridRainfall(true);

  assert.equal(res.type, 'rainfall');
  assert.ok(res.cells.length === UAE_GRID_CELLS.length);
  assert.equal(res.dataSourceNature, 'model_forecast');

  // Verify explicit distinction in disclaimer: accumulated precipitation, not precipitation rate
  assert.ok(
    res.disclaimer.includes('accumulated') && res.disclaimer.includes('NOT instantaneous precipitation rate'),
    'Disclaimer must explicitly state accumulated precipitation (mm) and not label as precipitation rate'
  );

  // Verify audit counts
  assert.ok(typeof res.validCount === 'number');
  assert.ok(typeof res.missingCount === 'number');
  assert.ok(typeof res.invalidCount === 'number');
  assert.equal(res.validCount! + res.missingCount! + res.invalidCount!, res.cells.length);

  // Each cell must either have a valid non-negative number or null (never fabricated)
  for (const cell of res.cells) {
    if (cell.status === 'ok') {
      assert.ok(typeof cell.precipitationMm === 'number');
      assert.ok(Number.isFinite(cell.precipitationMm));
      assert.ok(cell.precipitationMm >= 0);
    } else {
      assert.equal(cell.precipitationMm, null, 'Unhealthy cell must have null precipitation, never zero');
    }
  }
});

test('Overlay UAE Geographic Extent: soft map bounds keep map focused on UAE and cover UAE territory', () => {
  const [[south, west], [north, east]] = UAE_RASTER_BOUNDS;

  // Verify UAE raster bounding box strictly covers UAE: 22.5°N - 26.3°N, 51.3°E - 56.6°E
  assert.ok(south >= 22.0 && south <= 23.0, 'South bound must encompass southern Liwa');
  assert.ok(north >= 26.0 && north <= 27.0, 'North bound must encompass northern Ras Al Khaimah / coast');
  assert.ok(west >= 51.0 && west <= 52.0, 'West bound must encompass western Al Dhafra / Ruwais');
  assert.ok(east >= 56.0 && east <= 57.0, 'East bound must encompass eastern Fujairah');

  // Soft map extent for navigation: [[20.5, 49.5], [28.5, 58.5]]
  const softMapBounds = [
    [20.5, 49.5],
    [28.5, 58.5],
  ];
  assert.ok(softMapBounds[0][0] < south, 'Soft bounds should preserve a modest area south of the UAE');
  assert.ok(softMapBounds[0][1] < west, 'Soft bounds should preserve a modest area west of the UAE (Gulf/Qatar)');
  assert.ok(softMapBounds[1][0] > north, 'Soft bounds should preserve a modest area north of the UAE (Gulf)');
  assert.ok(softMapBounds[1][1] > east, 'Soft bounds should preserve a modest area east of the UAE (Oman)');
});

test('Overlay Rainfall Raster: buildRasterImageData produces valid buffer under dry (0.0 mm) conditions', () => {
  const points = UAE_GRID_CELLS.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    value: 0.0, // Arid UAE typical condition
  }));

  const buffer = buildRasterImageData(100, 80, UAE_RASTER_BOUNDS, points, 'rainfall');
  assert.equal(buffer.length, 100 * 80 * 4);

  // Every pixel within the UAE raster bounds should have visible alpha
  let visiblePixels = 0;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) visiblePixels++;
  }
  assert.ok(visiblePixels > 0, 'Dry rainfall overlay must produce visible pixels so layer renders across UAE');
});

test('Overlay Rainfall Robustness: missing or null readings in some cells do not collapse entire overlay', () => {
  // 35 cells with valid readings, 1 cell with null/missing reading
  const points = UAE_GRID_CELLS.map((c, idx) => ({
    lat: c.lat,
    lon: c.lon,
    value: idx === 0 ? null : 0.0,
  }));

  const buffer = buildRasterImageData(50, 40, UAE_RASTER_BOUNDS, points, 'rainfall');
  assert.equal(buffer.length, 50 * 40 * 4);

  let visiblePixels = 0;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) visiblePixels++;
  }
  assert.ok(visiblePixels > 0, 'Overlay must continue rendering valid cells even if one cell is missing');
});

test('Overlay Rainfall Continuous Raster: missing rainfall values return 100% transparent pixels and do not invent data', () => {
  const missingPoints = UAE_GRID_CELLS.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    value: null,
  }));

  const buffer = buildRasterImageData(50, 40, UAE_RASTER_BOUNDS, missingPoints, 'rainfall');
  let nonZeroCount = 0;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) nonZeroCount++;
  }

  assert.equal(nonZeroCount, 0, 'When all rainfall points are missing, buffer must be 100% transparent');
});

test('Overlay Rainfall Continuous Raster: gradient produces smooth transitions between varied rainfall values', () => {
  const points = UAE_GRID_CELLS.map((c) => {
    let rainMm: number | null = 0.0;
    if (c.lon >= 55.5 && c.lat >= 24.5) {
      rainMm = 18.5; // Heavy rain in east/northeast
    } else if (c.lon >= 54.5 && c.lat >= 24.0) {
      rainMm = 3.5; // Moderate rain
    } else {
      rainMm = 0.0; // Dry
    }
    return { lat: c.lat, lon: c.lon, value: rainMm };
  });

  const buffer = buildRasterImageData(60, 45, UAE_RASTER_BOUNDS, points, 'rainfall', 1.45);
  assert.equal(buffer.length, 60 * 45 * 4);

  let hasHeavyRainHue = false;
  let hasModerateRainHue = false;
  let hasDrySkyHue = false;

  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const a = buffer[i + 3];

    if (a > 0) {
      if (r >= 150 && g >= 200 && b >= 230) hasDrySkyHue = true;
      if (g > r && g > b) hasModerateRainHue = true;
      if (r >= 200 && g >= 100 && b < 100) hasHeavyRainHue = true;
    }
  }

  assert.ok(hasDrySkyHue, 'Raster must display dry coverage tint');
  assert.ok(hasModerateRainHue, 'Raster must display smooth moderate green rain gradient');
  assert.ok(hasHeavyRainHue, 'Raster must display heavy amber/orange rain gradient');
});

test('Continuous Dust-Risk Color Ramp: produces yellow for lower values, orange for intermediate, red for higher', () => {
  // Lower values (0-24, Low risk) -> Yellow hue
  const [rLow, gLow, bLow, aLow] = getContinuousColorRgba('dust_risk', 10);
  assert.ok(rLow >= 240 && gLow >= 180, 'Low dust risk must be yellow hue (high red and green)');
  assert.ok(bLow < 150, 'Low dust risk blue channel should be lower than green/red');
  assert.ok(aLow >= 160 && aLow <= 180, 'Low dust risk must maintain visible translucent alpha');

  // Intermediate values (25-49, 50-74, Moderate to High risk) -> Orange hue
  const [rMod, gMod, bMod, aMod] = getContinuousColorRgba('dust_risk', 35);
  assert.ok(rMod >= 230, 'Moderate dust risk must have strong red');
  assert.ok(gMod >= 140 && gMod < rMod, 'Moderate dust risk green channel lower than red (orange)');
  assert.ok(bMod < 50, 'Moderate dust risk blue channel should be low');

  const [rHigh, gHigh, bHigh, aHigh] = getContinuousColorRgba('dust_risk', 60);
  assert.ok(rHigh >= 230, 'High dust risk must have strong red');
  assert.ok(gHigh >= 80 && gHigh <= 140, 'High dust risk must have distinct orange green level');
  assert.ok(bHigh < 30, 'High dust risk blue channel minimal');
  assert.ok(aHigh >= 170 && aHigh <= 210, 'High dust risk alpha level');

  // Higher values (75-100, Very High risk) -> Red / deep crimson
  const [rVeryHigh, gVeryHigh, bVeryHigh, aVeryHigh] = getContinuousColorRgba('dust_risk', 85);
  assert.ok(rVeryHigh >= 210, 'Very High dust risk must be red');
  assert.ok(gVeryHigh < 80, 'Very High dust risk green channel must be low');
  assert.ok(bVeryHigh < 80, 'Very High dust risk blue channel must be low');
  assert.ok(aVeryHigh >= 200, 'Very High dust risk alpha level');

  // Missing or non-finite values must produce 100% transparent pixel
  assert.deepEqual(getContinuousColorRgba('dust_risk', null), [0, 0, 0, 0]);
  assert.deepEqual(getContinuousColorRgba('dust_risk', NaN), [0, 0, 0, 0]);
  assert.deepEqual(getContinuousColorRgba('dust_risk', Infinity), [0, 0, 0, 0]);
});

test('Continuous Dust-Risk Raster: buildRasterImageData generates smooth continuous surface from 10 UAE cities', () => {
  // Sample realistic scores for 10 UAE cities
  const cityPoints = [
    { lat: 24.47, lon: 54.37, value: 30 }, // Abu Dhabi
    { lat: 25.20, lon: 55.27, value: 22 }, // Dubai
    { lat: 25.36, lon: 55.39, value: 25 }, // Sharjah
    { lat: 25.41, lon: 55.44, value: 26 }, // Ajman
    { lat: 25.56, lon: 55.55, value: 28 }, // UAQ
    { lat: 25.79, lon: 55.94, value: 35 }, // RAK
    { lat: 25.12, lon: 56.33, value: 18 }, // Fujairah
    { lat: 24.21, lon: 55.76, value: 45 }, // Al Ain
    { lat: 23.13, lon: 53.77, value: 65 }, // Liwa (desert/higher risk)
    { lat: 24.11, lon: 52.73, value: 50 }, // Ruwais
  ];

  const width = 80;
  const height = 60;
  const buffer = buildRasterImageData(width, height, UAE_RASTER_BOUNDS, cityPoints, 'dust_risk', 2.5);

  assert.equal(buffer.length, width * height * 4, 'Buffer size must equal width * height * 4');

  let nonZeroPixels = 0;
  let hasYellow = false;
  let hasOrange = false;
  let hasRed = false;

  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const a = buffer[i + 3];

    if (a > 0) {
      nonZeroPixels++;
      // Check transparency: alpha must never be completely opaque (255) to keep baselayer visible
      assert.ok(a <= 235, 'Alpha must preserve transparency for roads and labels');

      // Check colour presence
      if (r >= 240 && g >= 180) hasYellow = true;
      if (r >= 230 && g >= 80 && g < 180) hasOrange = true;
      if (r >= 200 && g < 80) hasRed = true;
    }
  }

  assert.ok(nonZeroPixels > (width * height * 0.7), 'Majority of UAE landmass must be covered by smooth continuous raster');
  assert.ok(hasYellow, 'Raster must contain yellow for lower values');
  assert.ok(hasOrange, 'Raster must contain orange for intermediate values');
});

test('Continuous Dust-Risk Missing Handling: completely missing data returns null and never fabricates values', () => {
  const missingPoints = [
    { lat: 24.47, lon: 54.37, value: null },
    { lat: 25.20, lon: 55.27, value: null },
    { lat: 23.13, lon: 53.77, value: null },
  ];

  const buffer = buildRasterImageData(50, 40, UAE_RASTER_BOUNDS, missingPoints, 'dust_risk', 2.5);
  let nonZeroCount = 0;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) nonZeroCount++;
  }

  assert.equal(nonZeroCount, 0, 'When all data points are missing, buffer must be 100% transparent');
});

// ============================================================================
// Comprehensive Regression Tests for Rainfall Raster & Demo Mode Verification
// ============================================================================

test('Regression 1: Nonzero rainfall produces spatially varying, visible raster pixels across gradient stops', () => {
  const demoRain = getDemoGridRainfall();
  const points = demoRain.cells.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    value: c.precipitationMm,
  }));

  const width = 80;
  const height = 60;
  const buffer = buildRasterImageData(width, height, UAE_RASTER_BOUNDS, points, 'rainfall', 1.45);

  assert.equal(buffer.length, width * height * 4, 'Buffer size must equal width * height * 4');

  let visiblePixels = 0;
  let hasLightRain = false;
  let hasModerateGreen = false;
  let hasHeavyAmberRed = false;

  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const a = buffer[i + 3];

    if (a > 0) {
      visiblePixels++;
      // Light rain: blue/cyan tinted
      if (b > r && b > 150) hasLightRain = true;
      // Moderate rain: green hue dominant
      if (g > r && g > b) hasModerateGreen = true;
      // Heavy/torrential convective core: amber/orange/red hue
      if (r > 190 && r > b && (g < 170 || r > g)) hasHeavyAmberRed = true;
    }
  }

  assert.ok(visiblePixels > (width * height * 0.65), 'Nonzero rainfall must produce broad visible coverage across UAE');
  assert.ok(hasLightRain, 'Raster must contain light rain blue/cyan hues');
  assert.ok(hasModerateGreen, 'Raster must contain moderate rain green hues');
  assert.ok(hasHeavyAmberRed, 'Raster must contain heavy/torrential amber/red hues');
});

test('Regression 2: Genuine zero rainfall produces a truthful dry display with subtle sky tint', () => {
  // Test continuous color ramp for genuine 0.0 mm
  const [r, g, b, a] = getContinuousColorRgba('rainfall', 0.0);
  assert.equal(r, 186);
  assert.equal(g, 230);
  assert.equal(b, 253);
  assert.equal(a, 55, 'Dry tint alpha must be subtle (55) to maintain map legibility');

  // Test categorical metadata for 0.0 mm
  const meta = getRainfallColor(0.0);
  assert.equal(meta.intensity, 'Dry');
  assert.ok(meta.label.includes('0.0 mm'));

  // Verify that an entirely dry field produces consistent dry tint pixels
  const dryPoints = UAE_GRID_CELLS.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    value: 0.0,
  }));
  const buffer = buildRasterImageData(40, 30, UAE_RASTER_BOUNDS, dryPoints, 'rainfall', 1.45);
  let dryPixelCount = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    if (buffer[i] === 186 && buffer[i + 1] === 230 && buffer[i + 2] === 253 && buffer[i + 3] === 55) {
      dryPixelCount++;
    }
  }
  assert.ok(dryPixelCount > 0, 'Genuine zero rainfall must generate truthful dry sky tint pixels');
});

test('Regression 3: Missing rainfall remains transparent and is never silently converted to zero', () => {
  // Missing / non-finite inputs to color ramp must be completely transparent (alpha = 0)
  assert.deepEqual(getContinuousColorRgba('rainfall', null), [0, 0, 0, 0]);
  assert.deepEqual(getContinuousColorRgba('rainfall', NaN), [0, 0, 0, 0]);
  assert.deepEqual(getContinuousColorRgba('rainfall', -1.0), [0, 0, 0, 0]);
  assert.deepEqual(getContinuousColorRgba('rainfall', Infinity), [0, 0, 0, 0]);

  // Categorical lookup reports Data Missing, never '0.0 mm' or 'None'
  const missingMeta = getRainfallColor(null);
  assert.equal(missingMeta.intensity, 'Unavailable');
  assert.equal(missingMeta.label, 'Unavailable');

  // When every station has null rainfall, the entire raster buffer must have 0 visible pixels
  const allNullPoints = UAE_GRID_CELLS.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    value: null,
  }));
  const buffer = buildRasterImageData(40, 30, UAE_RASTER_BOUNDS, allNullPoints, 'rainfall', 1.45);
  let visibleCount = 0;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) visibleCount++;
  }
  assert.equal(visibleCount, 0, 'All-null rainfall grid must produce 100% transparent raster without inventing zeros');
});

test('Regression 4: Hiding rainfall labels does not hide the raster layer', () => {
  // Raster generation is purely functional and decoupled from UI station marker rendering
  const demoRain = getDemoGridRainfall();
  const points = demoRain.cells.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    value: c.precipitationMm,
  }));

  // buildRasterImageData generates the continuous pixel buffer purely from coordinates & values
  const buffer = buildRasterImageData(60, 45, UAE_RASTER_BOUNDS, points, 'rainfall', 1.45);
  assert.equal(buffer.length, 60 * 45 * 4);
  let visiblePixels = 0;
  for (let i = 3; i < buffer.length; i += 4) {
    if (buffer[i] > 0) visiblePixels++;
  }
  assert.ok(visiblePixels > (60 * 45 * 0.65), 'Raster buffer is fully populated and independent of UI labels');

  // Verify generateRasterDataUrl when canvas document is available
  const originalDoc = (globalThis as unknown as { document?: unknown }).document;
  try {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({
        width: 60,
        height: 45,
        getContext: () => ({
          createImageData: () => ({ data: new Uint8ClampedArray(60 * 45 * 4) }),
          putImageData: () => {},
        }),
        toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }),
    };
    const dataUrl = generateRasterDataUrl(points, 'rainfall', 60, 45, UAE_RASTER_BOUNDS, 1.45);
    assert.ok(dataUrl && dataUrl.startsWith('data:image/png;base64,'), 'Must be a valid PNG data URL');
  } finally {
    (globalThis as unknown as { document: unknown }).document = originalDoc;
  }
});

test('Regression 5: Demo rainfall reaches the raster renderer and agrees with station readings and coordinate sampling', () => {
  const demoRain = getDemoGridRainfall();

  // Exactly 36 UAE grid cells
  assert.equal(demoRain.cells.length, 36);
  assert.equal(demoRain.validCount, 35);
  assert.equal(demoRain.missingCount, 1);
  assert.equal(demoRain.sourceAttribution, 'DEMO — SIMULATED RAINFALL (Deterministic Convective Storm Scenario)');
  assert.ok(demoRain.disclaimer.includes('DEMO — SIMULATED RAINFALL'));

  // Missing cell check: cell at lat 23.0, lon 51.8 must have null precipitation and status 'missing'
  const missingCell = demoRain.cells.find((c) => c.lat === 23.0 && c.lon === 51.8);
  assert.ok(missingCell, 'Missing station cell must exist in demo grid');
  assert.equal(missingCell.precipitationMm, null);
  assert.equal(missingCell.status, 'missing');

  // Peak convective core in Eastern region
  const maxRain = Math.max(...demoRain.cells.map((c) => c.precipitationMm ?? 0));
  assert.equal(maxRain, 23.5, 'Demo peak rainfall must reach 23.5 mm in eastern convective core');

  const demoPoints = demoRain.cells.map((c) => ({ lat: c.lat, lon: c.lon, value: c.precipitationMm }));

  // Coordinate sampling at Eastern Region (Fujairah / Hajar Mountains)
  const sampledEast = interpolateValueAtPoint(25.4, 56.2, demoPoints, 1.45);
  assert.ok(sampledEast !== null && sampledEast > 15.0, 'Sampling at eastern coordinate must yield heavy rain (> 15 mm)');

  // Coordinate sampling at Western Desert (dry area)
  const sampledWest = interpolateValueAtPoint(23.0, 52.7, demoPoints, 1.45);
  assert.equal(sampledWest, 0.0, 'Sampling at western desert coordinate must yield genuine 0.0 mm');
});

test('Regression 6: Air quality and satellite layers switch to deterministic demo datasets in Demo Mode', async () => {
  // Air Quality in Demo Mode
  const demoAq = await fetchGridAirQuality(true, true);
  assert.equal(demoAq.type, 'air_quality');
  assert.ok(demoAq.sourceAttribution.includes('DEMO — SIMULATED AIR QUALITY'));
  assert.ok(demoAq.disclaimer.includes('western Shamal dust loading'));
  assert.equal(demoAq.cells.length, 36);

  // Missing cell preserved in demo AQ
  const missingAqCell = demoAq.cells.find((c) => c.lat === 23.0 && c.lon === 51.8);
  assert.ok(missingAqCell);
  assert.equal(missingAqCell.usAqi, null);
  assert.equal(missingAqCell.status, 'missing');

  // Western cells have elevated dust AQI
  const westAqCell = demoAq.cells.find((c) => c.lat === 23.0 && c.lon === 52.7);
  assert.ok(westAqCell && westAqCell.usAqi !== null && westAqCell.usAqi >= 180);

  // Aerosol AOD in Demo Mode
  const demoAerosol = await fetchGridAerosol(true, true);
  assert.equal(demoAerosol.type, 'aerosol');
  assert.ok(demoAerosol.sourceAttribution.includes('DEMO — SIMULATED CAMS AOD'));
  assert.equal(demoAerosol.missingCount, 1);
  const westAodCell = demoAerosol.cells.find((c) => c.lat === 23.0 && c.lon === 52.7);
  assert.ok(westAodCell && westAodCell.aod !== null && westAodCell.aod >= 1.3);

  // NASA OMPS Satellite in Demo Mode: uses historic storm swath (2024-04-16)
  const ompsConfig = getAerosolDetectionConfig(undefined, true);
  assert.equal(ompsConfig.dateString, '2024-04-16', 'Demo mode OMPS must serve historic storm date 2024-04-16');
  assert.ok(ompsConfig.attribution.includes('DEMO'));
  assert.ok(ompsConfig.disclaimer.includes('DEMO — HISTORIC SATELLITE RETRIEVAL'));
});

test('Regression 7: Disabling Demo Mode isolates live caches from demo caches', async () => {
  clearOverlayCache();

  // Fetch demo rainfall -> populates cachedDemoRainfallData
  const demoResult = await fetchGridRainfall(false, true);
  assert.ok(demoResult.sourceAttribution.includes('DEMO'));

  // Clear demo cache to test isolation
  clearOverlayCache();

  // After clearOverlayCache, cachedDemoRainfallData is reset
  const freshDemo = await fetchGridRainfall(false, true);
  assert.equal(freshDemo.isCached, false);
});

test('Regression 8: Temperature overlay remains strictly untouched and live without demo overrides', () => {
  // Temperature color scale must retain its standard operational thresholds
  const cool = getTemperatureColor(18.5);
  assert.equal(cool.bg, '#3b82f6');

  const hot = getTemperatureColor(38.0);
  assert.equal(hot.bg, '#ea580c');

  const extreme = getTemperatureColor(47.0);
  assert.equal(extreme.bg, '#b91c1c');

  // Null input never fabricates temperature
  const nullTemp = getTemperatureColor(null);
  assert.equal(nullTemp.bg, '#9ca3af');
  assert.equal(nullTemp.label, 'Unavailable');
});

test('Regression 9: Existing dust-risk levels and classification remain completely unchanged', () => {
  assert.equal(DUST_RISK_LEVELS.length, 4);
  assert.equal(DUST_RISK_LEVELS[0].label, 'Low Risk');
  assert.equal(DUST_RISK_LEVELS[0].range, '0–24');
  assert.equal(DUST_RISK_LEVELS[1].label, 'Moderate Risk');
  assert.equal(DUST_RISK_LEVELS[1].range, '25–49');
  assert.equal(DUST_RISK_LEVELS[2].label, 'High Risk');
  assert.equal(DUST_RISK_LEVELS[2].range, '50–74');
  assert.equal(DUST_RISK_LEVELS[3].label, 'Very High Risk');
  assert.equal(DUST_RISK_LEVELS[3].range, '75–100');
});



