/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudRain,
  ExternalLink,
  Eye,
  GraduationCap,
  HelpCircle,
  Info,
  Printer,
  RotateCcw,
  School,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import { APP_CONFIG, CITIES } from '../config.ts';
import { STRINGS } from '../strings.ts';
import {
  CityOutlook,
  HourlySchoolAssessment,
  RawCityData,
  SchoolActivityAssessment,
  SchoolActivityType,
  SchoolPolicyConfig,
  SchoolPolicyRule,
  SchoolRecommendedAction,
} from '../types.ts';
import {
  DEFAULT_UNCONFIGURED_POLICY,
  STARTER_CONFIGURATION_POLICY,
  STARTER_REQUIRED_INFO_CHECKLIST,
  FICTIONAL_DEMO_POLICY,
  buildHourlySchoolAssessments,
  validateSchoolPolicy,
  canonicalAction,
} from '../schoolPolicy.ts';
import { extract12Hours, getCurrentDubaiHour, extractCurrentPrecipitation } from '../dataService.ts';
import { getSchoolModeAdvice, serializeSchoolAdviceInputs } from '../geminiService.ts';
import {
  OutlineDrawCard,
  OutlineDrawHeading,
  OutlineDrawBody,
  OutlineDrawVisual,
} from './OutlineDrawCard.tsx';

interface SchoolModeScreenProps {
  outlooks: Record<string, CityOutlook>;
  rawCityData: Record<string, RawCityData>;
  selectedCityId: string;
  onSelectCity: (id: string) => void;
  lastUpdatedFormatted: string;
  schoolPolicy?: SchoolPolicyConfig;
  onUpdateSchoolPolicy?: (policy: SchoolPolicyConfig) => void;
  isDemoMode?: boolean;
}

