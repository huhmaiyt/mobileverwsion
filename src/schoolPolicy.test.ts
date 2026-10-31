/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHeatIndex,
  DEFAULT_UNCONFIGURED_POLICY,
  STARTER_CONFIGURATION_POLICY,
  FICTIONAL_DEMO_POLICY,
  SAMPLE_APPROVED_SCHOOL_POLICY,
  buildHourlySchoolAssessments,
  evaluateActivityPolicy,
  isFiniteNumber,
  resolvePrecedence,
  validateSchoolPolicy,
  canonicalAction,
  getMetricValue,
} from './schoolPolicy.ts';
import { RawHourlyVariables, SchoolPolicyConfig } from './types.ts';
import { getSchoolModeAdvice } from './geminiService.ts';
import { calculateHourlyBaseline } from './riskEngine.ts';

test('Heat Index: calculates correct values under moderate and extreme conditions', () => {
  // 1. Moderate heat: 30°C and 50% RH -> ~31°C (Caution)
  const hiModerate = calculateHeatIndex(30, 50);
  assert.equal(hiModerate.isAvailable, true);
  assert.ok(hiModerate.heatIndexCelsius! >= 30 && hiModerate.heatIndexCelsius! <= 33);
  assert.equal(hiModerate.category, 'Caution');

  // 2. High heat: 36°C and 45% RH -> Danger (41 - 54°C)
  const hiDanger = calculateHeatIndex(36, 45);
  assert.equal(hiDanger.isAvailable, true);
  assert.ok(hiDanger.heatIndexCelsius! >= 41 && hiDanger.heatIndexCelsius! < 54);
  assert.equal(hiDanger.category, 'Danger');

  // 3. Cool condition: 18°C (< 20°C / 68°F threshold) -> not applicable
  const hiCool = calculateHeatIndex(18, 55);
  assert.equal(hiCool.isAvailable, false);
  assert.equal(hiCool.heatIndexCelsius, null);
  assert.equal(hiCool.category, 'not applicable');

  // 4. Mild condition: 23°C and 40% RH -> Below Caution range
  const hiMild = calculateHeatIndex(23, 40);
  assert.equal(hiMild.isAvailable, true);
  assert.equal(hiMild.category, 'Below Caution range');
});

test('Heat Index: missing and non-finite inputs return not applicable and never substitute zero', () => {
  const missingTemp = calculateHeatIndex(null, 50);
  assert.equal(missingTemp.isAvailable, false);
  assert.equal(missingTemp.heatIndexCelsius, null);
  assert.equal(missingTemp.category, 'not applicable');
  assert.ok(missingTemp.notes.includes('Assessment unavailable'));

  const nanTemp = calculateHeatIndex(NaN, 50);
  assert.equal(nanTemp.isAvailable, false);
  assert.equal(nanTemp.heatIndexCelsius, null);

  const infTemp = calculateHeatIndex(Infinity, 50);
  assert.equal(infTemp.isAvailable, false);
  assert.equal(infTemp.heatIndexCelsius, null);

  const negInfHumidity = calculateHeatIndex(35, -Infinity);
  assert.equal(negInfHumidity.isAvailable, false);
  assert.equal(negInfHumidity.heatIndexCelsius, null);

  const undefinedHumidity = calculateHeatIndex(35, undefined);
  assert.equal(undefinedHumidity.isAvailable, false);
  assert.equal(undefinedHumidity.heatIndexCelsius, null);
});

test('School Policy: unconfigured policy reports distinct policy_unconfigured status', () => {
  const sampleRaw: RawHourlyVariables = {
    time: '2026-10-21T10:00',
    temperature_2m: 32,
    relative_humidity_2m: 40,
    pm10: 100,
    pm2_5: 30,
    dust: 50,
    wind_speed_10m: 15,
    wind_gusts_10m: 25,
    wind_direction_10m: 300,
    visibility: 9000,
    aerosol_optical_depth: 0.3,
  };

  const hi = calculateHeatIndex(sampleRaw.temperature_2m, sampleRaw.relative_humidity_2m);
  const result = evaluateActivityPolicy(sampleRaw, hi, DEFAULT_UNCONFIGURED_POLICY, 'break');

  assert.ok(result.status === 'policy_not_configured' || result.status === 'policy_unconfigured');
  assert.equal(result.actionTitle, 'School policy configuration required');
  assert.ok(result.primaryGuidance.includes('Review the applicable school policy'));
  assert.equal(result.triggeredRules.length, 0);
  assert.equal(result.isIncomplete, false);
});

test('School Policy: zero applicable rules configured for an activity never reports criteria met', () => {
  // Configured policy with ONLY PE rules, evaluating 'break'
  const peOnlyPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    schoolName: 'PE Only Academy',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'pe-heat-only',
        name: 'PE Heat Rule',
        activity: 'pe',
        metric: 'temperature',
        operator: '>=',
        threshold: 38,
        unit: '°C',
        recommendedAction: 'indoor_only',
        actionTitle: 'Move PE indoors',
        actionGuidance: 'Outdoor PE suspended.',
        reason: 'High temperature.',
        severity: 2,
      },
    ],
    precedenceOrder: ['suspend', 'indoor_only', 'modified', 'normal'],
  };

  const cleanRaw: RawHourlyVariables = {
    time: '2026-10-21T10:00',
    temperature_2m: 28,
    relative_humidity_2m: 40,
    pm10: 30,
    pm2_5: 10,
    dust: 20,
    wind_speed_10m: 10,
    wind_gusts_10m: 15,
    wind_direction_10m: 300,
    visibility: 10000,
    aerosol_optical_depth: 0.1,
  };

  const hi = calculateHeatIndex(cleanRaw.temperature_2m, cleanRaw.relative_humidity_2m);
  const breakResult = evaluateActivityPolicy(cleanRaw, hi, peOnlyPolicy, 'break');

  // Must report distinct 'no_applicable_rules' state
  assert.equal(breakResult.status, 'no_applicable_rules');
  assert.equal(breakResult.actionTitle, 'No applicable rules configured for this activity');
  assert.ok(breakResult.primaryGuidance.includes('No approved policy rules are defined for this activity'));
  assert.notEqual(breakResult.actionTitle, 'Conditions meet the configured criteria for this activity');
  assert.equal(breakResult.totalApplicableRulesCount, 0);
  assert.equal(breakResult.evaluatedRulesCount, 0);
});

