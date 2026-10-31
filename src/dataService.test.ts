/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCurrentPrecipitation,
  extract12Hours,
  getCityApiUrls,
} from './dataService.ts';
import { CITIES } from './config.ts';
import { RawCityData, OpenMeteoWeatherResponse, OpenMeteoAirQualityResponse } from './types.ts';

function createMockWeatherResponse(overrides: Partial<OpenMeteoWeatherResponse> = {}): OpenMeteoWeatherResponse {
  const times: string[] = [];
  const rainArr: (number | null)[] = [];
  const showersArr: (number | null)[] = [];
  const precipArr: (number | null)[] = [];
  const probArr: (number | null)[] = [];

  for (let i = 0; i < 24; i++) {
    const hh = String(i).padStart(2, '0');
    times.push(`2026-10-29T${hh}:00`);
    rainArr.push(0);
    showersArr.push(0);
    precipArr.push(0);
    probArr.push(0);
  }

  const defaultWx: OpenMeteoWeatherResponse = {
    latitude: 25.2,
    longitude: 55.3,
    timezone: 'Asia/Dubai',
    current: {
      time: '2026-10-29T12:00',
      interval: 900,
      precipitation: 0,
      rain: 0,
      showers: 0,
      snowfall: 0,
    },
    current_units: {
      time: 'iso8601',
      interval: 'seconds',
      precipitation: 'mm',
      rain: 'mm',
      showers: 'mm',
      snowfall: 'cm',
    },
    hourly: {
      time: times,
      temperature_2m: new Array(24).fill(32),
      relative_humidity_2m: new Array(24).fill(45),
      wind_speed_10m: new Array(24).fill(15),
      wind_gusts_10m: new Array(24).fill(25),
      wind_direction_10m: new Array(24).fill(120),
      visibility: new Array(24).fill(10000),
      precipitation: precipArr,
      rain: rainArr,
      showers: showersArr,
      precipitation_probability: probArr,
    },
  };

  return {
    ...defaultWx,
    ...overrides,
    current: overrides.current !== undefined ? overrides.current : defaultWx.current,
    hourly: {
      ...defaultWx.hourly,
      ...(overrides.hourly || {}),
    },
  };
}

function createMockAirQualityResponse(): OpenMeteoAirQualityResponse {
  const times: string[] = [];
  for (let i = 0; i < 24; i++) {
    const hh = String(i).padStart(2, '0');
    times.push(`2026-10-29T${hh}:00`);
  }
  return {
    latitude: 25.2,
    longitude: 55.3,
    timezone: 'Asia/Dubai',
    hourly: {
      time: times,
      pm10: new Array(24).fill(40),
      pm2_5: new Array(24).fill(18),
      dust: new Array(24).fill(15),
    },
  };
}

function createMockRawCityData(weather: OpenMeteoWeatherResponse, fetchTimestamp: number = Date.now()): RawCityData {
  return {
    city: CITIES[0],
    weather,
    airQuality: createMockAirQualityResponse(),
    fetchTimestamp,
    isSampleOrSnapshot: false,
  };
}

test('1. Zero current rain and zero current precipitation', () => {
  const wx = createMockWeatherResponse({
    current: {
      time: new Date().toISOString().substring(0, 16),
      interval: 900,
      precipitation: 0.0,
      rain: 0.0,
      showers: 0.0,
      snowfall: 0,
    },
  });
  const rawCity = createMockRawCityData(wx);
  const result = extractCurrentPrecipitation(rawCity);

  assert.equal(result.precipitation, 0.0, 'Precipitation should be 0.0');
  assert.equal(result.rain, 0.0, 'Rain should be 0.0');
  assert.equal(result.showers, 0.0, 'Showers should be 0.0');
  assert.equal(result.intervalSeconds, 900, 'Interval should be 900 seconds');
  assert.equal(result.intervalMinutes, 15, 'Interval minutes should be 15');
  assert.equal(result.isAvailable, true, 'Telemetry should be marked available');
  assert.equal(result.isStale, false, 'Telemetry should not be stale');
});

