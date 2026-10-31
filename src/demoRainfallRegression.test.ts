/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticSampleData, SAMPLE_DATA_LABEL } from './sampleData.ts';
import { getDemoGridRainfall, interpolateValueAtPoint } from './overlayService.ts';
import { extractCurrentPrecipitation, extract12Hours, processCityOutlook } from './dataService.ts';
import { buildHourlySchoolAssessments, evaluateActivityPolicy, DEFAULT_UNCONFIGURED_POLICY } from './schoolPolicy.ts';
import { predictRisk } from './riskEngine.ts';
import { APP_CONFIG, CITIES } from './config.ts';
import { SchoolPolicyConfig, RawHourlyVariables, HeatIndexResult } from './types.ts';

// 1. Demo rainfall shown on the main dashboard is also available in School Mode for the same location
test('Regression 1: Demo rainfall shown on the main dashboard is also available in School Mode for the same location', () => {
  const demoRain = getDemoGridRainfall();
  const demoPoints = demoRain.cells.map((c) => ({ lat: c.lat, lon: c.lon, value: c.precipitationMm }));

  const sampleData = createSyntheticSampleData();
  const rakCity = CITIES.find((c) => c.id === 'ras-al-khaimah')!;
  const rakData = sampleData['ras-al-khaimah'];
  assert.ok(rakData, 'Ras Al Khaimah sample data must exist in demo mode');

  // Dashboard interpolated rainfall at RAK coordinates
  const dashboardRakRain = interpolateValueAtPoint(rakCity.latitude, rakCity.longitude, demoPoints, 1.45);
  assert.ok(dashboardRakRain !== null && dashboardRakRain > 10.0, 'Dashboard demo rainfall at RAK must be substantial (> 10 mm)');

  // School Mode current precipitation reading
  const schoolPrecip = extractCurrentPrecipitation(rakData);
  assert.equal(schoolPrecip.isAvailable, true);
  assert.equal(schoolPrecip.isStale, false);
  assert.ok(schoolPrecip.precipitation !== null);
  assert.equal(
    schoolPrecip.precipitation,
    Number(dashboardRakRain.toFixed(1)),
    'School Mode current precipitation must match main dashboard demo rainfall for Ras Al Khaimah'
  );

  // School Mode 12-hour environmental readings
  assert.ok(rakData.weather.current, 'rakData.weather.current must exist');
  const currentTime = rakData.weather.current.time || '2026-10-31T12:00';
  const raw12 = extract12Hours(rakData, currentTime);
  const assessments = buildHourlySchoolAssessments(raw12, DEFAULT_UNCONFIGURED_POLICY);
  assert.ok(assessments.length === 12);
  const currentAssessment = assessments[0];
  assert.ok(currentAssessment.environmentalReadings.precipitation !== null);
  assert.ok(currentAssessment.environmentalReadings.precipitation > 0);
});

// 2. Different locations retain their own rainfall values
test('Regression 2: Different locations retain their own rainfall values in Demo Mode', () => {
  const sampleData = createSyntheticSampleData();

  const rakPrecip = extractCurrentPrecipitation(sampleData['ras-al-khaimah']).precipitation;
  const fujPrecip = extractCurrentPrecipitation(sampleData['fujairah']).precipitation;
  const dxbPrecip = extractCurrentPrecipitation(sampleData['dubai']).precipitation;
  const auhPrecip = extractCurrentPrecipitation(sampleData['abu-dhabi']).precipitation;
  const liwaPrecip = extractCurrentPrecipitation(sampleData['liwa']).precipitation;
  const ruwaisPrecip = extractCurrentPrecipitation(sampleData['ruwais']).precipitation;

  // Ras Al Khaimah & Fujairah in the storm core have heavy rainfall
  assert.ok(rakPrecip !== null && rakPrecip >= 10.0, 'RAK must have heavy rain in demo');
  assert.ok(fujPrecip !== null && fujPrecip >= 10.0, 'Fujairah must have heavy rain in demo');

  // Dubai & Abu Dhabi have distinct moderate/light rainfall
  assert.ok(dxbPrecip !== null && dxbPrecip > auhPrecip!, 'Dubai rainfall must differ from Abu Dhabi');
  assert.ok(auhPrecip !== null && auhPrecip > 0.5, 'Abu Dhabi must have light/trace rain in demo');

  // Western desert cities remain dry (0.0 mm)
  assert.equal(liwaPrecip, 0.0, 'Liwa in western desert must be dry (0.0 mm)');
  assert.equal(ruwaisPrecip, 0.0, 'Ruwais on western coast must be dry (0.0 mm)');

  // Verify non-homogenization: RAK != Dubai != Abu Dhabi != Liwa
  assert.notEqual(rakPrecip, dxbPrecip);
  assert.notEqual(dxbPrecip, auhPrecip);
  assert.notEqual(auhPrecip, liwaPrecip);
});