test('School Policy: distinguishes all 5 outcomes clearly', () => {
  const cleanRaw: RawHourlyVariables = {
    time: '2026-10-21T10:00',
    temperature_2m: 28,
    relative_humidity_2m: 40,
    pm10: 30,
    pm2_5: 10,
    dust: 20,
    wind_speed_10m: 10,
    wind_gusts_10m: 15,
    wind_direction_10m: 300,
    visibility: 10000,
    aerosol_optical_depth: 0.1,
    precipitation: 0,
    rain: 0,
    rain_rate: 0,
    precipitation_rate: 0,
  };
  const hiClean = calculateHeatIndex(cleanRaw.temperature_2m, cleanRaw.relative_humidity_2m);

  // 1. policy_unconfigured / policy_not_configured
  const resUnconfigured = evaluateActivityPolicy(cleanRaw, hiClean, DEFAULT_UNCONFIGURED_POLICY, 'break');
  assert.ok(resUnconfigured.status === 'policy_not_configured' || resUnconfigured.status === 'policy_unconfigured');

  // 2. no_applicable_rules
  const lunchPolicy: SchoolPolicyConfig = {
    ...FICTIONAL_DEMO_POLICY,
    rules: FICTIONAL_DEMO_POLICY.rules.filter((r) => r.activity === 'break'),
  };
  const resNoRules = evaluateActivityPolicy(cleanRaw, hiClean, lunchPolicy, 'lunch_other');
  assert.equal(resNoRules.status, 'no_applicable_rules');

  // 3. assessment_unavailable (missing readings when no rules trigger)
  const missingRaw: RawHourlyVariables = {
    ...cleanRaw,
    pm10: null, // PM10 rule cannot be evaluated
    dust: null,
  };
  const hiMissing = calculateHeatIndex(missingRaw.temperature_2m, missingRaw.relative_humidity_2m);
  const resMissing = evaluateActivityPolicy(missingRaw, hiMissing, FICTIONAL_DEMO_POLICY, 'break');
  assert.ok(resMissing.status === 'not_evaluated' || resMissing.status === 'assessment_unavailable');
  assert.equal(resMissing.isIncomplete, true);
  assert.equal(resMissing.dataMissingForAssessment, true);

  // 4. criteria_met_no_actions:
  // Operational approved policy returns operational "Conditions meet the configured criteria"
  const resApproved = evaluateActivityPolicy(cleanRaw, hiClean, SAMPLE_APPROVED_SCHOOL_POLICY, 'break');
  assert.equal(resApproved.status, 'criteria_met_no_actions');
  assert.equal(resApproved.actionTitle, 'Conditions meet the configured criteria for this activity');
  assert.equal(resApproved.isIncomplete, false);

  // Fictional demonstration policy returns non-operational demonstration title
  const resDemo = evaluateActivityPolicy(cleanRaw, hiClean, FICTIONAL_DEMO_POLICY, 'break');
  assert.equal(resDemo.status, 'criteria_met_no_actions');
  assert.equal(resDemo.actionTitle, 'Demonstration Result — Not Operational');
  assert.ok(resDemo.primaryGuidance.includes('not an operational safety determination'));
  assert.equal(resDemo.isIncomplete, false);

  // 5. action_triggered (one or more rules triggered)
  const hazardRaw: RawHourlyVariables = {
    ...cleanRaw,
    pm10: 350, // triggers indoor_only
  };
  const hiHazard = calculateHeatIndex(hazardRaw.temperature_2m, hazardRaw.relative_humidity_2m);
  const resTriggered = evaluateActivityPolicy(hazardRaw, hiHazard, FICTIONAL_DEMO_POLICY, 'break');
  assert.equal(resTriggered.status, 'action_triggered');
  assert.ok(resTriggered.recommendedAction === 'relocate' || resTriggered.recommendedAction === 'indoor_only');
  assert.equal(resTriggered.isIncomplete, false);
});

test('School Policy: partial evaluation preserves triggered action and marks assessment incomplete', () => {
  // Condition: PM10 is 300 µg/m³ (triggers indoor_only), but temperature is NaN (so heat index cannot be evaluated)
  const partialRaw: RawHourlyVariables = {
    time: '2026-10-21T12:00',
    temperature_2m: NaN, // Invalid reading!
    relative_humidity_2m: 50,
    pm10: 300, // triggers indoor_only
    pm2_5: 90,
    dust: 180,
    wind_speed_10m: 20,
    wind_gusts_10m: 30,
    wind_direction_10m: 320,
    visibility: 4000,
    aerosol_optical_depth: 0.8,
  };

  const hi = calculateHeatIndex(partialRaw.temperature_2m, partialRaw.relative_humidity_2m);
  const peRes = evaluateActivityPolicy(partialRaw, hi, FICTIONAL_DEMO_POLICY, 'pe');

  // Triggered action is preserved
  assert.equal(peRes.status, 'action_triggered');
  assert.ok(peRes.recommendedAction === 'relocate' || peRes.recommendedAction === 'indoor_only');
  // Incomplete flag must be explicitly true
  assert.equal(peRes.isIncomplete, true);
  assert.equal(peRes.dataMissingForAssessment, true);
  assert.ok(peRes.primaryGuidance.includes('partial'));
  assert.ok(peRes.reason.includes('incomplete'));
});

test('School Policy: non-finite readings (NaN, Infinity, -Infinity) are treated as unavailable', () => {
  assert.equal(isFiniteNumber(null), false);
  assert.equal(isFiniteNumber(undefined), false);
  assert.equal(isFiniteNumber(NaN), false);
  assert.equal(isFiniteNumber(Infinity), false);
  assert.equal(isFiniteNumber(-Infinity), false);
  assert.equal(isFiniteNumber('100'), false);
  assert.equal(isFiniteNumber(100), true);
  assert.equal(isFiniteNumber(0), true);

  const infRaw: RawHourlyVariables = {
    time: '2026-10-21T12:00',
    temperature_2m: 30,
    relative_humidity_2m: 45,
    pm10: Infinity, // non-finite reading
    pm2_5: -Infinity,
    dust: NaN,
    wind_speed_10m: 15,
    wind_gusts_10m: 20,
    wind_direction_10m: 300,
    visibility: 10000,
    aerosol_optical_depth: 0.2,
  };

  const hi = calculateHeatIndex(infRaw.temperature_2m, infRaw.relative_humidity_2m);
  const res = evaluateActivityPolicy(infRaw, hi, FICTIONAL_DEMO_POLICY, 'break');

  // Non-finite readings must NOT trigger rules by accident or substitute zero
  assert.ok(res.status === 'assessment_unavailable' || res.status === 'not_evaluated');
  assert.equal(res.isIncomplete, true);
});

test('School Policy Precedence: malformed or incomplete precedence configuration cannot select a less protective action', () => {
  // Triggered actions: 'suspend' and 'indoor_only'
  // Malformed precedence order reverses safety: puts 'normal' and 'modified' first, omits 'suspend'
  const malformedPrecedence: any[] = ['normal', 'modified'];
  const winning = resolvePrecedence(['suspend', 'indoor_only'], malformedPrecedence);
  // Must NEVER select 'normal' or 'modified' when 'suspend' or 'indoor_only' is triggered
  assert.equal(winning, 'suspend');

  // When 'indoor_only' and 'modified' triggered with empty precedence order
  const emptyWinning = resolvePrecedence(['modified', 'indoor_only'], []);
  assert.equal(emptyWinning, 'indoor_only');

  // When policy precedence attempts to prefer 'modified' over 'indoor_only'
  const reversePrecedence: any[] = ['modified', 'indoor_only'];
  const safeWinning = resolvePrecedence(['indoor_only', 'modified'], reversePrecedence);
  // 'indoor_only' has protection level 3 > 'modified' level 2
  assert.equal(safeWinning, 'indoor_only');
});