test('2. Nonzero hourly precipitation with zero current rain (no false inference)', () => {
  const nowIso = new Date().toISOString().substring(0, 16);
  const wx = createMockWeatherResponse({
    current: {
      time: nowIso,
      interval: 900,
      precipitation: 0.0,
      rain: 0.0,
      showers: 0.0,
      snowfall: 0,
    },
  });

  // Hour index 4 has 8.5 mm precipitation forecast, 6.0 mm rain, 2.5 mm showers, 75% prob
  if (wx.hourly.precipitation) wx.hourly.precipitation[4] = 8.5;
  if (wx.hourly.rain) wx.hourly.rain[4] = 6.0;
  if (wx.hourly.showers) wx.hourly.showers[4] = 2.5;
  if (wx.hourly.precipitation_probability) wx.hourly.precipitation_probability[4] = 75;

  const rawCity = createMockRawCityData(wx);

  // Current precipitation remains strictly 0
  const currentResult = extractCurrentPrecipitation(rawCity);
  assert.equal(currentResult.precipitation, 0.0, 'Current precipitation must remain 0.0');
  assert.equal(currentResult.rain, 0.0, 'Current rain must remain 0.0');
  assert.equal(currentResult.showers, 0.0, 'Current showers must remain 0.0');

  // Hourly extraction at start hour "2026-10-29T02:00" includes hour index 4
  const hourly12 = extract12Hours(rawCity, '2026-10-29T02:00');
  assert.equal(hourly12.length, 12);
  // Index 2 in the 12-hour slice corresponds to raw hour 4
  const hour4 = hourly12[2];
  assert.equal(hour4.precipitation, 8.5, 'Hourly precipitation is 8.5 mm');
  assert.equal(hour4.rain, 6.0, 'Hourly rain is 6.0 mm');
  assert.equal(hour4.showers, 2.5, 'Hourly showers is 2.5 mm');
  assert.equal(hour4.precipitation_probability, 75, 'Hourly probability is 75%');
  // First hour in slice (hour 2) had 0.0
  assert.equal(hourly12[0].precipitation, 0.0);
  assert.equal(hourly12[0].rain, 0.0);
});

test('3. Missing or null precipitation fields (never substitute 0 for null)', () => {
  const wx = createMockWeatherResponse({
    current: {
      time: new Date().toISOString().substring(0, 16),
      interval: 900,
      precipitation: null as any,
      rain: null as any,
      showers: null as any,
      snowfall: 0,
    },
  });

  // In hourly data, let hour 3 have nulls
  if (wx.hourly.precipitation) wx.hourly.precipitation[3] = null as any;
  if (wx.hourly.rain) wx.hourly.rain[3] = null as any;
  if (wx.hourly.showers) wx.hourly.showers[3] = null as any;
  if (wx.hourly.precipitation_probability) wx.hourly.precipitation_probability[3] = null as any;

  const rawCity = createMockRawCityData(wx);

  // Current readings must remain null, NOT substituted with 0
  const currentResult = extractCurrentPrecipitation(rawCity);
  assert.equal(currentResult.precipitation, null, 'Null current precipitation must stay null');
  assert.equal(currentResult.rain, null, 'Null current rain must stay null');
  assert.equal(currentResult.showers, null, 'Null current showers must stay null');
  assert.equal(currentResult.isAvailable, false, 'Should be flagged as unavailable when all null');

  // Hourly readings must remain null
  const hourly12 = extract12Hours(rawCity, '2026-10-29T03:00');
  const targetHour = hourly12[0];
  assert.equal(targetHour.precipitation, null, 'Hourly precipitation must stay null');
  assert.equal(targetHour.rain, null, 'Hourly rain must stay null');
  assert.equal(targetHour.showers, null, 'Hourly showers must stay null');
  assert.equal(targetHour.precipitation_probability, null, 'Hourly probability must stay null');
});