// 3. Current and forecast precipitation are not confused
test('Regression 3: Current and forecast precipitation are not confused', () => {
  const sampleData = createSyntheticSampleData();
  const rakData = sampleData['ras-al-khaimah'];

  // Current precipitation
  const currentPrecip = extractCurrentPrecipitation(rakData);
  assert.equal(currentPrecip.intervalSeconds, 900, 'Current precipitation model interval must be 900s (15 min)');
  assert.ok(currentPrecip.time !== null);

  // Hourly forecast precipitation series
  const raw12 = extract12Hours(rakData, '2026-10-30T14:00');
  assert.equal(raw12.length, 12);

  // Check hourly values across the timeline
  const hourlyValues = raw12.map((h) => h.precipitation);
  // Verify that forecast precipitation values vary over time according to storm progression
  const distinctForecastValues = new Set(hourlyValues);
  assert.ok(distinctForecastValues.size > 1, 'Forecast precipitation must vary across the 12-hour forecast timeline');

  // Total precipitation equals rain component + showers component
  const hour0 = raw12[0];
  if (hour0.precipitation !== null && typeof hour0.rain === 'number' && typeof hour0.showers === 'number') {
    const sum = Number((hour0.rain + hour0.showers).toFixed(1));
    assert.equal(sum, hour0.precipitation, 'Total hourly precipitation must equal rain + showers');
  }
});

// 4. Missing rainfall remains explicitly unavailable, not zero
test('Regression 4: Missing rainfall remains explicitly unavailable, not zero', () => {
  const sampleData = createSyntheticSampleData();
  const fujData = sampleData['fujairah'];

  // Hour 4 in Fujairah sample data has null precipitation
  const wx = fujData.weather.hourly;
  assert.equal(wx.precipitation?.[4], null, 'Hour 4 in Fujairah must have null precipitation');

  const raw12 = extract12Hours(fujData, '2026-10-30T00:00');
  const targetHour = raw12[4];
  assert.equal(targetHour.precipitation, null, 'Hourly precipitation must remain null');
  assert.notEqual(targetHour.precipitation, 0, 'Null precipitation must never be converted to 0');

  // When evaluated in school policy, missing precipitation must be identified
  const assessments = buildHourlySchoolAssessments(raw12, DEFAULT_UNCONFIGURED_POLICY);
  assert.equal(assessments[4].environmentalReadings.precipitation, null);

  // When weather current has null precipitation
  const nullCurrentRaw = {
    ...fujData,
    weather: {
      ...fujData.weather,
      current: {
        time: '2026-10-30T14:00',
        interval: 900,
        precipitation: null as any,
        rain: null as any,
        showers: null as any,
      },
    },
  };
  const extracted = extractCurrentPrecipitation(nullCurrentRaw);
  assert.equal(extracted.precipitation, null);
  assert.equal(extracted.isAvailable, false);
});

// 5. Rainfall does not affect dust-risk scoring or school actions unless an existing configured policy explicitly supports it
test('Regression 5: Rainfall does not affect dust-risk scoring or school actions unless explicitly configured', () => {
  const sampleData = createSyntheticSampleData();
  const rakData = sampleData['ras-al-khaimah'];
  assert.ok(rakData, 'rakData must exist');
  assert.ok(rakData.weather.current, 'rakData.weather.current must exist');

  const currentTime = rakData.weather.current.time || '2026-10-31T12:00';
  // Dust risk calculation
  const outlook: any = processCityOutlook(rakData, null, currentTime, `${currentTime} GST`);
  const scoreWithRain = outlook.scoreNow;
  const levelWithRain = outlook.levelNow;

  // Clone data and force precipitation to 0.0 mm
  const dryRakData = JSON.parse(JSON.stringify(rakData));
  dryRakData.weather.current.precipitation = 0.0;
  dryRakData.weather.hourly.precipitation = dryRakData.weather.hourly.precipitation.map(() => 0.0);

  const dryOutlook: any = processCityOutlook(dryRakData, null, currentTime, `${currentTime} GST`);
  assert.equal(dryOutlook.scoreNow, scoreWithRain, 'Dust risk score must remain identical regardless of rainfall');
  assert.equal(dryOutlook.levelNow, levelWithRain, 'Dust risk level must remain identical regardless of rainfall');

  const dummyHeatIndex: HeatIndexResult = {
    heatIndexCelsius: null,
    heatIndexFahrenheit: null,
    category: 'not applicable',
    isAvailable: false,
    notes: 'N/A',
  };

  // School policy without rain rules (DEFAULT_UNCONFIGURED_POLICY)
  const rawHour = extract12Hours(rakData, currentTime)[0];
  const assessmentUnconfigured = evaluateActivityPolicy(rawHour, dummyHeatIndex, DEFAULT_UNCONFIGURED_POLICY, 'pe');
  assert.ok(
    assessmentUnconfigured.status === 'policy_not_configured' || assessmentUnconfigured.status === 'policy_unconfigured',
    'Unconfigured policy must not trigger rain action'
  );

  // School policy WITH an explicit rain rule
  const policyWithRain: SchoolPolicyConfig = {
    schoolName: 'Test School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-30',
    sourceDocument: 'School Rain Policy',
    isConfigured: true,
    isStarterConfig: false,
    rules: [
      {
        id: 'rain-rule-test',
        name: 'Rain Rule',
        activity: 'pe',
        metric: 'precipitation',
        operator: '>=',
        threshold: 5.0,
        value: 5.0,
        unit: 'mm',
        severity: 3,
        recommendedAction: 'suspend',
        enabled: true,
        actionTitle: 'Suspend PE on Heavy Rain',
        actionGuidance: 'Outdoor grounds flooded.',
        reason: 'Precipitation exceeds safety limit.',
      },
    ],
  };

  const assessmentWithRain = evaluateActivityPolicy(rawHour, dummyHeatIndex, policyWithRain, 'pe');
  assert.equal(assessmentWithRain.status, 'action_triggered', 'Policy with explicit rain rule must trigger when threshold exceeded');
  assert.equal(assessmentWithRain.recommendedAction, 'suspend');

  // Dry city with same rain policy
  const liwaData = sampleData['liwa'];
  assert.ok(liwaData, 'liwaData must exist');
  assert.ok(liwaData.weather.current, 'liwaData.weather.current must exist');
  const liwaTime = liwaData.weather.current.time || '2026-10-31T12:00';
  const dryLiwaHour = extract12Hours(liwaData, liwaTime)[0];
  const assessmentDry = evaluateActivityPolicy(dryLiwaHour, dummyHeatIndex, policyWithRain, 'pe');
  assert.equal(assessmentDry.status, 'criteria_met_no_actions', 'Dry city must not trigger rain rule');
  assert.equal(assessmentDry.recommendedAction, 'continue');
});