test('School Policy Runtime Validation: localStorage policy validation fails safely to DEFAULT_UNCONFIGURED_POLICY', () => {
  // 1. null or non-object
  assert.equal(validateSchoolPolicy(null).isConfigured, false);
  assert.equal(validateSchoolPolicy('invalid string').isConfigured, false);
  assert.equal(validateSchoolPolicy(12345).isConfigured, false);

  // 2. Missing required fields
  assert.equal(validateSchoolPolicy({ isConfigured: true }).isConfigured, false);

  // 3. Rule with non-finite threshold (NaN)
  const corruptRulePolicy = {
    isConfigured: true,
    schoolName: 'Corrupt Academy',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'r1',
        name: 'Corrupt Rule',
        activity: 'break',
        metric: 'pm10',
        operator: '>=',
        threshold: NaN, // invalid non-finite threshold
        unit: 'µg/m³',
        recommendedAction: 'indoor_only',
        actionTitle: 'Title',
        actionGuidance: 'Guidance',
        reason: 'Reason',
        severity: 2,
      },
    ],
    precedenceOrder: ['suspend', 'indoor_only', 'modified', 'normal'],
  };
  assert.equal(validateSchoolPolicy(corruptRulePolicy).isConfigured, false);

  // 4. Rule with invalid operator or metric
  const invalidOperatorPolicy = {
    ...corruptRulePolicy,
    rules: [
      {
        ...corruptRulePolicy.rules[0],
        threshold: 150,
        operator: 'LIKE', // invalid operator
      },
    ],
  };
  assert.equal(validateSchoolPolicy(invalidOperatorPolicy).isConfigured, false);

  // 5. Valid policy validates cleanly and ensures complete precedence order
  const validPolicyInput = {
    isConfigured: true,
    schoolName: 'Official Abu Dhabi School',
    policyVersion: '2.1',
    effectiveDate: '2026-10-15',
    rules: [
      {
        id: 'r-valid',
        name: 'Valid PM10 Limit',
        activity: 'break',
        metric: 'pm10',
        operator: '>=',
        threshold: 200,
        unit: 'µg/m³',
        recommendedAction: 'indoor_only',
        actionTitle: 'Keep indoors',
        actionGuidance: 'Blowing dust advisory.',
        reason: 'Particulates elevated.',
        severity: 2,
      },
    ],
    precedenceOrder: ['indoor_only', 'modified'], // missing suspend and normal
  };
  const validated = validateSchoolPolicy(validPolicyInput);
  assert.equal(validated.isConfigured, true);
  assert.equal(validated.schoolName, 'Official Abu Dhabi School');
  assert.equal(validated.rules.length, 1);
  // Sanitizer appended missing actions
  assert.ok(validated.precedenceOrder?.includes('suspend'));
  assert.ok(validated.precedenceOrder?.includes('normal') || validated.precedenceOrder?.includes('continue'));
});

test('AI Summary Gating: getSchoolModeAdvice gates AI call on unconfigured, demo, no applicable rules, or incomplete data', async () => {
  const dummyReadings = {
    temperature: 30,
    relativeHumidity: 45,
    heatIndex: { heatIndexCelsius: 32, category: 'Caution' },
    pm10: 50,
    dust: 25,
    windSpeed: 15,
  };

  // 1. Unconfigured policy
  const unconfiguredRes = await getSchoolModeAdvice(
    'Dubai',
    'break',
    '10:00',
    {
      status: 'policy_unconfigured',
      recommendedAction: 'normal',
      actionTitle: 'School policy configuration required',
      primaryGuidance: 'Review school policy.',
      reason: 'Unconfigured.',
      triggeredRules: [],
      isPolicyConfigured: false,
    },
    dummyReadings
  );
  assert.equal(unconfiguredRes.isAI, false);
  assert.ok(unconfiguredRes.summary.includes('configuration required'));

  // 2. Fictional demonstration policy
  const demoRes = await getSchoolModeAdvice(
    'Dubai',
    'break',
    '10:00',
    {
      status: 'criteria_met_no_actions',
      recommendedAction: 'normal',
      actionTitle: 'Criteria met',
      primaryGuidance: 'Conditions meet criteria.',
      reason: 'None triggered.',
      triggeredRules: [],
      isPolicyConfigured: true,
      isFictionalDemo: true, // DEMO GATED
    },
    dummyReadings
  );
  assert.equal(demoRes.isAI, false);
  assert.ok(demoRes.summary.includes('demonstration') || demoRes.summary.includes('Criteria met'));

  // 3. No applicable rules configured
  const noRulesRes = await getSchoolModeAdvice(
    'Dubai',
    'break',
    '10:00',
    {
      status: 'no_applicable_rules',
      recommendedAction: 'normal',
      actionTitle: 'No applicable rules configured for this activity',
      primaryGuidance: 'No approved policy rules defined.',
      reason: 'No rules.',
      triggeredRules: [],
      isPolicyConfigured: true,
    },
    dummyReadings
  );
  assert.equal(noRulesRes.isAI, false);
  assert.ok(noRulesRes.summary.includes('No applicable rules'));

  // 4. Incomplete / missing assessment data
  const incompleteRes = await getSchoolModeAdvice(
    'Dubai',
    'break',
    '10:00',
    {
      status: 'action_triggered',
      recommendedAction: 'indoor_only',
      actionTitle: 'Move indoors',
      primaryGuidance: 'PM10 elevated.',
      reason: 'Particulates.',
      triggeredRules: [{ rule: { id: 'pm10-severe', metric: 'pm10' } }],
      dataMissingForAssessment: true,
      isIncomplete: true, // INCOMPLETE GATED
      isPolicyConfigured: true,
    },
    dummyReadings
  );
  assert.equal(incompleteRes.isAI, false);
});