test('4. Correct mapping and non-conflation of rain, showers, total precipitation and probability', () => {
  const wx = createMockWeatherResponse();
  // Set explicit distinct values:
  // precipitation = 5.2 mm (total)
  // rain = 3.2 mm (stratiform rain)
  // showers = 2.0 mm (convective showers)
  // precipitation_probability = 85%
  if (wx.hourly.precipitation) wx.hourly.precipitation[10] = 5.2;
  if (wx.hourly.rain) wx.hourly.rain[10] = 3.2;
  if (wx.hourly.showers) wx.hourly.showers[10] = 2.0;
  if (wx.hourly.precipitation_probability) wx.hourly.precipitation_probability[10] = 85;

  const rawCity = createMockRawCityData(wx);
  const hourly12 = extract12Hours(rawCity, '2026-10-29T10:00');
  const h10 = hourly12[0];

  assert.equal(h10.precipitation, 5.2, 'Total precipitation is 5.2 mm');
  assert.equal(h10.rain, 3.2, 'Rain component is 3.2 mm');
  assert.equal(h10.showers, 2.0, 'Showers component is 2.0 mm');
  assert.equal(h10.precipitation_probability, 85, 'Precipitation probability is 85%');

  // Ensure rain is NOT conflated with precipitation: rain !== precipitation
  assert.notEqual(h10.rain, h10.precipitation, 'Rain component must not equal total precipitation');
  // Total precipitation equals rain + showers
  assert.equal(h10.precipitation, Number((h10.rain! + h10.showers!).toFixed(1)));
});

test('5. Correct selected-city coordinates and timestamp alignment', () => {
  // Test all 10 UAE cities
  for (const city of CITIES) {
    const urls = getCityApiUrls(city);

    // Weather forecast URL checks
    assert.ok(urls.weatherUrl.includes(`latitude=${city.latitude}`), `Must include ${city.name} latitude`);
    assert.ok(urls.weatherUrl.includes(`longitude=${city.longitude}`), `Must include ${city.name} longitude`);
    assert.ok(urls.weatherUrl.includes('timezone=Asia%2FDubai'), 'Must specify Asia/Dubai timezone');
    assert.ok(urls.weatherUrl.includes('current=rain,precipitation,showers'), 'Must request current rain,precipitation,showers');
    assert.ok(urls.weatherUrl.includes('precipitation,rain,showers,precipitation_probability'), 'Must request hourly rain variables');

    // Air quality URL checks
    assert.ok(urls.airQualityUrl.includes(`latitude=${city.latitude}`), `Must include ${city.name} latitude for CAMS`);
    assert.ok(urls.airQualityUrl.includes(`longitude=${city.longitude}`), `Must include ${city.name} longitude for CAMS`);
  }

  // Timestamp alignment test in extract12Hours
  const wx = createMockWeatherResponse();
  const rawCity = createMockRawCityData(wx);

  // Extract starting from hour 15
  const hourlyFrom15 = extract12Hours(rawCity, '2026-10-29T15:00');
  assert.equal(hourlyFrom15.length, 12);
  assert.equal(hourlyFrom15[0].time, '2026-10-29T15:00');
  assert.equal(hourlyFrom15[8].time, '2026-10-29T23:00');
});

test('6. API errors and stale data handling (>2h)', () => {
  // Scenario A: rawCity is null or empty
  const emptyResult = extractCurrentPrecipitation(null as any);
  assert.equal(emptyResult.isAvailable, false);
  assert.equal(emptyResult.precipitation, null);

  // Scenario B: rawCity has weather but current is missing
  const wxNoCurrent: any = {
    latitude: 25.2,
    longitude: 55.3,
    timezone: 'Asia/Dubai',
    hourly: createMockWeatherResponse().hourly,
  };
  const resultNoCurrent = extractCurrentPrecipitation({
    city: CITIES[0],
    weather: wxNoCurrent,
    airQuality: createMockAirQualityResponse(),
    fetchTimestamp: Date.now(),
    isSampleOrSnapshot: false,
  });
  assert.equal(resultNoCurrent.isAvailable, false);
  assert.equal(resultNoCurrent.precipitation, null);

  // Scenario C: Data is stale (>2 hours old)
  const threeHoursAgoMs = Date.now() - 3 * 3600 * 1000;
  const staleCity: RawCityData = {
    city: CITIES[0],
    weather: createMockWeatherResponse({
      current: {
        time: new Date(threeHoursAgoMs).toISOString().substring(0, 16),
        interval: 900,
        precipitation: 1.2,
        rain: 1.0,
        showers: 0.2,
        snowfall: 0,
      },
    }),
    airQuality: createMockAirQualityResponse(),
    fetchTimestamp: threeHoursAgoMs,
    isSampleOrSnapshot: false,
  };

  const staleResult = extractCurrentPrecipitation(staleCity);
  assert.equal(staleResult.isStale, true, 'Data older than 2 hours must be marked isStale: true');
  assert.equal(staleResult.precipitation, 1.2);
});