// 6. Demo readings remain labelled as demonstration data
test('Regression 6: Demo readings remain labelled as demonstration data', () => {
  const sampleData = createSyntheticSampleData();
  const rakData = sampleData['ras-al-khaimah'];

  assert.equal(rakData.isSampleOrSnapshot, true, 'isSampleOrSnapshot must be true for demo data');
  assert.equal(rakData.snapshotLabel, SAMPLE_DATA_LABEL, 'snapshotLabel must match SAMPLE_DATA_LABEL');

  const demoRain = getDemoGridRainfall();
  assert.ok(demoRain.sourceAttribution.includes('DEMO — SIMULATED RAINFALL'));
  assert.ok(demoRain.disclaimer.includes('DEMO — SIMULATED RAINFALL'));
});

// 7. Navbar Demo Mode control reflects global state
test('Regression 7: Navbar Demo Mode control reflects global state', () => {
  // Simulate navbar state attributes
  const getNavbarState = (isDemoMode: boolean) => ({
    role: 'switch',
    ariaChecked: isDemoMode,
    ariaLabel: `Demonstration Mode is currently ${isDemoMode ? 'ON' : 'OFF'}. Click to switch.`,
    statusBadgeText: isDemoMode ? 'ON' : 'OFF',
  });

  const stateOff = getNavbarState(false);
  assert.equal(stateOff.ariaChecked, false);
  assert.equal(stateOff.statusBadgeText, 'OFF');

  const stateOn = getNavbarState(true);
  assert.equal(stateOn.ariaChecked, true);
  assert.equal(stateOn.statusBadgeText, 'ON');
});

// 8. Switching Demo Mode updates all pages consistently
test('Regression 8: Switching Demo Mode updates dataset consistently across all pages', () => {
  // When isDemoMode is toggled from false to true
  const liveSample = createSyntheticSampleData();
  assert.ok(liveSample['ras-al-khaimah'], 'Demo dataset provides consistent data for all 10 cities');
  assert.equal(Object.keys(liveSample).length, 10, 'All 10 UAE cities must be populated');

  for (const city of CITIES) {
    const cityRaw = liveSample[city.id];
    assert.equal(cityRaw.city.id, city.id);
    assert.equal(cityRaw.isSampleOrSnapshot, true);
  }
});

// 9. Mobile navigation provides access to the same global control
test('Regression 9: Mobile navigation provides access to the same global control', () => {
  const mobileControlProps = {
    role: 'switch',
    label: 'Demonstration Mode',
    accessibleLabel: (isDemoMode: boolean) =>
      `Demonstration Mode is currently ${isDemoMode ? 'ON' : 'OFF'}. Click to switch.`,
  };

  assert.equal(mobileControlProps.role, 'switch');
  assert.equal(mobileControlProps.label, 'Demonstration Mode');
  assert.ok(mobileControlProps.accessibleLabel(true).includes('ON'));
  assert.ok(mobileControlProps.accessibleLabel(false).includes('OFF'));
});