test('School Policy: heat-index applicability when temperature is under 20°C', () => {
  const policyWithHeatRule: SchoolPolicyConfig = {
    isConfigured: true,
    schoolName: 'UAE Academy',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    precedenceOrder: ['suspend', 'indoor_only', 'modified', 'normal'],
    rules: [
      {
        id: 'rule-heat-high',
        name: 'High Heat Index Warning',
        activity: 'break',
        metric: 'heat_index',
        operator: '>=',
        threshold: 35,
        unit: '°C',
        recommendedAction: 'modified',
        actionTitle: 'Shorten outdoor play',
        actionGuidance: 'Reduce strenuous outdoor exertion.',
        reason: 'High heat index.',
        severity: 1,
      },
    ],
  };

  // 1. Valid cold/mild day: T=18°C, RH=50%. Heat index is not applicable by NOAA formula (<20°C).
  // Because T=18°C is safely below threshold 35°C, rule must NOT trigger and must NOT be flagged as missing data.
  const rawCool: RawHourlyVariables = {
    time: '2026-10-21T08:00',
    temperature_2m: 18,
    relative_humidity_2m: 50,
    pm10: 40,
    pm2_5: 15,
    dust: 20,
    wind_speed_10m: 10,
    wind_gusts_10m: 15,
    wind_direction_10m: 300,
    visibility: 10000,
    aerosol_optical_depth: 0.1,
  };

  const hiCool = calculateHeatIndex(rawCool.temperature_2m, rawCool.relative_humidity_2m);
  assert.equal(hiCool.isAvailable, false);
  assert.equal(hiCool.category, 'not applicable');

  const evalCool = evaluateActivityPolicy(rawCool, hiCool, policyWithHeatRule, 'break');
  assert.equal(evalCool.status, 'criteria_met_no_actions');
  assert.ok(evalCool.recommendedAction === 'normal' || evalCool.recommendedAction === 'continue');
  assert.equal(evalCool.isIncomplete, false);
  assert.equal(evalCool.dataMissingForAssessment, false);

  // 2. Genuine missing temperature: T=null, RH=50%. Heat index cannot be evaluated.
  const rawMissingTemp: RawHourlyVariables = {
    ...rawCool,
    temperature_2m: null,
  };
  const hiMissing = calculateHeatIndex(rawMissingTemp.temperature_2m, rawMissingTemp.relative_humidity_2m);
  const evalMissing = evaluateActivityPolicy(rawMissingTemp, hiMissing, policyWithHeatRule, 'break');
  assert.ok(evalMissing.status === 'assessment_unavailable' || evalMissing.status === 'not_evaluated');
  assert.equal(evalMissing.dataMissingForAssessment, true);
  assert.equal(evalMissing.triggeredRules.some((r) => r.isDataMissing), true);

  // 3. Mixed rules: Heat rule (T=18°C, safe) + PM10 rule (PM10 is null/missing)
  const policyMixed: SchoolPolicyConfig = {
    ...policyWithHeatRule,
    rules: [
      ...policyWithHeatRule.rules,
      {
        id: 'rule-pm10-mod',
        name: 'PM10 elevated',
        activity: 'break',
        metric: 'pm10',
        operator: '>=',
        threshold: 100,
        unit: 'µg/m³',
        recommendedAction: 'indoor_only',
        actionTitle: 'Move indoors',
        actionGuidance: 'Elevated particulate levels.',
        reason: 'PM10 high',
        severity: 2,
      },
    ],
  };

  const rawMissingPM10: RawHourlyVariables = {
    ...rawCool,
    pm10: null,
  };
  const evalMixedMissing = evaluateActivityPolicy(rawMissingPM10, hiCool, policyMixed, 'break');
  // Since no rule triggered and PM10 is missing, status must be assessment_unavailable or not_evaluated
  assert.ok(evalMixedMissing.status === 'assessment_unavailable' || evalMixedMissing.status === 'not_evaluated');
  assert.equal(evalMixedMissing.dataMissingForAssessment, true);
  assert.equal(evalMixedMissing.triggeredRules.some((r) => r.rule.metric === 'pm10' && r.isDataMissing), true);

  // 4. Mixed rules where one triggers and another is missing
  const policyMixedWithTrigger: SchoolPolicyConfig = {
    ...policyMixed,
    rules: [
      ...policyMixed.rules,
      {
        id: 'rule-wind-gust',
        name: 'Severe Wind Gusts',
        activity: 'break',
        metric: 'wind_gusts',
        operator: '>=',
        threshold: 10,
        unit: 'km/h',
        recommendedAction: 'suspend',
        actionTitle: 'Suspend outdoor activity',
        actionGuidance: 'High winds.',
        reason: 'Wind gusts high',
        severity: 3,
      },
    ],
  };

  const evalMixedTriggerAndMissing = evaluateActivityPolicy(rawMissingPM10, hiCool, policyMixedWithTrigger, 'break');
  // Action was triggered by wind gusts, but PM10 was missing: action preserved, assessment marked incomplete
  assert.equal(evalMixedTriggerAndMissing.status, 'action_triggered');
  assert.equal(evalMixedTriggerAndMissing.recommendedAction, 'suspend');
  assert.equal(evalMixedTriggerAndMissing.isIncomplete, true);
  assert.equal(evalMixedTriggerAndMissing.dataMissingForAssessment, true);
  assert.equal(evalMixedTriggerAndMissing.triggeredRules.some((r) => r.rule.metric === 'pm10' && r.isDataMissing), true);
  assert.equal(evalMixedTriggerAndMissing.triggeredRules.some((r) => r.rule.id === 'rule-wind-gust' && r.isTriggered), true);
});

/* ========================================================================
   SECTION 8 — REGRESSION TESTS FOR TECHNICAL POLICY SPECIFICATION
   ======================================================================== */

const baseTestRaw: RawHourlyVariables = {
  time: '2026-10-21T10:00',
  temperature_2m: 30,
  relative_humidity_2m: 50,
  pm10: 60,
  pm2_5: 25,
  dust: 40,
  wind_speed_10m: 12,
  wind_gusts_10m: 18,
  wind_direction_10m: 290,
  visibility: 10000,
  aerosol_optical_depth: 0.2,
  precipitation: 0,
  rain_rate: 0,
  ncm_warning_status: 'unavailable',
};

// 1. Missing policy returns unconfigured state
test('Section 8.1: Missing policy returns unconfigured state', () => {
  const hi = calculateHeatIndex(baseTestRaw.temperature_2m, baseTestRaw.relative_humidity_2m);
  const result = evaluateActivityPolicy(baseTestRaw, hi, DEFAULT_UNCONFIGURED_POLICY, 'pe');

  assert.ok(
    result.status === 'policy_not_configured' || result.status === 'policy_unconfigured',
    `Expected unconfigured status but got ${result.status}`
  );
  assert.equal(result.isPolicyConfigured, false);
  assert.equal(result.triggeredRules.length, 0);
  assert.ok(result.primaryGuidance.toLowerCase().includes('policy'));
});

// 2. Starter configuration does not activate example thresholds
test('Section 8.2: Starter configuration does not activate example thresholds', () => {
  assert.equal(STARTER_CONFIGURATION_POLICY.isStarterConfig, true);
  assert.equal(STARTER_CONFIGURATION_POLICY.isApproved, false);

  // In starter configuration, every rule must be disabled and have null threshold
  for (const rule of STARTER_CONFIGURATION_POLICY.rules) {
    assert.equal(rule.enabled, false, `Rule ${rule.id} should be disabled`);
    assert.equal(rule.value ?? rule.threshold, null, `Rule ${rule.id} should have null threshold`);
  }

  // Extreme observations: high heat, severe PM10, deluge rain
  const extremeRaw: RawHourlyVariables = {
    ...baseTestRaw,
    temperature_2m: 45,
    relative_humidity_2m: 60,
    pm10: 600,
    dust: 500,
    rain_rate: 50,
    precipitation: 80,
  };
  const hiExtreme = calculateHeatIndex(extremeRaw.temperature_2m, extremeRaw.relative_humidity_2m);
  const evalResult = evaluateActivityPolicy(extremeRaw, hiExtreme, STARTER_CONFIGURATION_POLICY, 'break');

  assert.ok(
    evalResult.status === 'policy_not_configured' || evalResult.status === 'policy_unconfigured'
  );
  assert.equal(evalResult.triggeredRules.length, 0);
  assert.notEqual(evalResult.status, 'action_triggered');
});

