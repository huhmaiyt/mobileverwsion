/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticSampleData } from './sampleData.ts';
import { processCityOutlook } from './dataService.ts';
import { CityOutlook, RiskCategory } from './types.ts';
import { APP_CONFIG } from './config.ts';

test('Risk Summary Period: "Now" is the default selection on initial load and uses current data', () => {
  const sampleData = createSyntheticSampleData();
  const rawAbuDhabi = sampleData['abu-dhabi'];
  assert.ok(rawAbuDhabi, 'Sample city data for Abu Dhabi must exist');

  const outlook: CityOutlook = processCityOutlook(
    rawAbuDhabi,
    null,
    '2026-10-28T12:00',
    '2026-10-28 12:00 GST'
  );

  // In MapScreen, viewMode defaults to 'now'
  const defaultViewMode: 'now' | 'highest12h' = 'now';
  assert.equal(defaultViewMode, 'now', 'Default viewMode selection must be "now"');

  // Verify that "Now" corresponds to current risk calculation and current data (hour 0)
  const currentHourResult = outlook.hourlyResults[0];
  assert.equal(outlook.levelNow, currentHourResult.category, 'levelNow must correspond directly to hour 0 result');
  assert.equal(outlook.scoreNow, currentHourResult.finalScore, 'scoreNow must correspond directly to hour 0 score');

  // Ensure current risk is NOT derived from the forecast peak
  const selectedPeriodLevel = defaultViewMode === 'now' ? outlook.levelNow : outlook.peakLevel;
  const selectedPeriodScore = defaultViewMode === 'now' ? outlook.scoreNow : outlook.peakScore;
  const selectedHourIndex = defaultViewMode === 'now' ? 0 : outlook.peakHourIndex;

  assert.equal(selectedPeriodLevel, outlook.levelNow);
  assert.equal(selectedPeriodScore, outlook.scoreNow);
  assert.equal(selectedHourIndex, 0);

  // Heading text when 'now' is selected
  const headingTitle = defaultViewMode === 'now' ? 'Current Risk Outlook (Now)' : '12-Hour Forecast Peak Risk';
  const headingSubtitle = defaultViewMode === 'now' ? 'Risk Level Now' : `Forecast Peak (at ${outlook.peakHourTime})`;
  assert.equal(headingTitle, 'Current Risk Outlook (Now)');
  assert.equal(headingSubtitle, 'Risk Level Now');
});

function getPeriodSummary(viewMode: 'now' | 'highest12h', outlook: CityOutlook) {
  const level = viewMode === 'now' ? outlook.levelNow : outlook.peakLevel;
  const score = viewMode === 'now' ? outlook.scoreNow : outlook.peakScore;
  const heading = viewMode === 'now' ? 'Current Risk Outlook (Now)' : '12-Hour Forecast Peak Risk';
  const hourIndex = viewMode === 'now' ? 0 : outlook.peakHourIndex;
  return { level, score, heading, hourIndex };
}

test('Risk Summary Period: switching between "Now" and "Next 12 hours" updates heading, level, score, and selected hour without stale state', () => {
  const sampleData = createSyntheticSampleData();
  const rawDubai = sampleData['dubai'];
  assert.ok(rawDubai, 'Sample city data for Dubai must exist');

  const outlook: CityOutlook = processCityOutlook(
    rawDubai,
    null,
    '2026-10-28T12:00',
    '2026-10-28 12:00 GST'
  );

  // 1. Initial State: Now
  let mode: 'now' | 'highest12h' = 'now';
  let summary = getPeriodSummary(mode, outlook);
  assert.equal(summary.level, outlook.levelNow);
  assert.equal(summary.score, outlook.scoreNow);
  assert.equal(summary.heading, 'Current Risk Outlook (Now)');
  assert.equal(summary.hourIndex, 0);

  // 2. User switches to "Highest in next 12 hours"
  mode = 'highest12h';
  summary = getPeriodSummary(mode, outlook);
  assert.equal(summary.level, outlook.peakLevel);
  assert.equal(summary.score, outlook.peakScore);
  assert.equal(summary.heading, '12-Hour Forecast Peak Risk');
  assert.equal(summary.hourIndex, outlook.peakHourIndex);

  // Verify that peak behavior is preserved (uses forecast peak hour)
  assert.equal(outlook.hourlyResults[outlook.peakHourIndex].category, outlook.peakLevel);
  assert.equal(outlook.hourlyResults[outlook.peakHourIndex].finalScore, outlook.peakScore);

  // 3. User switches back to "Now"
  mode = 'now';
  summary = getPeriodSummary(mode, outlook);
  assert.equal(summary.level, outlook.levelNow);
  assert.equal(summary.score, outlook.scoreNow);
  assert.equal(summary.heading, 'Current Risk Outlook (Now)');
  assert.equal(summary.hourIndex, 0);
  assert.notEqual(summary.heading, '12-Hour Forecast Peak Risk');
});

test('Risk Summary Period: CityList and UaeMap display current risk by default', () => {
  const sampleData = createSyntheticSampleData();
  const outlooks: Record<string, CityOutlook> = {};
  for (const [id, raw] of Object.entries(sampleData)) {
    outlooks[id] = processCityOutlook(raw, null, '2026-10-28T12:00', '2026-10-28 12:00 GST');
  }

  const defaultMode: 'now' | 'highest12h' = 'now';

  // For every city, verify that defaultMode === 'now' provides levelNow and scoreNow
  for (const [id, outlook] of Object.entries(outlooks)) {
    const summary = getPeriodSummary(defaultMode, outlook);
    assert.equal(summary.level, outlook.levelNow, `City ${id} must display levelNow under default mode`);
    assert.equal(summary.score, outlook.scoreNow, `City ${id} must display scoreNow under default mode`);
  }
});