export const SchoolModeScreen: React.FC<SchoolModeScreenProps> = ({
  outlooks,
  rawCityData,
  selectedCityId,
  onSelectCity,
  lastUpdatedFormatted,
  schoolPolicy: propSchoolPolicy,
  onUpdateSchoolPolicy,
  isDemoMode: propIsDemoMode = false,
}) => {
  const currentOutlook = outlooks[selectedCityId];
  const currentRaw = rawCityData[selectedCityId];
  const isDemoMode = Boolean(
    propIsDemoMode ||
    currentOutlook?.dataSourceType === 'sample' ||
    currentOutlook?.dataSourceType === 'snapshot'
  );
  const selectedCityInfo = CITIES.find((c) => c.id === selectedCityId) || {
    id: selectedCityId,
    name: selectedCityId,
    latitude: 0,
    longitude: 0,
  };

  // Activities: Show Break and PE only (Lunch behind config.schoolActivities, off by default)
  const showLunch = APP_CONFIG.schoolActivities?.showLunch ?? false;
  const [selectedActivity, setSelectedActivity] = useState<SchoolActivityType>('break');

  // Track if rules were edited in the browser
  const [isLocallyEdited, setIsLocallyEdited] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dustwatch_policy_is_locally_edited') === 'true';
    } catch {
      return false;
    }
  });

  // Base configured policy preset
  const [baseConfiguredPreset, setBaseConfiguredPreset] = useState<'unconfigured' | 'demo'>(() => {
    try {
      const preset = localStorage.getItem('dustwatch_base_preset');
      return preset === 'demo' ? 'demo' : 'unconfigured';
    } catch {
      return 'unconfigured';
    }
  });

  // School policy configuration state
  const [schoolPolicy, setSchoolPolicy] = useState<SchoolPolicyConfig>(() => {
    if (propSchoolPolicy) return validateSchoolPolicy(propSchoolPolicy);
    try {
      const saved = localStorage.getItem('dustwatch_school_policy');
      if (saved) return validateSchoolPolicy(JSON.parse(saved));
    } catch {
      // ignore
    }
    return DEFAULT_UNCONFIGURED_POLICY;
  });

  useEffect(() => {
    if (propSchoolPolicy) {
      setSchoolPolicy(propSchoolPolicy);
      setEditableRules(propSchoolPolicy.rules);
    }
  }, [propSchoolPolicy]);

  const updatePolicy = (newPolicy: SchoolPolicyConfig) => {
    setSchoolPolicy(newPolicy);
    setEditableRules(newPolicy.rules);
    onUpdateSchoolPolicy?.(newPolicy);
  };

  // Selected hour index within the 12-hour outlook
  const [selectedHourIndex, setSelectedHourIndex] = useState<number>(0);

  // Policy Editor Modal state
  const [showPolicyModal, setShowPolicyModal] = useState<boolean>(false);
  const [editableRules, setEditableRules] = useState<SchoolPolicyRule[]>(schoolPolicy.rules);

  // Gemini advice state for school mode, tracked with request key to prevent stale advice
  const [activeAdviceState, setActiveAdviceState] = useState<{
    key: string;
    summary: string;
    isAI: boolean;
  } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Reset to 'break' if lunch is disabled and lunch was previously active
  useEffect(() => {
    if (!showLunch && selectedActivity === 'lunch_other') {
      setSelectedActivity('break');
    }
  }, [showLunch, selectedActivity]);

  // Extract 12 hours from raw data
  const { hourString } = getCurrentDubaiHour();
  const raw12Hours = currentRaw ? extract12Hours(currentRaw, hourString) : [];
  const currentPrecipitation = currentRaw ? extractCurrentPrecipitation(currentRaw) : null;

  // Compute 12-hour school assessments
  const hourlyAssessments: HourlySchoolAssessment[] = buildHourlySchoolAssessments(
    raw12Hours,
    schoolPolicy
  );

  const selectedAssessment = hourlyAssessments[selectedHourIndex] || hourlyAssessments[0];
  const currentActivityAssessment = selectedAssessment?.activityAssessments[selectedActivity];
  const aiSummary = activeAdviceState?.summary;
  const isAiGenerated = activeAdviceState?.isAI ?? false;

  // Derive canonical request key from current inputs
  const currentRequestKey = React.useMemo(() => {
    if (!currentOutlook || !selectedAssessment || !currentActivityAssessment) return '';
    const lunchAllowed = APP_CONFIG.schoolActivities?.showLunch ?? false;
    let normalizedActivity: 'break' | 'pe' | 'lunch' | 'assembly' = 'break';
    if (selectedActivity === 'pe') normalizedActivity = 'pe';
    else if (selectedActivity === 'assembly') normalizedActivity = 'assembly';
    else if (lunchAllowed && (String(selectedActivity) === 'lunch_other' || String(selectedActivity) === 'lunch')) normalizedActivity = 'lunch';

    const cAction = canonicalAction(currentActivityAssessment.recommendedAction);
    let normalizedAction: 'normal' | 'shorten' | 'cancel' = 'normal';
    if (cAction === 'modify') normalizedAction = 'shorten';
    else if (cAction === 'relocate' || cAction === 'suspend') normalizedAction = 'cancel';

    const readings = selectedAssessment.environmentalReadings;
    const inputPayload = {
      city: currentOutlook.city.name,
      activity: normalizedActivity,
      hour: selectedAssessment.displayHour,
      action: normalizedAction,
      status: currentActivityAssessment.status,
      reason: currentActivityAssessment.reason,
      heatIndex: readings.heatIndex.heatIndexCelsius,
      temperature: readings.temperature,
      humidity: readings.relativeHumidity,
      pm10: readings.pm10,
      pm25: readings.pm2_5,
      dust: readings.dust,
      windSpeed: readings.windSpeed,
      visibility: readings.visibility,
      rainRate: readings.rainRate,
      accumulatedRain: readings.accumulatedRain,
      ncmWarningStatus: readings.ncmWarningStatus,
      triggeredRules: currentActivityAssessment.triggeredRules.map((tr) => ({
        ruleId: tr.rule.id,
        metric: tr.rule.metric,
      })),
      levelNow: currentOutlook.levelNow,
      peakLevel: currentOutlook.peakLevel,
      peakWindow: currentOutlook.worstWindow.displayRange,
      confidence: currentOutlook.confidence,
      lunchEnabled: lunchAllowed,
      isPolicyConfigured: schoolPolicy.isConfigured,
      isStarterConfig: schoolPolicy.isStarterConfig,
      isFictionalDemo: schoolPolicy.isFictionalDemo,
      isDemoMode: Boolean(isDemoMode),
      isIncomplete: currentActivityAssessment.isIncomplete,
      dataMissingForAssessment: currentActivityAssessment.dataMissingForAssessment,
    };
    return serializeSchoolAdviceInputs(inputPayload);
  }, [
    currentOutlook,
    selectedAssessment,
    currentActivityAssessment,
    selectedActivity,
    schoolPolicy,
    isDemoMode,
  ]);

  // Update AI advice when request inputs change
  useEffect(() => {
    if (!currentOutlook || !selectedAssessment || !currentActivityAssessment || !currentRequestKey) {
      setActiveAdviceState(null);
      setIsAiLoading(false);
      return;
    }

    const requestKey = currentRequestKey;
    let isMounted = true;
    setIsAiLoading(true);

    const readings = selectedAssessment.environmentalReadings;

    getSchoolModeAdvice(
      currentOutlook.city.name,
      selectedActivity,
      selectedAssessment.displayHour,
      {
        status: currentActivityAssessment.status,
        recommendedAction: currentActivityAssessment.recommendedAction,
        actionTitle: currentActivityAssessment.actionTitle,
        primaryGuidance: currentActivityAssessment.primaryGuidance,
        reason: currentActivityAssessment.reason,
        triggeredRules: currentActivityAssessment.triggeredRules.map((tr) => ({
          rule: { id: tr.rule.id, metric: tr.rule.metric },
        })),
        dataMissingForAssessment: currentActivityAssessment.dataMissingForAssessment,
        isIncomplete: currentActivityAssessment.isIncomplete,
        isPolicyConfigured: schoolPolicy.isConfigured,
        isStarterConfig: schoolPolicy.isStarterConfig,
        isFictionalDemo: schoolPolicy.isFictionalDemo,
        isDemoMode: Boolean(isDemoMode),
      },
      {
        temperature: readings.temperature,
        relativeHumidity: readings.relativeHumidity,
        heatIndex: {
          heatIndexCelsius: readings.heatIndex.heatIndexCelsius,
          category: readings.heatIndex.category,
        },
        pm10: readings.pm10,
        pm25: readings.pm2_5,
        dust: readings.dust,
        windSpeed: readings.windSpeed,
        visibility: readings.visibility,
        rainRate: readings.rainRate,
        accumulatedRain: readings.accumulatedRain,
        ncmWarningStatus: readings.ncmWarningStatus,
      },
      {
        levelNow: currentOutlook.levelNow,
        peakLevel: currentOutlook.peakLevel,
        peakWindow: currentOutlook.worstWindow.displayRange,
        confidence: currentOutlook.confidence,
        isDemoMode: Boolean(isDemoMode),
      },
      {
        isDemoMode: Boolean(isDemoMode),
      }
    )
      .then((res) => {
        if (isMounted) {
          setActiveAdviceState({
            key: requestKey,
            summary: res.summary,
            isAI: res.isAI,
          });
          setIsAiLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setActiveAdviceState({
            key: requestKey,
            summary: currentActivityAssessment.primaryGuidance,
            isAI: false,
          });
          setIsAiLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentRequestKey]);

  // Load demonstration policy
  const handleLoadFictionalDemo = () => {
    updatePolicy(FICTIONAL_DEMO_POLICY);
    setBaseConfiguredPreset('demo');
    setIsLocallyEdited(false);
    try {
      localStorage.setItem('dustwatch_school_policy', JSON.stringify(FICTIONAL_DEMO_POLICY));
      localStorage.setItem('dustwatch_base_preset', 'demo');
      localStorage.removeItem('dustwatch_policy_is_locally_edited');
    } catch {
      // ignore
    }
  };

  const handleResetToUnconfigured = () => {
    updatePolicy(DEFAULT_UNCONFIGURED_POLICY);
    setBaseConfiguredPreset('unconfigured');
    setIsLocallyEdited(false);
    try {
      localStorage.setItem('dustwatch_school_policy', JSON.stringify(DEFAULT_UNCONFIGURED_POLICY));
      localStorage.setItem('dustwatch_base_preset', 'unconfigured');
      localStorage.removeItem('dustwatch_policy_is_locally_edited');
    } catch {
      // ignore
    }
  };

  // Reset to configured policy (clears local browser rule edits)
  const handleResetToConfiguredPolicy = () => {
    const base = baseConfiguredPreset === 'demo' ? FICTIONAL_DEMO_POLICY : DEFAULT_UNCONFIGURED_POLICY;
    updatePolicy(base);
    setIsLocallyEdited(false);
    try {
      localStorage.setItem('dustwatch_school_policy', JSON.stringify(base));
      localStorage.removeItem('dustwatch_policy_is_locally_edited');
    } catch {
      // ignore
    }
  };

  // Save edits made in browser modal
  const handleSaveModalRuleEdits = () => {
    const updatedPolicy: SchoolPolicyConfig = {
      ...schoolPolicy,
      isConfigured: editableRules.length > 0,
      rules: editableRules,
    };
    updatePolicy(updatedPolicy);
    setIsLocallyEdited(true);
    setShowPolicyModal(false);
    try {
      localStorage.setItem('dustwatch_school_policy', JSON.stringify(updatedPolicy));
      localStorage.setItem('dustwatch_policy_is_locally_edited', 'true');
    } catch {
      // ignore
    }
  };

  const handleRuleThresholdChange = (index: number, newThreshold: number) => {
    setEditableRules((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], threshold: newThreshold, value: newThreshold };
      return copy;
    });
  };

  const handleRuleActionChange = (index: number, newAction: SchoolRecommendedAction) => {
    setEditableRules((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], recommendedAction: newAction };
      return copy;
    });
  };

  const handleRuleToggleEnabled = (index: number, enabled: boolean) => {
    setEditableRules((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], enabled };
      return copy;
    });
  };

  const handleDeleteRule = (index: number) => {
    setEditableRules((prev) => prev.filter((_, i) => i !== index));
  };

  const getActionBadge = (
    actionOrAssessment?: SchoolActivityAssessment | SchoolRecommendedAction | null,
    isConfigured: boolean = true,
    dataMissing?: boolean,
    isFictionalOverride?: boolean
  ) => {
    let status: string | undefined;
    let action: SchoolRecommendedAction = 'continue';
    let isIncomplete = false;
    let isFictional = isFictionalOverride !== undefined ? isFictionalOverride : Boolean(schoolPolicy.isFictionalDemo);

    if (actionOrAssessment && typeof actionOrAssessment === 'object') {
      status = actionOrAssessment.status;
      action = actionOrAssessment.recommendedAction;
      isIncomplete = actionOrAssessment.isIncomplete;
      dataMissing = actionOrAssessment.dataMissingForAssessment;
      if (actionOrAssessment.isFictionalDemo !== undefined) {
        isFictional = actionOrAssessment.isFictionalDemo;
      }
    } else if (typeof actionOrAssessment === 'string') {
      action = actionOrAssessment as SchoolRecommendedAction;
    }

    if (!isConfigured || status === 'policy_not_configured' || status === 'policy_unconfigured') {
      return (
        <span className="bg-[#F3EADD] text-[#2D221C] border border-[#DFCBB3] px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-[#6B564B]" />
          <span>Policy Configuration Required</span>
        </span>
      );
    }

    if (status === 'human_review') {
      return (
        <span className={`px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5 ${
          isFictional
            ? 'bg-purple-100 text-purple-900 border border-purple-300'
            : 'bg-amber-100 text-amber-900 border border-amber-400'
        }`}>
          <AlertTriangle className={`w-3.5 h-3.5 ${isFictional ? 'text-purple-700' : 'text-amber-800'}`} />
          <span>{isFictional ? 'Demo: Human Review' : 'Human Review Required'}{isIncomplete ? ' (Incomplete Data)' : ''}</span>
        </span>
      );
    }

    if (status === 'no_applicable_rules') {
      return (
        <span className="bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-600" />
          <span>No Applicable Rules Configured</span>
        </span>
      );
    }

    if (status === 'not_evaluated' || status === 'assessment_unavailable' || (dataMissing && (!status || status !== 'action_triggered'))) {
      return (
        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
          <span>Not Evaluated (Missing Data)</span>
        </span>
      );
    }

    // Never display operational "Criteria Met" if assessment is incomplete or fictional demo
    if (status === 'criteria_met_no_actions') {
      if (isIncomplete || dataMissing) {
        return (
          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>Assessment Incomplete</span>
          </span>
        );
      }

      if (isFictional) {
        return (
          <span className="bg-purple-100 text-purple-900 border border-purple-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-700" />
            <span>Demonstration Result — Not Operational</span>
          </span>
        );
      }

      return (
        <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          <span>Criteria Met</span>
        </span>
      );
    }

    const cAction = canonicalAction(action);

    // If fictional demo and an action triggered, present distinctly as demonstration
    if (isFictional) {
      let demoActionLabel = 'Demo: Rule Triggered';
      if (cAction === 'suspend') demoActionLabel = 'Demo: Suspend Activity';
      else if (cAction === 'relocate') demoActionLabel = 'Demo: Relocate Indoors';
      else if (cAction === 'modify') demoActionLabel = 'Demo: Modify Activity';
      else if (cAction === 'human_review') demoActionLabel = 'Demo: Human Review';
      else if (cAction === 'continue') demoActionLabel = 'Demo: Continue Activity';

      return (
        <span className="bg-purple-100 text-purple-900 border border-purple-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-700" />
          <span>{demoActionLabel}{isIncomplete ? ' (Partial)' : ''}</span>
        </span>
      );
    }

    switch (cAction) {
      case 'suspend':
        return (
          <span className="bg-red-100 text-red-900 border border-red-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-red-700" />
            <span>Suspend Activity{isIncomplete ? ' (Incomplete Data)' : ''}</span>
          </span>
        );
      case 'relocate':
        return (
          <span className="bg-orange-100 text-orange-900 border border-orange-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-orange-700" />
            <span>Relocate Indoors{isIncomplete ? ' (Incomplete Data)' : ''}</span>
          </span>
        );
      case 'modify':
        return (
          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>Modify Activity Advised{isIncomplete ? ' (Incomplete Data)' : ''}</span>
          </span>
        );
      case 'human_review':
        return (
          <span className="bg-amber-100 text-amber-900 border border-amber-400 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-800" />
            <span>Human Review Required{isIncomplete ? ' (Incomplete Data)' : ''}</span>
          </span>
        );
      case 'continue':
      default:
        return (
          <span className="bg-[#E8F0E7] text-[#1B3A2D] border border-[#C5D9C5] px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#244C3B]" />
            <span>Continue Activity Rule Triggered{isIncomplete ? ' (Incomplete Data)' : ''}</span>
          </span>
        );
    }
  };

  // Color mapping: "Below Caution range" replaces "Normal", "not applicable" is neutral gray
  const getHeatCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Extreme Danger':
        return 'text-red-700 bg-red-100 border-red-300';
      case 'Danger':
        return 'text-orange-800 bg-orange-100 border-orange-300';
      case 'Extreme Caution':
        return 'text-amber-800 bg-amber-100 border-amber-300';
      case 'Caution':
        return 'text-yellow-800 bg-yellow-100 border-yellow-300';
      case 'Below Caution range':
        return 'text-emerald-800 bg-emerald-100 border-emerald-300';
      case 'not applicable':
      default:
        return 'text-[#2D221C] bg-[#F3EADD] border-[#DFCBB3]';
    }
  };

  if (!currentOutlook || !currentRaw || !selectedAssessment) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 dw-panel p-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[#2D221C] flex items-center gap-2">
                <School className="w-6 h-6 text-[#244C3B]" />
                <span>DustWatch School Mode</span>
              </h1>
              <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-semibold">
                Campus Data Unavailable
              </span>
            </div>
            <p className="text-xs text-[#5A453A] mt-1">
              Campus Location: <strong>{selectedCityInfo.name}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="school-city-select-fallback" className="text-xs font-semibold text-[#2D221C]">
              Campus Location:
            </label>
            <select
              id="school-city-select-fallback"
              value={selectedCityId}
              onChange={(e) => onSelectCity(e.target.value)}
              className="border border-[#DFCBB3] rounded-md px-3 py-2 text-xs font-semibold bg-[#FFFDF8] text-[#2D221C] min-h-[44px]"
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-8 text-center bg-[#FFFDF8] border border-[#DFCBB3] rounded-lg space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#2D221C]">
            Telemetry Unavailable for {selectedCityInfo.name}
          </h2>
          <p className="text-xs text-[#5A453A] max-w-lg mx-auto leading-relaxed">
            Environmental observations and hourly forecasts for the selected campus ({selectedCityInfo.name}) are currently unavailable. DustWatch isolates campus telemetry and never substitutes readings from another city.
          </p>
        </div>
      </div>
    );
  }

  const readings = selectedAssessment.environmentalReadings;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Printable Document Header (shown only when printing) */}
      <div className="hidden print:block mb-6 p-4 border-b border-black">
        <h1 className="text-xl font-bold">DustWatch School Mode Outdoor Activity Assessment</h1>
        <p className="text-sm">Campus Location: {currentOutlook.city.name} | Printed on: {new Date().toLocaleString()}</p>
        <p className="text-xs font-mono mt-1">
          Policy Source: {schoolPolicy.sourceDocument || 'School Operational Rules'} | Version: {schoolPolicy.policyVersion} | Effective Date: {schoolPolicy.effectiveDate}
        </p>
      </div>

      {/* 1. Header with UAE Location Selection, Title & Print Button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 dw-panel p-5 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#2D221C] flex items-center gap-2">
              <School className="w-6 h-6 text-[#244C3B]" />
              <span>DustWatch School Mode</span>
            </h1>
            <span className="text-xs bg-[#E8F0E7] text-[#1B3A2D] border border-[#C5D9C5] px-2 py-0.5 rounded font-semibold">
              Nurse & Staff Workflow
            </span>
          </div>
          <p className="text-xs text-[#5A453A] mt-1 max-w-2xl leading-relaxed">
            Support authorised school staff by combining environmental observations with the school’s approved outdoor activity thresholds.
          </p>
        </div>

        {/* City Selector & Print Action */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <label htmlFor="school-city-select" className="text-xs font-semibold text-[#2D221C]">
            Campus Location:
          </label>
          <select
            id="school-city-select"
            value={selectedCityId}
            onChange={(e) => onSelectCity(e.target.value)}
            className="border border-[#DFCBB3] rounded-md px-3 py-2 text-xs font-semibold bg-[#FFFDF8] text-[#2D221C] min-h-[44px]"
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 bg-[#F3EADD] hover:bg-gray-200 text-[#2D221C] border border-[#DFCBB3] rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer min-h-[44px]"
          >
            <Printer className="w-3.5 h-3.5 text-[#2D221C]" />
            <span>Print View</span>
          </button>
        </div>
      </div>

      {/* 2. Critical Separation Banner: Dust Risk vs School Activity Assessment */}
      <div className="p-4 rounded-lg bg-[#E8F0E7] border border-[#C5D9C5] text-xs text-[#2D221C] space-y-1.5 shadow-xs print:hidden">
        <div className="font-bold flex items-center gap-1.5 text-[#1B3A2D]">
          <Info className="w-4 h-4 text-[#244C3B] shrink-0" />
          <span>Understanding the Distinction Between Environmental Dust Risk and School Activity Policy</span>
        </div>
        <p className="leading-relaxed text-[#5A453A]">
          <strong>Estimated Dust Risk</strong> is the general atmospheric particulate risk across the region calculated by DustWatch.
          <strong> School Activity Assessment</strong> evaluates multi-factor environmental readings (including heat stress, particulate matter, and wind gusts) against your school’s approved administrative rules. Relative humidity IS used in the regional dust score with a 5% weighting (low humidity reflects dry conditions that facilitate airborne dust). Air temperature is NOT included in the dust score, but is combined with humidity in the separate Heat Index calculation for School Mode.
        </p>
      </div>

      {/* 2b. Mandatory Local Policy Edits Banner */}
      {isLocallyEdited && (
        <div className="p-3.5 rounded-lg bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-800 shrink-0" />
            <div>
              <span className="font-bold text-sm block">Using locally edited rules, not the school's approved policy</span>
              <span className="text-[11px] text-amber-900">
                Rule criteria have been customized in this browser. To restore approved administrative rules, reset below.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetToConfiguredPolicy}
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-md font-semibold cursor-pointer shrink-0 text-xs shadow-xs"
          >
            Reset to configured policy
          </button>
        </div>
      )}

      {/* 2c. Starter Configuration Checklist Banner */}
      {(!schoolPolicy.isConfigured || schoolPolicy.isStarterConfig) && (
        <OutlineDrawCard
          outlineColor="#E8874A"
          baseBorderColor="rgba(252, 211, 77, 0.7)"
          borderRadius={8}
          duration={0.7}
          delay={0.05}
          className="p-4 rounded-lg bg-amber-50/90 border border-amber-300 text-xs text-amber-950 space-y-3 shadow-xs"
        >
          <OutlineDrawHeading>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              <h2 className="font-bold text-sm text-amber-950">
                Starter configuration — not an approved school policy
              </h2>
            </div>
          </OutlineDrawHeading>

          <OutlineDrawBody>
            <p className="leading-relaxed text-amber-900">
              DustWatch provides this starter template with disabled example rules to help your school configure operational policies. The starter configuration does not activate example thresholds and produces no positive safety or compliance determination. Authorised school leadership must provide approved parameters.
            </p>
          </OutlineDrawBody>

          <OutlineDrawVisual>
            <div className="bg-white/80 p-3 rounded border border-amber-200 space-y-2">
              <div className="font-semibold text-xs text-amber-950">
                Required Information Checklist Before Activation:
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-[#5A453A]">
                {STARTER_REQUIRED_INFO_CHECKLIST.map((item) => (
                  <li key={item.id} className="flex items-start gap-1.5">
                    <span className="text-amber-700 font-bold shrink-0">&bull;</span>
                    <div>
                      <span className="font-semibold text-[#2D221C]">{item.title}:</span>{' '}
                      <span>{item.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </OutlineDrawVisual>
        </OutlineDrawCard>
      )}

      {/* 3. Policy Configuration Status Bar */}
      <div
        className={`p-4 rounded-lg border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
          !schoolPolicy.isConfigured || schoolPolicy.isStarterConfig
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : schoolPolicy.isFictionalDemo
            ? 'bg-purple-50 border-purple-300 text-purple-950'
            : 'bg-emerald-50 border-emerald-300 text-emerald-950'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">
              {!schoolPolicy.isConfigured || schoolPolicy.isStarterConfig
                ? 'No approved school policy configured'
                : schoolPolicy.isFictionalDemo
                ? 'FICTIONAL TEST POLICY (Demonstration Only — Not Real Policy)'
                : `Active Policy: ${schoolPolicy.schoolName}`}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/80 border">
              v{schoolPolicy.policyVersion}
            </span>
            {isLocallyEdited && (
              <span className="text-[10px] bg-amber-200 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-bold">
                Locally Edited
              </span>
            )}
          </div>
          <p className="text-[#5A453A] text-xs">
            {!schoolPolicy.isConfigured || schoolPolicy.isStarterConfig
              ? 'Approved school operational policy is required before evaluating recommendations. Displaying unconfigured starter state.'
              : schoolPolicy.isFictionalDemo
              ? 'This policy uses fictional demonstration thresholds for testing the rule engine. It must not be mistaken for operational school guidance.'
              : `Effective: ${schoolPolicy.effectiveDate}. Source: ${schoolPolicy.sourceDocument || 'School Safety Guidelines'}.`}
          </p>
        </div>

        {/* Quick Demo Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap print:hidden">
          {!schoolPolicy.isConfigured || schoolPolicy.isStarterConfig ? (
            <button
              type="button"
              onClick={handleLoadFictionalDemo}
              className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-md text-xs font-semibold cursor-pointer min-h-[44px]"
            >
              Load Fictional Test Policy (Demo)
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResetToUnconfigured}
              className="px-3 py-2 bg-[#FFFDF8] border border-[#DFCBB3] hover:bg-[#F3EADD] text-[#2D221C] rounded-md text-xs font-semibold cursor-pointer min-h-[44px]"
            >
              Reset to Starter State
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditableRules(schoolPolicy.rules);
              setShowPolicyModal(true);
            }}
            className="px-3 py-2 bg-[#FFFDF8] border border-[#DFCBB3] hover:bg-[#F7F1E8] text-[#2D221C] rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer min-h-[44px]"
          >
            <Settings className="w-3.5 h-3.5 text-[#6B564B]" />
            <span>View / Edit Policy Rules</span>
          </button>
        </div>
      </div>

      {/* 4. Side-by-Side Dual Assessment Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Card: Estimated Dust Risk */}
        <OutlineDrawCard
          outlineColor="#E8874A"
          baseBorderColor="rgba(213, 217, 223, 0.6)"
          borderRadius={8}
          duration={0.7}
          delay={0}
          className="dw-panel p-4 space-y-2"
        >
          <OutlineDrawHeading>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#5A453A]">
                Regional Dust Risk (DustWatch)
              </span>
              <span
                style={{
                  backgroundColor: APP_CONFIG.colors[currentOutlook.peakLevel].badgeBg,
                  color: APP_CONFIG.colors[currentOutlook.peakLevel].badgeText,
                  borderColor: APP_CONFIG.colors[currentOutlook.peakLevel].border,
                }}
                className="px-2.5 py-0.5 rounded text-xs font-bold border"
              >
                {currentOutlook.peakLevel} Peak
              </span>
            </div>
          </OutlineDrawHeading>

          <OutlineDrawBody>
            <p className="text-xs text-[#5A453A] leading-relaxed">
              Atmospheric model score based on PM10, dust concentration, wind speed, gusts, AOD, humidity (5% weight), and visibility.
            </p>
          </OutlineDrawBody>

          <OutlineDrawVisual>
            <div className="text-xs text-[#2D221C] pt-1 border-t border-gray-100 flex justify-between">
              <span>Peak 3-Hour Window:</span>
              <span className="font-semibold">{currentOutlook.worstWindow.displayRange}</span>
            </div>
          </OutlineDrawVisual>
        </OutlineDrawCard>

        {/* Right Card: School Activity Status */}
        <OutlineDrawCard
          outlineColor="#244C3B"
          baseBorderColor="rgba(213, 217, 223, 0.6)"
          borderRadius={8}
          duration={0.7}
          delay={0.1}
          className="dw-panel p-4 space-y-2"
        >
          <OutlineDrawHeading>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#5A453A]">
                School Activity Status ({selectedActivity.toUpperCase()})
              </span>
              {getActionBadge(currentActivityAssessment, schoolPolicy.isConfigured && !schoolPolicy.isStarterConfig)}
            </div>
          </OutlineDrawHeading>

          <OutlineDrawBody>
            <p className="text-xs text-[#2D221C] font-medium">
              {currentActivityAssessment?.actionTitle}
            </p>
          </OutlineDrawBody>

          <OutlineDrawVisual>
            <div className="text-xs text-[#5A453A] pt-1 border-t border-gray-100 flex justify-between">
              <span>Rule Evaluation:</span>
              <span>
                {schoolPolicy.isConfigured && !schoolPolicy.isStarterConfig
                  ? schoolPolicy.isFictionalDemo
                    ? `${currentActivityAssessment?.triggeredRules.filter((r) => r.isTriggered).length || 0} fictional thresholds triggered (demo)`
                    : `${currentActivityAssessment?.triggeredRules.filter((r) => r.isTriggered).length || 0} policy thresholds triggered`
                  : 'Awaiting verified policy'}
              </span>
            </div>
          </OutlineDrawVisual>
        </OutlineDrawCard>
      </div>

      {/* 5. Environmental Conditions Dashboard */}
      <div className="dw-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#DFCBB3] pb-3">
          <div>
            <h2 className="text-base font-bold text-[#2D221C] flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-600" />
              <span>Environmental Conditions Dashboard</span>
            </h2>
            <p className="text-xs text-[#5A453A]">
              Hourly meteorological, particulate matter, and precipitation telemetry for {currentOutlook.city.name} at {selectedAssessment.displayHour} GST.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#5A453A]">
            <Clock className="w-3.5 h-3.5" />
            <span>Updated: {lastUpdatedFormatted}</span>
          </div>
        </div>

        {/* Precipitation Semantics: Distinction between Current NWP Model Estimate and Hourly Forecast */}
        <div className="p-3.5 rounded-lg bg-[#E8F0E7] border border-[#C5D9C5] text-xs space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-b border-[#C5D9C5] pb-2">
            <div className="font-bold text-[#1B3A2D] flex items-center gap-2 flex-wrap">
              <CloudRain className="w-4 h-4 text-[#244C3B] shrink-0" />
              <span>Precipitation Analysis: Current Model Estimate vs Hourly Forecast</span>
              {isDemoMode && (
                <span className="text-[10px] bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-700" />
                  <span>DEMO — SIMULATED RAINFALL</span>
                </span>
              )}
            </div>
            <span className="text-[11px] text-[#1B3A2D] bg-[#E8F0E7] px-2 py-0.5 rounded font-medium">
              Model Step: {currentPrecipitation?.intervalSeconds ? `${Math.round(currentPrecipitation.intervalSeconds / 60)} min` : '15 min'} • Timestamp: {currentPrecipitation?.time ? currentPrecipitation.time.replace('T', ' ') : 'N/A'} GST
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="bg-white/85 p-2.5 rounded border border-[#C5D9C5]">
              <div className="font-semibold text-[#1B3A2D] mb-1 flex items-center justify-between">
                <span>Current NWP Model Estimate ({currentPrecipitation?.time ? currentPrecipitation.time.split('T')[1] || currentPrecipitation.time : 'Current'})</span>
                <span className="text-[10px] text-[#6B564B] font-normal">
                  {isDemoMode ? 'Simulated demonstration estimate (15-min step)' : 'NWP model, not radar observation'}
                </span>
              </div>
              {currentPrecipitation && currentPrecipitation.isAvailable && !currentPrecipitation.isStale ? (
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <div>
                    <span className="text-[#5A453A]">Total Precip:</span>{' '}
                    <strong className="text-[#2D221C]">
                      {currentPrecipitation.precipitation !== null ? `${currentPrecipitation.precipitation} mm` : 'Not available'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#5A453A]">Rain:</span>{' '}
                    <strong className="text-[#2D221C]">
                      {currentPrecipitation.rain !== null ? `${currentPrecipitation.rain} mm` : 'Not available'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#5A453A]">Showers:</span>{' '}
                    <strong className="text-[#2D221C]">
                      {currentPrecipitation.showers !== null ? `${currentPrecipitation.showers} mm` : 'Not available'}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="text-amber-800 font-medium text-xs">
                  {currentPrecipitation?.isStale ? 'Current precipitation telemetry is stale (>2h old)' : 'Not available'}
                </div>
              )}
              <div className="text-[10px] text-[#5A453A] mt-1.5 leading-tight">
                {isDemoMode ? (
                  <span className="text-purple-950 font-medium">
                    <strong>Demonstration Mode:</strong> Precipitation values are simulated test data corresponding to the dashboard convective scenario. Never used for real-time school operations.
                  </span>
                ) : (
                  <span>
                    Represents liquid precipitation equivalent over preceding model interval. Zero current rain does not infer dry future hours; conversely, future forecast rain does not imply current precipitation. Missing values are never assumed zero.
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white/85 p-2.5 rounded border border-[#C5D9C5]">
              <div className="font-semibold text-[#1B3A2D] mb-1 flex items-center justify-between">
                <span>Forecast for Selected Hour ({selectedAssessment.displayHour} GST)</span>
                <span className="text-[10px] text-[#6B564B] font-normal">
                  {isDemoMode ? 'Simulated 1-hr forecast accumulation' : '1-hour accumulation'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <div>
                  <span className="text-[#5A453A]">1-Hr Total:</span>{' '}
                  <strong className="text-[#2D221C]">
                    {readings.precipitation !== null ? `${readings.precipitation} mm` : readings.accumulatedRain !== null ? `${readings.accumulatedRain} mm` : 'Not available'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#5A453A]">Rain:</span>{' '}
                  <strong className="text-[#2D221C]">
                    {readings.rain !== null ? `${readings.rain} mm` : 'Not available'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#5A453A]">Showers:</span>{' '}
                  <strong className="text-[#2D221C]">
                    {readings.showers !== null ? `${readings.showers} mm` : 'Not available'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#5A453A]">Probability:</span>{' '}
                  <strong className="text-[#2D221C]">
                    {readings.precipitationProbability !== null ? `${readings.precipitationProbability} %` : 'Not available'}
                  </strong>
                </div>
              </div>
              <div className="text-[10px] text-[#5A453A] mt-1.5 leading-tight">
                Hourly values represent cumulative 1-hour total precipitation and component forecasts, not instantaneous rainfall observations.
              </div>
            </div>
          </div>
        </div>

        {/* Environmental Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Temperature */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
            <div className="text-[#5A453A] font-medium flex items-center gap-1 mb-1">
              <Thermometer className="w-3.5 h-3.5 text-red-600" />
              <span>Air Temperature</span>
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.temperature !== null ? `${readings.temperature} °C` : <span className="text-[#6B564B] font-normal text-xs">not applicable</span>}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">Forecast (2m ambient)</div>
          </div>

          {/* Relative Humidity */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
            <div className="text-[#5A453A] font-medium flex items-center gap-1 mb-1">
              <Sun className="w-3.5 h-3.5 text-[#244C3B]" />
              <span>Relative Humidity</span>
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.relativeHumidity !== null ? `${readings.relativeHumidity} %` : <span className="text-[#6B564B] font-normal text-xs">not applicable</span>}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">Used in dust score (5% wt)</div>
          </div>

          {/* Combined Heat Index: Categories labeled NWS general reference, no example thresholds */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-amber-50/40">
            <div className="text-[#5A453A] font-medium flex items-center justify-between gap-1 mb-1">
              <span>Heat Index (Apparent)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${getHeatCategoryColor(readings.heatIndex.category)}`}>
                {readings.heatIndex.category}
              </span>
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.heatIndex.heatIndexCelsius !== null
                ? `${readings.heatIndex.heatIndexCelsius} °C`
                : <span className="text-[#6B564B] font-normal text-xs">not applicable</span>}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5 font-medium">
              NWS general reference, not school policy
            </div>
          </div>

          {/* 1-Hour Total Precipitation */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#E8F0E7]">
            <div className="text-[#5A453A] font-medium flex items-center justify-between gap-1 mb-1">
              <span className="flex items-center gap-1">
                <CloudRain className="w-3.5 h-3.5 text-[#244C3B]" />
                <span>1-Hr Total Precip</span>
              </span>
              {isDemoMode && (
                <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-purple-100 text-purple-900 border border-purple-200">
                  Demo
                </span>
              )}
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.precipitation !== null ? (
                `${readings.precipitation} mm`
              ) : readings.accumulatedRain !== null ? (
                `${readings.accumulatedRain} mm`
              ) : (
                <span className="text-[#6B564B] font-normal text-xs">Not available</span>
              )}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">
              {isDemoMode ? 'Simulated 1-hr accum' : '1-hr forecast accum'}
            </div>
          </div>

          {/* Rain / Showers / Probability */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#E8F0E7]">
            <div className="text-[#5A453A] font-medium flex items-center justify-between gap-1 mb-1">
              <span className="flex items-center gap-1">
                <CloudRain className="w-3.5 h-3.5 text-[#244C3B]" />
                <span>Rain / Probability</span>
              </span>
              {isDemoMode && (
                <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-purple-100 text-purple-900 border border-purple-200">
                  Demo
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-[#2D221C]">
              {readings.rain !== null ? `${readings.rain} mm rain` : 'Not available'}{' '}
              <span className="text-xs font-normal text-[#5A453A]">
                ({readings.precipitationProbability !== null ? `${readings.precipitationProbability}%` : 'Not available'})
              </span>
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">
              Showers: {readings.showers !== null ? `${readings.showers} mm` : 'Not available'}
            </div>
          </div>

          {/* PM10 Particles */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
            <div className="text-[#5A453A] font-medium flex items-center gap-1 mb-1">
              <Eye className="w-3.5 h-3.5 text-purple-600" />
              <span>PM10 Particulate</span>
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.pm10 !== null ? `${readings.pm10} µg/m³` : <span className="text-[#6B564B] font-normal text-xs">not applicable</span>}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">Model-based estimate (CAMS)</div>
          </div>

          {/* PM2.5 Particles */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
            <div className="text-[#5A453A] font-medium flex items-center gap-1 mb-1">
              <Eye className="w-3.5 h-3.5 text-[#244C3B]" />
              <span>PM2.5 Fine Particles</span>
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.pm2_5 !== null ? `${readings.pm2_5} µg/m³` : <span className="text-[#6B564B] font-normal text-xs">not applicable</span>}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">Model-based estimate (CAMS)</div>
          </div>

          {/* Mineral Dust Concentration */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
            <div className="text-[#5A453A] font-medium flex items-center gap-1 mb-1">
              <Wind className="w-3.5 h-3.5 text-amber-700" />
              <span>Mineral Dust</span>
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.dust !== null ? `${readings.dust} µg/m³` : <span className="text-[#6B564B] font-normal text-xs">not applicable</span>}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">Atmospheric forecast (CAMS)</div>
          </div>

          {/* Wind Speed & Gusts */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
            <div className="text-[#5A453A] font-medium flex items-center gap-1 mb-1">
              <Wind className="w-3.5 h-3.5 text-[#244C3B]" />
              <span>Wind Speed & Gusts</span>
            </div>
            <div className="text-base font-bold text-[#2D221C]">
              {readings.windSpeed !== null ? `${readings.windSpeed} km/h` : 'N/A'}{' '}
              <span className="text-xs font-normal text-[#5A453A]">
                (Gusts: {readings.windGusts !== null ? `${readings.windGusts} km/h` : 'N/A'})
              </span>
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">
              Direction: {readings.windDirection !== null ? `${readings.windDirection}°` : 'N/A'}
            </div>
          </div>

          {/* Horizontal Visibility */}
          <div className="p-3 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
            <div className="text-[#5A453A] font-medium flex items-center gap-1 mb-1">
              <Eye className="w-3.5 h-3.5 text-[#2D221C]" />
              <span>Horizontal Visibility</span>
            </div>
            <div className="text-lg font-bold text-[#2D221C]">
              {readings.visibility !== null ? `${readings.visibility} m` : <span className="text-[#6B564B] font-normal text-xs">not applicable</span>}
            </div>
            <div className="text-[10px] text-[#5A453A] mt-0.5">Atmospheric visibility</div>
          </div>
        </div>

        {/* NCM Early Warning System link with exact required text */}
        <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
            <span className="text-amber-950 font-medium">
              Official warning status unavailable — check ncm.ae.
            </span>
          </div>
          <a
            href="https://mobile.ncm.gov.ae/maps-warnings?lang=en"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#244C3B] hover:text-[#1B3A2D] underline font-semibold flex items-center gap-1 shrink-0"
          >
            <span>NCM Warnings Portal</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* 6. Hourly School Activity Recommendations */}
      <div className="dw-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#DFCBB3] pb-3">
          <div>
            <h2 className="text-base font-bold text-[#2D221C] flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-[#244C3B]" />
              <span>12-Hour Activity Schedule Recommendations</span>
            </h2>
            <p className="text-xs text-[#5A453A]">
              Evaluated against school approved policy precedence rules. Select an hour to inspect triggered conditions.
            </p>
          </div>

          {/* Activity Category Tabs: Break, PE, Lunch, Assembly - Smooth Horizontal Touch Scroll */}
          <div
            role="tablist"
            aria-label="School Activity Tabs"
            className="flex items-center bg-[#F3EADD] p-1 rounded-lg border border-[#DFCBB3] overflow-x-auto no-scrollbar max-w-full gap-1 w-full sm:w-auto touch-pan-x"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedActivity === 'break'}
              onClick={() => setSelectedActivity('break')}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap interactive-tap flex items-center justify-center ${
                selectedActivity === 'break'
                  ? 'bg-[#FFFDF8] text-[#244C3B] shadow-xs'
                  : 'text-[#5A453A] hover:text-[#2D221C]'
              }`}
            >
              Outdoor Break
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedActivity === 'pe'}
              onClick={() => setSelectedActivity('pe')}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap interactive-tap flex items-center justify-center ${
                selectedActivity === 'pe'
                  ? 'bg-[#FFFDF8] text-[#244C3B] shadow-xs'
                  : 'text-[#5A453A] hover:text-[#2D221C]'
              }`}
            >
              Physical Education (PE)
            </button>
            {showLunch && (
              <button
                type="button"
                role="tab"
                aria-selected={selectedActivity === 'lunch_other'}
                onClick={() => setSelectedActivity('lunch_other')}
                className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap interactive-tap flex items-center justify-center ${
                  selectedActivity === 'lunch_other'
                    ? 'bg-[#FFFDF8] text-[#244C3B] shadow-xs'
                    : 'text-[#5A453A] hover:text-[#2D221C]'
                }`}
              >
                Lunch / Outdoor Play
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={selectedActivity === 'assembly'}
              onClick={() => setSelectedActivity('assembly')}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer min-h-[44px] whitespace-nowrap interactive-tap flex items-center justify-center ${
                selectedActivity === 'assembly'
                  ? 'bg-[#FFFDF8] text-[#244C3B] shadow-xs'
                  : 'text-[#5A453A] hover:text-[#2D221C]'
              }`}
            >
              Outdoor Assembly
            </button>
          </div>
        </div>

        {/* 12-Hour Selector Pills - Touch-friendly 44px targets with smooth horizontal scrolling */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 print:grid print:grid-cols-6 print:gap-2 touch-pan-x">
          {hourlyAssessments.map((item, idx) => {
            const isSelected = selectedHourIndex === idx;
            const actAssessment = item.activityAssessments[selectedActivity];
            const action = actAssessment.recommendedAction;
            const cAction = canonicalAction(action);
            const isFictional = Boolean(schoolPolicy.isFictionalDemo || actAssessment.isFictionalDemo);
            let badgeBg = 'bg-[#F3EADD] text-[#2D221C] border-[#DFCBB3]';
            let labelText = cAction.replace('_', ' ');

            if (!schoolPolicy.isConfigured || schoolPolicy.isStarterConfig || actAssessment.status === 'policy_not_configured' || actAssessment.status === 'policy_unconfigured') {
              labelText = 'Pending';
              badgeBg = 'bg-[#F3EADD] text-[#2D221C] border-[#DFCBB3]';
            } else if (actAssessment.status === 'human_review') {
              badgeBg = isFictional ? 'bg-purple-50 text-purple-900 border-purple-300' : 'bg-amber-100 text-amber-900 border-amber-400';
              labelText = isFictional ? 'Demo: Review' : 'Review';
            } else if (actAssessment.status === 'not_evaluated' || actAssessment.status === 'assessment_unavailable') {
              badgeBg = 'bg-amber-50 text-amber-900 border-amber-300';
              labelText = 'Data Missing';
            } else if (actAssessment.status === 'no_applicable_rules') {
              badgeBg = 'bg-slate-100 text-slate-800 border-slate-300';
              labelText = 'No Rules';
            } else if (actAssessment.status === 'criteria_met_no_actions') {
              if (isFictional) {
                badgeBg = 'bg-purple-50 text-purple-900 border-purple-200';
                labelText = 'Demo — Below Limits';
              } else {
                badgeBg = 'bg-emerald-50 text-emerald-900 border-emerald-200';
                labelText = 'Criteria Met';
              }
            } else {
              if (isFictional) {
                badgeBg = 'bg-purple-50 text-purple-900 border-purple-200';
                labelText = `Demo: ${cAction}`;
                if (actAssessment.isIncomplete) {
                  labelText += ' (Partial)';
                }
              } else {
                if (cAction === 'continue') badgeBg = 'bg-[#E8F0E7] text-[#1B3A2D] border-[#C5D9C5]';
                if (cAction === 'modify') badgeBg = 'bg-amber-50 text-amber-900 border-amber-200';
                if (cAction === 'relocate') badgeBg = 'bg-orange-50 text-orange-900 border-orange-200';
                if (cAction === 'suspend') badgeBg = 'bg-red-50 text-red-900 border-red-200';
                labelText = cAction;
                if (actAssessment.isIncomplete) {
                  labelText += ' (Partial)';
                }
              }
            }

            return (
              <button
                key={item.hourIndex}
                type="button"
                onClick={() => setSelectedHourIndex(idx)}
                aria-pressed={isSelected}
                className={`px-3 py-2 rounded-lg border text-xs flex flex-col items-center justify-center min-w-[76px] min-h-[46px] cursor-pointer transition-all interactive-tap shrink-0 ${badgeBg} ${
                  isSelected ? 'ring-2 ring-[#244C3B]/25 font-bold shadow-xs' : 'hover:opacity-85'
                }`}
              >
                <span className="font-semibold">{item.displayHour}</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold opacity-85 mt-0.5">
                  {labelText}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Hour Policy Decision Detail Box */}
        <div className="p-4 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#2D221C]">
                {selectedAssessment.displayHour} GST {schoolPolicy.isFictionalDemo ? 'Demonstration Result:' : 'Recommendation:'}
              </span>
              {getActionBadge(currentActivityAssessment, schoolPolicy.isConfigured && !schoolPolicy.isStarterConfig)}
            </div>

            {currentActivityAssessment.conflictingRules && (
              <span className="text-xs bg-red-100 text-red-900 border border-red-300 px-2 py-0.5 rounded font-semibold">
                Conflicting policy conditions flagged for authorized staff
              </span>
            )}
          </div>

          {/* Action Title and Primary Guidance */}
          <div className={`p-3 rounded-md border space-y-1 ${
            schoolPolicy.isFictionalDemo ? 'bg-purple-50/40 border-purple-200' : 'bg-[#FFFDF8] border-[#DFCBB3]'
          }`}>
            <h3 className="font-bold text-sm text-[#2D221C]">
              {currentActivityAssessment.actionTitle}
            </h3>
            <p className="text-xs text-[#5A453A] leading-relaxed">
              {currentActivityAssessment.primaryGuidance}
            </p>
          </div>

          {/* Policy Metadata Display (Shown on every result card and print view) */}
          <div className="text-[11px] text-[#5A453A] bg-[#FFFDF8] p-2.5 rounded border border-[#DFCBB3] flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Policy Source:</strong> {schoolPolicy.sourceDocument || 'School Operational Rules'}
            </span>
            <span>
              <strong>Version:</strong> {schoolPolicy.policyVersion}
            </span>
            <span>
              <strong>Effective Date:</strong> {schoolPolicy.effectiveDate}
            </span>
          </div>

          {/* Triggered Rules Breakdown */}
          <div>
            <div className="text-xs font-semibold text-[#5A453A] mb-2">
              Policy Rule Evaluation & Triggered Conditions
            </div>

            {!schoolPolicy.isConfigured || currentActivityAssessment.status === 'policy_unconfigured' ? (
              <p className="text-xs text-[#5A453A] italic">
                School policy has not been configured yet. Approved school thresholds must be supplied.
              </p>
            ) : currentActivityAssessment.status === 'no_applicable_rules' ? (
              <div className="p-3 bg-slate-50 border border-slate-300 rounded text-xs text-slate-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-slate-900">
                  <Info className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>No Applicable Rules Configured for {selectedActivity === 'break' ? 'Outdoor Break' : selectedActivity === 'pe' ? 'Physical Education (PE)' : 'Lunch'}</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  The active school policy contains zero rules that apply to this activity. Displaying distinct unconfigured rules state.
                </p>
              </div>
            ) : currentActivityAssessment.status === 'assessment_unavailable' ? (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Assessment Unavailable: Required Environmental Data Is Missing</span>
                </div>
                <p className="text-amber-900 leading-relaxed">
                  One or more required environmental readings are unavailable and cannot be verified against school thresholds. Do not assume conditions are safe.
                </p>
              </div>
            ) : currentActivityAssessment.status === 'criteria_met_no_actions' ? (
              schoolPolicy.isFictionalDemo ? (
                <p className="text-xs text-purple-900 bg-purple-50 p-2.5 rounded border border-purple-200">
                  No fictional demonstration thresholds were exceeded for this hour. This result is for rule-engine testing only and is not an operational safety determination or approval for outdoor activities.
                </p>
              ) : (
                <p className="text-xs text-emerald-800 bg-emerald-50/80 p-2.5 rounded border border-emerald-200">
                  Conditions meet the configured criteria for this activity under current policy rules. No threshold was exceeded.
                </p>
              )
            ) : (
              <div className="space-y-2">
                {currentActivityAssessment.isIncomplete && (
                  <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Incomplete Assessment: Configured action triggered, but some applicable environmental readings were missing or invalid.</span>
                  </div>
                )}
                {currentActivityAssessment.triggeredRules
                  .filter((r) => r.isTriggered)
                  .map((tr) => (
                    <div
                      key={tr.rule.id}
                      className={`p-2.5 rounded border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        schoolPolicy.isFictionalDemo
                          ? 'bg-purple-50/40 border-purple-200'
                          : 'bg-[#FFFDF8] border-amber-200'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-[#2D221C]">
                          {schoolPolicy.isFictionalDemo ? `[Demo Test Rule] ${tr.rule.name}` : tr.rule.name}
                        </div>
                        <div className="text-[11px] text-[#5A453A]">
                          Triggered: Rule <code>{tr.rule.id}</code> on metric <code>{tr.rule.metric}</code> ({tr.observedValue} {tr.unit})
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase shrink-0 border ${
                        schoolPolicy.isFictionalDemo
                          ? 'bg-purple-100 text-purple-900 border-purple-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}>
                        {schoolPolicy.isFictionalDemo ? `DEMO: ${tr.rule.recommendedAction.replace('_', ' ')}` : tr.rule.recommendedAction.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Gemini AI Plain Language Explanation */}
          <div className="pt-2 border-t border-[#DFCBB3] print:hidden space-y-2.5">
            {isDemoMode && (
              <div
                data-testid="demo-mode-school-disclaimer"
                className="p-3.5 rounded-md bg-purple-50 border-2 border-purple-300 text-purple-950 text-xs shadow-xs space-y-1"
              >
                <div className="font-bold flex items-center gap-1.5 text-purple-900 uppercase tracking-wide text-xs">
                  <Sparkles className="w-4 h-4 text-purple-700 shrink-0" />
                  <span>DEMONSTRATION ONLY — FICTIONAL DATA</span>
                </div>
                <p className="leading-relaxed text-purple-900 font-medium">
                  This AI-generated guidance uses simulated environmental data and a fictional school policy for demonstration purposes. It is not an assessment of actual school conditions and must not be used for real-world safety decisions.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2D221C]">
                <Sparkles className="w-3.5 h-3.5 text-[#244C3B]" />
                <span>Plain-Language Summary for School Staff:</span>
              </div>
              {isDemoMode && isAiGenerated && (
                <span className="text-[10px] bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-700" />
                  <span>AI-Generated Demonstration Guidance</span>
                </span>
              )}
            </div>

            {isAiLoading ? (
              <p className="text-xs text-[#5A453A] italic">Preparing summary...</p>
            ) : (
              <div
                className={`p-2.5 rounded border text-xs text-[#2D221C] leading-relaxed ${
                  isDemoMode && isAiGenerated
                    ? 'bg-purple-50/40 border-purple-300'
                    : 'bg-[#FFFDF8] border-[#DFCBB3]'
                }`}
              >
                {isDemoMode && isAiGenerated && (
                  <div className="text-[10px] font-semibold text-purple-800 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <span>Simulated Advisory Guidance</span>
                  </div>
                )}
                <p>{aiSummary || currentActivityAssessment.primaryGuidance}</p>
              </div>
            )}

            <p className="text-[10px] text-[#5A453A] mt-1">
              {isDemoMode && isAiGenerated
                ? 'AI-generated demonstration guidance based on simulated environmental data and fictional school policy rules.'
                : isAiGenerated
                ? 'Explanation generated by Gemini AI from precomputed risk and policy evaluation facts.'
                : schoolPolicy.isFictionalDemo && !isDemoMode
                ? 'AI summary generation is gated for fictional demonstration data. Standard rule-based guidance is displayed.'
                : schoolPolicy.isFictionalDemo && isDemoMode && (currentActivityAssessment.status === 'assessment_unavailable' || currentActivityAssessment.isIncomplete || currentActivityAssessment.dataMissingForAssessment)
                ? 'AI summary generation is gated when simulated environmental readings are missing or incomplete.'
                : currentActivityAssessment.status === 'no_applicable_rules'
                ? 'AI summary generation is gated when no rules apply to the selected activity.'
                : currentActivityAssessment.status === 'assessment_unavailable' || currentActivityAssessment.isIncomplete
                ? 'AI summary generation is gated when environmental readings are missing or incomplete.'
                : !schoolPolicy.isConfigured
                ? 'AI summary generation is gated until school policy is configured.'
                : 'Standard rule-based guidance. DustWatch supports authorised staff; final authority remains with school leadership.'}
            </p>
          </div>
        </div>
      </div>

      {/* 7. Policy Editor / Viewer Modal */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFDF8] rounded-lg border border-[#DFCBB3] shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#DFCBB3] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-[#2D221C]">
                  School Policy Thresholds Configuration & Rules
                </h3>
                <p className="text-xs text-[#5A453A]">
                  View and adjust operational rules. Any modification will be clearly marked as locally edited.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPolicyModal(false)}
                className="p-1.5 text-[#6B564B] hover:text-black rounded"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
                <strong>Policy Verification Notice:</strong> Operational school rules must be officially ratified by school administration and health officers. Any browser edits must not be mistaken for official administrative ratification.
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-sm text-[#2D221C]">
                    Configured Activity Rules ({editableRules.length})
                  </div>
                  {isLocallyEdited && (
                    <button
                      type="button"
                      onClick={handleResetToConfiguredPolicy}
                      className="text-xs text-[#244C3B] hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset to configured policy</span>
                    </button>
                  )}
                </div>

                {editableRules.length === 0 ? (
                  <p className="text-[#6B564B] italic py-4 text-center">
                    No rules configured. Load the fictional test policy or input approved rules.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {editableRules.map((r, i) => (
                      <div key={r.id || i} className="p-3 rounded border border-[#DFCBB3] bg-[#F7F1E8] space-y-2">
                        <div className="flex items-center justify-between font-bold text-[#2D221C]">
                          <span>{r.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-[#E8F0E7] text-[#1B3A2D] px-1.5 py-0.2 rounded border font-mono">
                              {r.activity.toUpperCase()}
                            </span>
                            <span className="text-[10px] bg-[#F3EADD] text-[#2D221C] px-1.5 py-0.2 rounded border font-mono">
                              {r.sourceClassification || 'school_internal_policy'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(i)}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Delete rule"
                              aria-label={`Delete rule ${r.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 items-center">
                          <label className="text-[11px] text-[#2D221C] flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={r.enabled !== false}
                              onChange={(e) => handleRuleToggleEnabled(i, e.target.checked)}
                              className="rounded text-[#244C3B]"
                            />
                            <span className="font-semibold">{r.enabled !== false ? 'Enabled' : 'Disabled'}</span>
                          </label>

                          <label className="text-[11px] text-[#2D221C] flex items-center justify-between">
                            <span>Threshold ({r.unit}):</span>
                            <input
                              type="number"
                              value={r.threshold ?? ''}
                              placeholder="Disabled"
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                handleRuleThresholdChange(i, val as any);
                              }}
                              className="w-20 px-2 py-1 border rounded bg-[#FFFDF8] font-mono text-right"
                            />
                          </label>

                          <label className="text-[11px] text-[#2D221C] flex items-center justify-between">
                            <span>Action:</span>
                            <select
                              value={r.recommendedAction}
                              onChange={(e) => handleRuleActionChange(i, e.target.value as SchoolRecommendedAction)}
                              className="px-2 py-1 border rounded bg-[#FFFDF8] text-xs"
                            >
                              <option value="continue">continue</option>
                              <option value="modify">modify</option>
                              <option value="relocate">relocate</option>
                              <option value="suspend">suspend</option>
                              <option value="human_review">human_review</option>
                            </select>
                          </label>
                        </div>

                        <div className="text-[11px] text-[#6B564B]">
                          Metric: <code>{r.metric}</code> {r.operator} {r.threshold !== null ? r.threshold : '(null - disabled)'} {r.unit} &rarr; Action: <strong>{r.recommendedAction}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#DFCBB3] bg-[#F7F1E8] flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleLoadFictionalDemo}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Load Fictional Demo Preset
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPolicyModal(false)}
                  className="px-3 py-2 bg-[#FFFDF8] border border-[#DFCBB3] hover:bg-[#F3EADD] text-[#2D221C] rounded text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModalRuleEdits}
                  className="px-4 py-2 bg-[#244C3B] hover:bg-[#244C3B] text-white rounded text-xs font-semibold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