// 3. Existing valid custom policies are not overwritten
test('Section 8.3: Existing valid custom policies are not overwritten', () => {
  const customPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    isStarterConfig: false,
    schoolName: 'Al Ain English Academy',
    policyVersion: '2.5.0',
    effectiveDate: '2026-09-01',
    approvedBy: 'Health & Safety Committee (Dr. Fatima Al Nuaimi)',
    sourceDocument: 'Al Ain English Academy Operational Safety Handbook 2026-2027',
    missingDataBehavior: 'human_review',
    rules: [
      {
        id: 'aaea-heat-pe',
        name: 'PE Heat Index Cutoff',
        activity: 'pe',
        metric: 'heat_index',
        operator: '>=',
        threshold: 38,
        unit: '°C',
        recommendedAction: 'relocate',
        actionTitle: 'Relocate PE to air-conditioned sports hall',
        actionGuidance: 'Heat index exceeds 38°C.',
        reason: 'Heat safety protocol',
        severity: 2,
        enabled: true,
        sourceClassification: 'school_internal_policy',
      },
    ],
  };

  const validated = validateSchoolPolicy(customPolicy);
  assert.equal(validated.schoolName, 'Al Ain English Academy');
  assert.equal(validated.policyVersion, '2.5.0');
  assert.equal(validated.effectiveDate, '2026-09-01');
  assert.equal(validated.approvedBy, 'Health & Safety Committee (Dr. Fatima Al Nuaimi)');
  assert.equal(validated.sourceDocument, 'Al Ain English Academy Operational Safety Handbook 2026-2027');
  assert.equal(validated.isConfigured, true);
  assert.equal(validated.isApproved, true);
  assert.equal(validated.isStarterConfig, false);
  assert.equal(validated.rules.length, 1);
  assert.equal(validated.rules[0].id, 'aaea-heat-pe');
});

// 4. Invalid persisted policy data fails safely
test('Section 8.4: Invalid persisted policy data fails safely', () => {
  // Non-object
  assert.equal(validateSchoolPolicy(null).isConfigured, false);
  assert.equal(validateSchoolPolicy('corrupted string').isConfigured, false);

  // Missing or corrupted rules array
  assert.equal(validateSchoolPolicy({ isConfigured: true, rules: 'invalid' } as any).isConfigured, false);

  // Attempting to declare official_uae_rule without official UAE authority
  const fakeOfficialPolicy = {
    isConfigured: true,
    schoolName: 'Fake School',
    rules: [
      {
        id: 'fake-official',
        name: 'Bogus Official Rule',
        activity: 'all',
        metric: 'pm10',
        operator: '>=',
        threshold: 100,
        unit: 'µg/m³',
        recommendedAction: 'suspend',
        sourceClassification: 'official_uae_rule',
        sourceReference: 'Random Commercial Blog',
        enabled: true,
      },
    ],
  };
  const safeFallback = validateSchoolPolicy(fakeOfficialPolicy as any);
  assert.equal(safeFallback.isConfigured, false);
  assert.equal(safeFallback.isStarterConfig, true);
});

// 5. Rule with null value or enabled: false cannot trigger
test('Section 8.5: Rule with null value or enabled: false cannot trigger', () => {
  const policyWithDisabledRules: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Test School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'rule-null-val',
        name: 'Null Value Rule',
        activity: 'all',
        metric: 'pm10',
        operator: '>=',
        threshold: null,
        value: null,
        unit: 'µg/m³',
        recommendedAction: 'suspend',
        actionTitle: 'Should not trigger',
        actionGuidance: 'Disabled rule',
        reason: 'Disabled',
        severity: 3,
        enabled: true,
      },
      {
        id: 'rule-disabled-flag',
        name: 'Disabled Flag Rule',
        activity: 'all',
        metric: 'dust',
        operator: '>=',
        threshold: 50,
        value: 50,
        unit: 'µg/m³',
        recommendedAction: 'suspend',
        actionTitle: 'Should not trigger',
        actionGuidance: 'Disabled flag',
        reason: 'Disabled flag',
        severity: 3,
        enabled: false,
      },
    ],
  };

  const highRaw: RawHourlyVariables = {
    ...baseTestRaw,
    pm10: 900,
    dust: 400,
  };
  const hi = calculateHeatIndex(highRaw.temperature_2m, highRaw.relative_humidity_2m);
  const result = evaluateActivityPolicy(highRaw, hi, policyWithDisabledRules, 'break');

  assert.equal(result.triggeredRules.filter((r) => r.isTriggered).length, 0);
  assert.notEqual(result.recommendedAction, 'suspend');
  assert.equal(result.status, 'no_applicable_rules');
});

// 6. Activity-specific rules apply only to correct activities
test('Section 8.6: Activity-specific rules apply only to correct activities', () => {
  const activityPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Scope Test Academy',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'pe-only-rule',
        name: 'PE Strenuous Heat Cutoff',
        activity: 'pe',
        metric: 'heat_index',
        operator: '>=',
        threshold: 35,
        unit: '°C',
        recommendedAction: 'relocate',
        actionTitle: 'Move PE indoors',
        actionGuidance: 'Move PE',
        reason: 'PE only',
        severity: 2,
        enabled: true,
      },
      {
        id: 'assembly-only-rule',
        name: 'Assembly Sun Exposure Cutoff',
        activity: 'assembly',
        metric: 'temperature',
        operator: '>=',
        threshold: 32,
        unit: '°C',
        recommendedAction: 'suspend',
        actionTitle: 'Cancel outdoor assembly',
        actionGuidance: 'Cancel assembly',
        reason: 'Assembly only',
        severity: 3,
        enabled: true,
      },
    ],
  };

  const rawHot: RawHourlyVariables = {
    ...baseTestRaw,
    temperature_2m: 34,
    relative_humidity_2m: 55, // HI ~38°C
  };
  const hi = calculateHeatIndex(rawHot.temperature_2m, rawHot.relative_humidity_2m);

  // Break: neither rule applies -> no_applicable_rules
  const evalBreak = evaluateActivityPolicy(rawHot, hi, activityPolicy, 'break');
  assert.equal(evalBreak.status, 'no_applicable_rules');
  assert.equal(evalBreak.recommendedAction, 'continue');

  // PE: pe-only-rule applies and triggers -> relocate
  const evalPE = evaluateActivityPolicy(rawHot, hi, activityPolicy, 'pe');
  assert.equal(evalPE.status, 'action_triggered');
  assert.equal(evalPE.recommendedAction, 'relocate');
  assert.equal(evalPE.triggeredRules.find((r) => r.isTriggered)?.rule.id, 'pe-only-rule');

  // Assembly: assembly-only-rule applies and triggers -> suspend
  const evalAssembly = evaluateActivityPolicy(rawHot, hi, activityPolicy, 'assembly');
  assert.equal(evalAssembly.status, 'action_triggered');
  assert.equal(evalAssembly.recommendedAction, 'suspend');
  assert.equal(evalAssembly.triggeredRules.find((r) => r.isTriggered)?.rule.id, 'assembly-only-rule');
});

// 7. Missing, stale, invalid or conflicting required data never defaults to continue
test('Section 8.7: Missing, stale, invalid or conflicting required data never defaults to continue', () => {
  const policyRequireData: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Data Safety Academy',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    missingDataBehavior: 'not_evaluated',
    rules: [
      {
        id: 'req-pm10',
        name: 'PM10 Check',
        activity: 'break',
        metric: 'pm10',
        operator: '>=',
        threshold: 100,
        unit: 'µg/m³',
        recommendedAction: 'relocate',
        actionTitle: 'Move indoors',
        actionGuidance: 'High PM10',
        reason: 'PM10 check',
        severity: 2,
        enabled: true,
      },
    ],
  };

  // Missing PM10
  const rawMissing: RawHourlyVariables = {
    ...baseTestRaw,
    pm10: null,
  };
  const hi = calculateHeatIndex(rawMissing.temperature_2m, rawMissing.relative_humidity_2m);
  const evalMissing = evaluateActivityPolicy(rawMissing, hi, policyRequireData, 'break');

  assert.equal(evalMissing.dataMissingForAssessment, true);
  assert.equal(evalMissing.status, 'not_evaluated');
  assert.notEqual(evalMissing.recommendedAction, 'continue');
  assert.equal(evalMissing.recommendedAction, 'human_review');
  assert.notEqual(evalMissing.actionTitle, 'Criteria Met');

  // When policy configures human_review for missing data
  const policyHumanReview: SchoolPolicyConfig = {
    ...policyRequireData,
    missingDataBehavior: 'human_review',
  };
  const evalReview = evaluateActivityPolicy(rawMissing, hi, policyHumanReview, 'break');
  assert.equal(evalReview.status, 'human_review');
  assert.equal(evalReview.recommendedAction, 'human_review');
});

// 8. Rain above threshold triggers configured action
test('Section 8.8: Rain above threshold triggers configured action', () => {
  const rainPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Rain Protocol School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'rain-rate-high',
        name: 'Heavy Downpour',
        activity: 'break',
        metric: 'rain_rate',
        operator: '>=',
        threshold: 5.0,
        unit: 'mm/h',
        recommendedAction: 'relocate',
        actionTitle: 'Move students under shelter',
        actionGuidance: 'Rain downpour',
        reason: 'Rain rate exceeded 5 mm/h',
        severity: 2,
        enabled: true,
      },
    ],
  };

  const rawRaining: RawHourlyVariables = {
    ...baseTestRaw,
    rain_rate: 7.5,
  };
  const hi = calculateHeatIndex(rawRaining.temperature_2m, rawRaining.relative_humidity_2m);
  const evalRain = evaluateActivityPolicy(rawRaining, hi, rainPolicy, 'break');

  assert.equal(evalRain.status, 'action_triggered');
  assert.equal(evalRain.recommendedAction, 'relocate');
  assert.equal(evalRain.triggeredRules.filter((r) => r.isTriggered).length, 1);
  assert.equal(evalRain.triggeredRules.find((r) => r.isTriggered)?.observedValue, 7.5);
});

// 9. Rain below threshold does not trigger that rule
test('Section 8.9: Rain below threshold does not trigger that rule', () => {
  const rainPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Rain Protocol School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'rain-rate-high',
        name: 'Heavy Downpour',
        activity: 'break',
        metric: 'rain_rate',
        operator: '>=',
        threshold: 5.0,
        unit: 'mm/h',
        recommendedAction: 'relocate',
        actionTitle: 'Move students under shelter',
        actionGuidance: 'Rain downpour',
        reason: 'Rain rate exceeded 5 mm/h',
        severity: 2,
        enabled: true,
      },
    ],
  };

  const rawLightRain: RawHourlyVariables = {
    ...baseTestRaw,
    rain_rate: 1.5, // 1.5 < 5.0
  };
  const hi = calculateHeatIndex(rawLightRain.temperature_2m, rawLightRain.relative_humidity_2m);
  const evalLightRain = evaluateActivityPolicy(rawLightRain, hi, rainPolicy, 'break');

  assert.equal(evalLightRain.status, 'criteria_met_no_actions');
  assert.equal(evalLightRain.recommendedAction, 'continue');
  assert.equal(evalLightRain.triggeredRules.filter((r) => r.isTriggered).length, 0);
});

// 10. Rain rate and accumulated rainfall handled as distinct metrics
test('Section 8.10: Rain rate and accumulated rainfall handled as distinct metrics', () => {
  const rainDualPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Dual Rain School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'rain-rate-cutoff',
        name: 'Active Rain Intensity Cutoff',
        activity: 'break',
        metric: 'rain_rate',
        operator: '>=',
        threshold: 10.0,
        unit: 'mm/h',
        recommendedAction: 'suspend',
        actionTitle: 'Suspend outdoor activities',
        actionGuidance: 'Active torrential rain',
        reason: 'Rain rate >= 10 mm/h',
        severity: 3,
        enabled: true,
      },
      {
        id: 'rain-accum-cutoff',
        name: 'Flooding Grounds Accumulation Cutoff',
        activity: 'break',
        metric: 'accumulated_rain',
        operator: '>=',
        threshold: 25.0,
        unit: 'mm',
        recommendedAction: 'relocate',
        actionTitle: 'Move to indoor recreation',
        actionGuidance: 'Ground waterlogging',
        reason: 'Accumulated rain >= 25 mm',
        severity: 2,
        enabled: true,
      },
    ],
  };

  // Waterlogged grounds after rain has ceased: rain_rate = 0 mm/h, accumulated_rain = 30.0 mm
  const rawPonding: RawHourlyVariables = {
    ...baseTestRaw,
    rain_rate: 0.0,
    precipitation: 30.0,
  };
  const hi = calculateHeatIndex(rawPonding.temperature_2m, rawPonding.relative_humidity_2m);
  const evalPonding = evaluateActivityPolicy(rawPonding, hi, rainDualPolicy, 'break');

  assert.equal(evalPonding.status, 'action_triggered');
  assert.equal(evalPonding.recommendedAction, 'relocate'); // from accumulated_rain
  assert.equal(evalPonding.triggeredRules.filter((r) => r.isTriggered).length, 1);
  const triggeredItem = evalPonding.triggeredRules.find((r) => r.isTriggered);
  assert.equal(triggeredItem?.rule.metric, 'accumulated_rain');
  assert.equal(triggeredItem?.observedValue, 30.0);
});

// 11. Missing rain data is not treated as zero
test('Section 8.11: Missing rain data is not treated as zero', () => {
  const rainPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Rain Check School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    missingDataBehavior: 'not_evaluated',
    rules: [
      {
        id: 'rule-rain',
        name: 'Rain Precaution',
        activity: 'break',
        metric: 'rain_rate',
        operator: '>=',
        threshold: 0.5,
        unit: 'mm/h',
        recommendedAction: 'modify',
        actionTitle: 'Wet weather plan',
        actionGuidance: 'Wet weather',
        reason: 'Rain check',
        severity: 1,
        enabled: true,
      },
    ],
  };

  const rawMissingRain: RawHourlyVariables = {
    ...baseTestRaw,
    rain_rate: null,
  };
  const hi = calculateHeatIndex(rawMissingRain.temperature_2m, rawMissingRain.relative_humidity_2m);
  const evalMissingRain = evaluateActivityPolicy(rawMissingRain, hi, rainPolicy, 'break');

  assert.equal(evalMissingRain.dataMissingForAssessment, true);
  assert.equal(evalMissingRain.status, 'not_evaluated');
  assert.notEqual(evalMissingRain.status, 'criteria_met_no_actions');
  assert.equal(evalMissingRain.triggeredRules.some((r) => r.rule.metric === 'rain_rate' && r.isDataMissing), true);
});

// 12. Simultaneous dust, heat and rain triggers all retained
test('Section 8.12: Simultaneous dust, heat and rain triggers all retained', () => {
  const multiHazardPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'Multi Hazard School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    rules: [
      {
        id: 'hazard-heat',
        name: 'Heat Trigger',
        activity: 'break',
        metric: 'heat_index',
        operator: '>=',
        threshold: 38,
        unit: '°C',
        recommendedAction: 'modify',
        actionTitle: 'Modify for heat',
        actionGuidance: 'Heat guidance',
        reason: 'Heat',
        severity: 1,
        enabled: true,
      },
      {
        id: 'hazard-dust',
        name: 'Dust Trigger',
        activity: 'break',
        metric: 'dust',
        operator: '>=',
        threshold: 150,
        unit: 'µg/m³',
        recommendedAction: 'relocate',
        actionTitle: 'Relocate for dust',
        actionGuidance: 'Dust guidance',
        reason: 'Dust',
        severity: 2,
        enabled: true,
      },
      {
        id: 'hazard-rain',
        name: 'Rain Trigger',
        activity: 'break',
        metric: 'rain_rate',
        operator: '>=',
        threshold: 4.0,
        unit: 'mm/h',
        recommendedAction: 'suspend',
        actionTitle: 'Suspend for rain',
        actionGuidance: 'Rain guidance',
        reason: 'Rain',
        severity: 3,
        enabled: true,
      },
    ],
  };

  const rawCompoundHazard: RawHourlyVariables = {
    ...baseTestRaw,
    temperature_2m: 35,
    relative_humidity_2m: 55, // HI ~41°C >= 38
    dust: 220,               // 220 >= 150
    rain_rate: 6.0,          // 6.0 >= 4.0
  };
  const hi = calculateHeatIndex(rawCompoundHazard.temperature_2m, rawCompoundHazard.relative_humidity_2m);
  const result = evaluateActivityPolicy(rawCompoundHazard, hi, multiHazardPolicy, 'break');

  assert.equal(result.status, 'action_triggered');
  assert.equal(result.recommendedAction, 'suspend'); // Most protective action wins
  assert.equal(result.triggeredRules.filter((r) => r.isTriggered).length, 3, 'All 3 simultaneous triggers must be retained');

  const triggeredRuleIds = result.triggeredRules.filter((r) => r.isTriggered).map((tr) => tr.rule.id);
  assert.ok(triggeredRuleIds.includes('hazard-heat'));
  assert.ok(triggeredRuleIds.includes('hazard-dust'));
  assert.ok(triggeredRuleIds.includes('hazard-rain'));
});

// 13. Action precedence cannot select less protective action
test('Section 8.13: Action precedence cannot select less protective action', () => {
  // Even if precedenceOrder is backwards: ['continue', 'modify', 'relocate', 'suspend']
  const backwardsPrecedence: Array<'continue' | 'modify' | 'relocate' | 'suspend' | 'human_review'> = [
    'continue',
    'modify',
    'relocate',
    'suspend',
  ];

  const actionsPresent: Array<'continue' | 'modify' | 'relocate' | 'suspend' | 'human_review'> = [
    'continue',
    'modify',
    'suspend',
  ];

  const chosen = resolvePrecedence(actionsPresent, backwardsPrecedence);
  // Protection invariant: suspend (protection 5) must prevail over continue (1) or modify (3)
  assert.equal(chosen, 'suspend');
});

// 14. Unavailable NCM status never presented as verified absence
test('Section 8.14: Unavailable NCM status never presented as verified absence', () => {
  const rawWithUnavailableNCM: RawHourlyVariables = {
    ...baseTestRaw,
    ncm_warning_status: 'unavailable',
  };

  const metricVal = getMetricValue('ncm_warning', rawWithUnavailableNCM, null);
  assert.equal(metricVal, null, 'Unavailable NCM status must evaluate to null, not none/safe');

  const ncmPolicy: SchoolPolicyConfig = {
    isConfigured: true,
    isApproved: true,
    schoolName: 'NCM Test School',
    policyVersion: '1.0',
    effectiveDate: '2026-10-01',
    missingDataBehavior: 'not_evaluated',
    rules: [
      {
        id: 'rule-ncm',
        name: 'Official NCM Amber/Red Warning',
        activity: 'break',
        metric: 'ncm_warning',
        operator: '==',
        threshold: 1,
        unit: 'warning',
        recommendedAction: 'suspend',
        actionTitle: 'Suspend on official warning',
        actionGuidance: 'Official warning active',
        reason: 'NCM warning check',
        severity: 3,
        enabled: true,
      },
    ],
  };

  const hi = calculateHeatIndex(rawWithUnavailableNCM.temperature_2m, rawWithUnavailableNCM.relative_humidity_2m);
  const evalNCM = evaluateActivityPolicy(rawWithUnavailableNCM, hi, ncmPolicy, 'break');

  assert.equal(evalNCM.dataMissingForAssessment, true);
  assert.equal(evalNCM.status, 'not_evaluated');
  assert.notEqual(evalNCM.status, 'criteria_met_no_actions');
});

// 15. AI explanation cannot override deterministic policy result
test('Section 8.15: AI explanation cannot override deterministic policy result', async () => {
  // Gated condition: policy unconfigured
  const resUnconfigured = await getSchoolModeAdvice(
    'Dubai',
    'break',
    '10:00 GST',
    {
      status: 'policy_unconfigured',
      recommendedAction: 'normal',
      actionTitle: 'School policy configuration required',
      primaryGuidance: 'Operational school policy is required before evaluating recommendations.',
      reason: 'Policy unconfigured',
      triggeredRules: [],
      dataMissingForAssessment: false,
      isIncomplete: false,
      isPolicyConfigured: false,
    },
    {
      temperature: 30,
      relativeHumidity: 50,
      heatIndex: { heatIndexCelsius: 31, category: 'Caution' },
      pm10: 50,
      dust: 30,
    }
  );
  assert.equal(resUnconfigured.isAI, false);
  assert.ok(resUnconfigured.summary.includes('policy'));

  // Gated condition: starter configuration
  const resStarter = await getSchoolModeAdvice(
    'Dubai',
    'break',
    '10:00 GST',
    {
      status: 'policy_not_configured',
      recommendedAction: 'continue',
      actionTitle: 'Starter configuration — not an approved school policy',
      primaryGuidance: 'Starter template; approval required.',
      reason: 'Starter template',
      triggeredRules: [],
      dataMissingForAssessment: false,
      isIncomplete: false,
      isPolicyConfigured: false,
      isStarterConfig: true,
    } as any,
    {
      temperature: 30,
      relativeHumidity: 50,
      heatIndex: { heatIndexCelsius: 31, category: 'Caution' },
      pm10: 50,
      dust: 30,
    }
  );
  assert.equal(resStarter.isAI, false);
  assert.ok(resStarter.summary.includes('Starter configuration'));
});

// 16. Existing dust-risk calculations and unrelated behavior remain unchanged
test('Section 8.16: Existing dust-risk calculations and unrelated behavior remain unchanged', () => {
  const sampleAtmosphere: RawHourlyVariables = {
    time: '2026-10-21T12:00',
    temperature_2m: 35,
    relative_humidity_2m: 25,
    pm10: 120,
    pm2_5: 35,
    dust: 80,
    wind_speed_10m: 22,
    wind_gusts_10m: 32,
    wind_direction_10m: 310,
    visibility: 6000,
    aerosol_optical_depth: 0.45,
  };

  const baseline = calculateHourlyBaseline(0, sampleAtmosphere);
  assert.ok(typeof baseline.finalScore === 'number' && baseline.finalScore >= 0 && baseline.finalScore <= 100);
  assert.ok(['Low', 'Moderate', 'High', 'Very High'].includes(baseline.category));
  assert.equal(baseline.subScores.pm10.variableKey, 'pm10');
  assert.equal(baseline.subScores.dust.variableKey, 'dust');
  assert.equal(baseline.subScores.relative_humidity_2m.variableKey, 'relative_humidity_2m');
  assert.equal(baseline.subScores.relative_humidity_2m.weight, 0.05); // 5% weight
});

// 17. Fictional Policy Presentation Tests
test('Fictional Policy: with no triggered thresholds never displays operational Criteria Met wording', () => {
  const calmConditions: RawHourlyVariables = {
    time: '2026-10-21T09:00',
    temperature_2m: 26,
    relative_humidity_2m: 35,
    pm10: 45,
    pm2_5: 15,
    dust: 25,
    wind_speed_10m: 12,
    wind_gusts_10m: 18,
    wind_direction_10m: 290,
    visibility: 10000,
    aerosol_optical_depth: 0.15,
    rain_rate: 0,
    precipitation: 0,
  };

  const hi = calculateHeatIndex(calmConditions.temperature_2m, calmConditions.relative_humidity_2m);
  
  // Test across all school activities
  const activities: Array<'break' | 'pe' | 'lunch_other' | 'assembly'> = ['break', 'pe', 'lunch_other', 'assembly'];
  for (const act of activities) {
    const assessment = evaluateActivityPolicy(calmConditions, hi, FICTIONAL_DEMO_POLICY, act);
    assert.equal(assessment.isFictionalDemo, true);
    assert.notEqual(assessment.actionTitle, 'Conditions meet the configured criteria for this activity');
    assert.equal(assessment.actionTitle, 'Demonstration Result — Not Operational');
    assert.ok(assessment.primaryGuidance.includes('not an operational safety determination'));
    assert.ok(assessment.primaryGuidance.includes('testing only'));
  }
});

test('Fictional Policy: with triggered thresholds displays demonstration-only status while preserving rule details', () => {
  const hazardConditions: RawHourlyVariables = {
    time: '2026-10-21T13:00',
    temperature_2m: 38,
    relative_humidity_2m: 55, // Heat index ~47°C -> triggers relocate (threshold 40)
    pm10: 280, // PM10 >= 250 -> triggers relocate
    pm2_5: 80,
    dust: 210, // Dust >= 200 -> triggers relocate
    wind_speed_10m: 25,
    wind_gusts_10m: 55, // Gusts >= 50 -> triggers relocate
    wind_direction_10m: 310,
    visibility: 3000,
    aerosol_optical_depth: 0.7,
    rain_rate: 0,
    precipitation: 0,
  };

  const hi = calculateHeatIndex(hazardConditions.temperature_2m, hazardConditions.relative_humidity_2m);
  const assessment = evaluateActivityPolicy(hazardConditions, hi, FICTIONAL_DEMO_POLICY, 'break');

  assert.equal(assessment.status, 'action_triggered');
  assert.equal(assessment.isFictionalDemo, true);
  // Must indicate demonstration-only in actionTitle, primaryGuidance, and reason
  assert.ok(assessment.actionTitle.startsWith('Demonstration:'));
  assert.ok(assessment.primaryGuidance.includes('Demonstration result only'));
  assert.ok(assessment.reason.includes('fictional testing'));
  // Triggered rule details must be fully preserved for verification
  assert.ok(assessment.triggeredRules.length >= 4);
  const heatRule = assessment.triggeredRules.find((tr) => tr.rule.metric === 'heat_index');
  assert.ok(heatRule && heatRule.isTriggered);
  assert.equal(heatRule.thresholdValue, 40);
  const pm10Rule = assessment.triggeredRules.find((tr) => tr.rule.id === 'pm10-severe-all');
  assert.ok(pm10Rule && pm10Rule.isTriggered);
});

test('Fictional Policy: 12-hour timeline assessments carry isFictionalDemo flag and non-operational guidance', () => {
  const calmHours: RawHourlyVariables[] = Array.from({ length: 12 }, (_, i) => ({
    time: `2026-10-21T${String(8 + i).padStart(2, '0')}:00`,
    temperature_2m: 27,
    relative_humidity_2m: 30,
    pm10: 40,
    pm2_5: 12,
    dust: 20,
    wind_speed_10m: 10,
    wind_gusts_10m: 15,
    wind_direction_10m: 280,
    visibility: 10000,
    aerosol_optical_depth: 0.1,
    rain_rate: 0,
    precipitation: 0,
  }));

  const timeline = buildHourlySchoolAssessments(calmHours, FICTIONAL_DEMO_POLICY);
  assert.equal(timeline.length, 12);

  for (const hour of timeline) {
    for (const act of ['break', 'pe', 'assembly'] as const) {
      const actAssessment = hour.activityAssessments[act];
      assert.equal(actAssessment.isFictionalDemo, true);
      assert.equal(actAssessment.actionTitle, 'Demonstration Result — Not Operational');
      assert.notEqual(actAssessment.actionTitle, 'Conditions meet the configured criteria for this activity');
    }
  }
});

test('Approved School Policy: valid non-fictional policy retains operational criteria met status', () => {
  const calmConditions: RawHourlyVariables = {
    time: '2026-10-21T09:00',
    temperature_2m: 25,
    relative_humidity_2m: 35,
    pm10: 40,
    pm2_5: 10,
    dust: 20,
    wind_speed_10m: 10,
    wind_gusts_10m: 15,
    wind_direction_10m: 290,
    visibility: 10000,
    aerosol_optical_depth: 0.1,
    rain_rate: 0,
    precipitation: 0,
  };

  const hi = calculateHeatIndex(calmConditions.temperature_2m, calmConditions.relative_humidity_2m);
  const assessment = evaluateActivityPolicy(calmConditions, hi, SAMPLE_APPROVED_SCHOOL_POLICY, 'break');

  assert.equal(assessment.isFictionalDemo, false);
  assert.equal(assessment.status, 'criteria_met_no_actions');
  assert.equal(assessment.actionTitle, 'Conditions meet the configured criteria for this activity');
  assert.ok(assessment.primaryGuidance.includes('Conditions meet the configured criteria for this activity under current school thresholds'));
});

test('Starter Policy: unconfigured starter template retains policy_not_configured status', () => {
  const calmConditions: RawHourlyVariables = {
    time: '2026-10-21T09:00',
    temperature_2m: 25,
    relative_humidity_2m: 35,
    pm10: 40,
    pm2_5: 10,
    dust: 20,
    wind_speed_10m: 10,
    wind_gusts_10m: 15,
    wind_direction_10m: 290,
    visibility: 10000,
    aerosol_optical_depth: 0.1,
    rain_rate: 0,
    precipitation: 0,
  };

  const hi = calculateHeatIndex(calmConditions.temperature_2m, calmConditions.relative_humidity_2m);
  const assessment = evaluateActivityPolicy(calmConditions, hi, DEFAULT_UNCONFIGURED_POLICY, 'break');

  assert.ok(assessment.status === 'policy_not_configured' || assessment.status === 'policy_unconfigured');
  assert.equal(assessment.actionTitle, 'School policy configuration required');
  assert.notEqual(assessment.actionTitle, 'Criteria Met');
  assert.notEqual(assessment.actionTitle, 'Demonstration Result — Not Operational');
});

