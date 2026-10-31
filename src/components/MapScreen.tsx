/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Clock,
  Compass,
  ExternalLink,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { APP_CONFIG, CITIES } from '../config.ts';
import { STRINGS } from '../strings.ts';
import { CityOutlook, HourlyRiskResult } from '../types.ts';
import { UaeMap } from './UaeMap.tsx';
import { CityList } from './CityList.tsx';
import { TimelineChart } from './TimelineChart.tsx';
import { AdvicePanel } from './AdvicePanel.tsx';
import { WhyThisRating } from './WhyThisRating.tsx';

interface MapScreenProps {
  outlooks: Record<string, CityOutlook>;
  selectedCityId: string;
  onSelectCity: (cityId: string) => void;
  lastUpdatedFormatted: string;
  isDemoMode?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onToggleDemoMode?: () => void;
  onSelectScreen?: (screen: 'home' | 'map' | 'school-mode' | 'how-it-works' | 'accuracy' | 'test-view') => void;
}

/**
 * Animated numerical counter component that smoothly transitions number changes
 * without modifying values or causing layout jitter.
 */
const AnimatedScore: React.FC<{ value: number }> = ({ value }) => {
  const shouldReduceMotion = useReducedMotion();
  const rounded = Math.round(value);
  const [displayValue, setDisplayValue] = useState(rounded);

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayValue(rounded);
      return;
    }

    const startValue = displayValue;
    const diff = rounded - startValue;
    if (diff === 0) return;

    const startTime = performance.now();
    const duration = 220; // Fast 220ms settling

    let animId: number;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + diff * ease);
      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [rounded, shouldReduceMotion]);

  return <span className="font-mono tabular-nums">{displayValue}</span>;
};

export const MapScreen: React.FC<MapScreenProps> = ({
  outlooks,
  selectedCityId,
  onSelectCity,
  lastUpdatedFormatted,
  isDemoMode = false,
  onRefresh,
  isRefreshing = false,
  onToggleDemoMode,
}) => {
  const [viewMode, setViewMode] = useState<'highest12h' | 'now'>('now');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(true);
  const shouldReduceMotion = useReducedMotion();

  // Currently selected city outlook
  const currentOutlook = outlooks[selectedCityId] || outlooks[APP_CONFIG.defaultSelectedCityId];

  // Selected hour index within the 12-hour outlook
  const [selectedHourIndex, setSelectedHourIndex] = useState<number>(0);

  useEffect(() => {
    if (currentOutlook) {
      if (viewMode === 'now') {
        setSelectedHourIndex(0);
      } else {
        setSelectedHourIndex(currentOutlook.peakHourIndex);
      }
    }
  }, [currentOutlook?.city.id, viewMode, currentOutlook?.peakHourIndex]);

  const handleSelectViewMode = (mode: 'now' | 'highest12h') => {
    setViewMode(mode);
    if (currentOutlook) {
      if (mode === 'now') {
        setSelectedHourIndex(0);
      } else {
        setSelectedHourIndex(currentOutlook.peakHourIndex);
      }
    }
  };

  if (!currentOutlook) {
    return (
      <div className="p-12 text-center text-[#5F6762] space-y-2">
        <div className="w-8 h-8 mx-auto border-2 border-[#244C3B] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Loading UAE DustWatch atmospheric telemetry...</p>
      </div>
    );
  }

  const selectedHourResult: HourlyRiskResult =
    currentOutlook.hourlyResults[selectedHourIndex] || currentOutlook.hourlyResults[0];

  const levelNowCfg = APP_CONFIG.colors[currentOutlook.levelNow];
  const peakLevelCfg = APP_CONFIG.colors[currentOutlook.peakLevel];
  const activePeriodLevel = viewMode === 'now' ? currentOutlook.levelNow : currentOutlook.peakLevel;
  const activePeriodScore = viewMode === 'now' ? currentOutlook.scoreNow : currentOutlook.peakScore;
  const activePeriodCfg = APP_CONFIG.colors[activePeriodLevel];

  const getConfidenceBadgeColor = (conf: 'Low' | 'Medium' | 'High') => {
    switch (conf) {
      case 'High':
        return 'bg-[#E8EEE9] text-[#244C3B] border-[#244C3B]/30';
      case 'Medium':
        return 'bg-amber-50 text-amber-900 border-amber-300';
      case 'Low':
        return 'bg-red-50 text-red-900 border-red-300';
    }
  };

  return (
    <div className="space-y-12">
      {/* =========================================================================
          QUESTION 1: What are the estimated conditions right now?
          (Location Focus & Immediate Operational Rating)
         ========================================================================= */}
      <section aria-labelledby="heading-current-conditions" className="space-y-4">
        {/* Top Control Bar: Mode Toggle & Freshness */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFDFB] border border-[#DFCBB3] rounded-xl p-3.5 sm:px-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#713F2B] shrink-0">
              Risk Assessment Mode:
            </span>
            <div
              role="radiogroup"
              aria-label="Risk Summary Period Toggle"
              className="relative inline-flex rounded-lg bg-[#E8D2B4]/40 p-1 border border-[#DFCBB3]"
            >
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === 'now'}
                onClick={() => handleSelectViewMode('now')}
                className={`relative px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer min-h-[40px] z-10 interactive-tap ${
                  viewMode === 'now'
                    ? 'text-[#713F2B] font-bold'
                    : 'text-[#5A453A] hover:text-[#713F2B]'
                }`}
              >
                <span className="relative z-10">{STRINGS.toggles.now}</span>
                {viewMode === 'now' && (
                  <motion.span
                    layoutId={shouldReduceMotion ? undefined : 'riskPeriodPill'}
                    className="absolute inset-0 bg-white rounded-md shadow-xs -z-0"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === 'highest12h'}
                onClick={() => handleSelectViewMode('highest12h')}
                className={`relative px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer min-h-[40px] z-10 interactive-tap ${
                  viewMode === 'highest12h'
                    ? 'text-[#713F2B] font-bold'
                    : 'text-[#5A453A] hover:text-[#713F2B]'
                }`}
              >
                <span className="relative z-10">{STRINGS.toggles.highest12h}</span>
                {viewMode === 'highest12h' && (
                  <motion.span
                    layoutId={shouldReduceMotion ? undefined : 'riskPeriodPill'}
                    className="absolute inset-0 bg-white rounded-md shadow-xs -z-0"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-[#8C6D58]">
            <div className="flex items-center gap-1.5 truncate">
              <Clock className="w-3.5 h-3.5 text-[#E8874A] shrink-0" />
              <span className="truncate">{STRINGS.toggles.lastUpdated(lastUpdatedFormatted)}</span>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#713F2B] bg-[#E8D2B4]/40 hover:bg-[#E8D2B4]/80 active:scale-[0.98] rounded-lg transition-all cursor-pointer disabled:opacity-50 min-h-[40px] shrink-0 interactive-tap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Selected Location Banner */}
        <div
          data-testid="risk-summary-banner"
          className="bg-[#FFFDFB] border border-[#DFCBB3] rounded-xl p-4 sm:p-7 shadow-xs space-y-5 sm:space-y-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6 border-b border-[#DFCBB3] pb-5 sm:pb-6">
            {/* Left: Location title & City quick-switcher */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#713F2B] uppercase tracking-wider">
                <Compass className="w-4 h-4 text-[#E8874A]" />
                <span>Selected UAE Monitoring Station</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <motion.h1
                  key={currentOutlook.city.id}
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  id="heading-current-conditions"
                  className="text-2xl sm:text-4xl font-extrabold text-[#3A1E13] tracking-tight"
                >
                  {currentOutlook.city.name}
                </motion.h1>

                {/* City Switcher Select with comfortable 44px touch target */}
                <select
                  value={selectedCityId}
                  onChange={(e) => onSelectCity(e.target.value)}
                  className="bg-[#F7F1E8] border border-[#DFCBB3] hover:border-[#E8874A] text-xs sm:text-sm font-semibold text-[#713F2B] rounded-lg px-3 py-2.5 cursor-pointer transition-colors focus:outline-none min-h-[44px]"
                  aria-label="Switch monitoring station"
                >
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      Station: {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-[#8C6D58]">
                Coordinates: {currentOutlook.city.latitude.toFixed(2)}°N, {currentOutlook.city.longitude.toFixed(2)}°E · Asia/Dubai Timezone
              </p>
            </div>

            {/* Right: Risk Level Hero Badge with animated values */}
            <motion.div
              key={`${currentOutlook.city.id}-${viewMode}`}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between sm:justify-start gap-4 bg-[#F7F1E8] border border-[#DFCBB3] rounded-xl p-4 w-full sm:w-auto shadow-2xs"
            >
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#8C6D58]">
                  {viewMode === 'now' ? 'Current Risk Level' : '12-Hour Peak Hazard'}
                </div>
                <div className="text-xl sm:text-2xl font-black text-[#2D1A12] tracking-tight">
                  {activePeriodCfg.label}
                </div>
                <div className="text-xs text-[#5A453A]">
                  Composite Score: <AnimatedScore value={activePeriodScore} />/100
                </div>
              </div>
              <div
                style={{
                  backgroundColor: activePeriodCfg.bg,
                  color: activePeriodCfg.text,
                }}
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center font-black text-lg sm:text-xl shadow-xs transition-transform hover:scale-105 shrink-0"
                aria-hidden="true"
              >
                {activePeriodCfg.abbr}
              </div>
            </motion.div>
          </div>

          {/* Key Metric Tiles: 2 columns on mobile, 4 columns on large screens */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Tile 1: Current Condition (Now) */}
            <button
              type="button"
              onClick={() => handleSelectViewMode('now')}
              className={`p-3.5 rounded-lg border text-left transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                viewMode === 'now'
                  ? 'bg-[#E8D2B4]/50 border-2 border-[#E8874A] shadow-xs'
                  : 'bg-white border-[#DFCBB3] hover:bg-[#FFF8F0] hover:border-[#E8874A]/60'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-[#8C6D58] font-medium mb-1">
                <span>{STRINGS.panel.riskNow}</span>
                {viewMode === 'now' && (
                  <span className="text-[10px] font-bold text-[#713F2B] bg-white px-1.5 py-0.2 rounded shadow-2xs">
                    Viewing
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-base text-[#2D1A12]">
                  {levelNowCfg.label}
                </span>
                <span className="text-xs font-bold text-[#713F2B]">
                  <AnimatedScore value={currentOutlook.scoreNow} />
                </span>
              </div>
              <div className="text-[11px] text-[#8C6D58] mt-1">
                Measured at current hour
              </div>
            </button>

            {/* Tile 2: 12-Hour Forecast Peak */}
            <button
              type="button"
              onClick={() => handleSelectViewMode('highest12h')}
              className={`p-3.5 rounded-lg border text-left transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                viewMode === 'highest12h'
                  ? 'bg-[#E8D2B4]/50 border-2 border-[#E8874A] shadow-xs'
                  : 'bg-white border-[#DFCBB3] hover:bg-[#FFF8F0] hover:border-[#E8874A]/60'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-[#8C6D58] font-medium mb-1">
                <span>{STRINGS.panel.highestNext12h}</span>
                {viewMode === 'highest12h' && (
                  <span className="text-[10px] font-bold text-[#713F2B] bg-white px-1.5 py-0.2 rounded shadow-2xs">
                    Viewing
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-base text-[#2D1A12]">
                  {peakLevelCfg.label}
                </span>
                <span className="text-xs font-bold text-[#713F2B]">
                  <AnimatedScore value={currentOutlook.peakScore} />
                </span>
              </div>
              <div className="text-[11px] text-[#8C6D58] mt-1">
                Peak expected at {currentOutlook.peakHourTime}
              </div>
            </button>

            {/* Tile 3: Best 3-Hour Window */}
            <div className="p-3.5 rounded-lg border border-[#DFCBB3] bg-white hover:border-[#244C3B]/50 transition-colors">
              <div className="text-xs font-semibold text-[#244C3B] flex items-center gap-1 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-[#244C3B]" />
                <span>{STRINGS.panel.bestWindow}</span>
              </div>
              <div className="font-bold text-base text-[#2D1A12]">
                {currentOutlook.bestWindow.displayRange}
              </div>
              <div className="text-[11px] text-[#8C6D58] mt-1">
                Avg: {currentOutlook.bestWindow.level} ({currentOutlook.bestWindow.averageScore})
              </div>
            </div>

            {/* Tile 4: Worst 3-Hour Window */}
            <div className="p-3.5 rounded-lg border border-[#DFCBB3] bg-[#FFF8F2] hover:border-[#E8874A]/60 transition-colors">
              <div className="text-xs font-semibold text-[#713F2B] flex items-center gap-1 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#E8874A]" />
                <span>{STRINGS.panel.worstWindow}</span>
              </div>
              <div className="font-bold text-base text-[#2D1A12]">
                {currentOutlook.worstWindow.displayRange}
              </div>
              <div className="text-[11px] text-[#8C6D58] mt-1">
                Avg: {currentOutlook.worstWindow.level} ({currentOutlook.worstWindow.averageScore})
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          QUESTION 2: What is happening across the UAE?
          (Interactive Map & Regional Overview)
         ========================================================================= */}
      <section aria-labelledby="heading-regional-overview" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E8874A]" />
              <span>Regional Synthesis</span>
            </div>
            <h2 id="heading-regional-overview" className="text-xl sm:text-2xl font-bold text-[#1E2522] tracking-tight">
              Atmospheric Distribution Across the UAE
            </h2>
          </div>
          <span className="text-xs text-[#5F6762] hidden sm:inline">
            Continuous raster layers · Hover on map to inspect
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Leaflet Map (7 cols on lg) */}
          <div className="lg:col-span-7">
            <UaeMap
              outlooks={outlooks}
              selectedCityId={selectedCityId}
              onSelectCity={onSelectCity}
              viewMode={viewMode}
              isDemoMode={isDemoMode}
            />
          </div>

          {/* Regional City Grid (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-4">
            <CityList
              outlooks={outlooks}
              selectedCityId={selectedCityId}
              onSelectCity={onSelectCity}
              viewMode={viewMode}
            />

            {/* Quick Context Card */}
            <div className="p-4 bg-[#FFFDFB] border border-[#DFCBB3] rounded-xl text-xs text-[#5A453A] space-y-2">
              <div className="font-semibold text-[#3A1E13] flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#E8874A]" />
                <span>Interpreting the UAE Spatial Map</span>
              </div>
              <p className="leading-relaxed">
                The continuous map surface interpolates atmospheric dust risk across the Emirates from model grid points. Use the layer switcher on the map to inspect rainfall, PM10/PM2.5 particulate concentrations, and satellite aerosol optical depth.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          QUESTION 3: What might happen over the next 12 hours?
          (Forecast Trajectory, Timeline & Target Advice)
         ========================================================================= */}
      <section aria-labelledby="heading-forecast-trajectory" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E8874A]" />
              <span>12-Hour Evolution</span>
            </div>
            <h2 id="heading-forecast-trajectory" className="text-xl sm:text-2xl font-bold text-[#3A1E13] tracking-tight">
              Hourly Trajectory & Operational Guidance for {currentOutlook.city.name}
            </h2>
          </div>
          <span className="text-xs text-[#8C6D58] hidden sm:inline">
            Click any hour to inspect its sensor breakdown
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 12-Hour Timeline Chart (7 cols on lg) */}
          <div className="lg:col-span-7">
            <TimelineChart
              hourlyResults={currentOutlook.hourlyResults}
              selectedHourIndex={selectedHourIndex}
              onSelectHour={setSelectedHourIndex}
            />
          </div>

          {/* Calibrated Audience Advice (5 cols on lg) */}
          <div className="lg:col-span-5">
            <AdvicePanel outlook={currentOutlook} />
          </div>
        </div>
      </section>

      {/* =========================================================================
          QUESTION 4: What environmental data supports the estimate?
          (Environmental Readings & Scored Factor Breakdown)
         ========================================================================= */}
      <section aria-labelledby="heading-environmental-data" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E8874A]" />
              <span>Atmospheric Telemetry</span>
            </div>
            <h2 id="heading-environmental-data" className="text-xl sm:text-2xl font-bold text-[#3A1E13] tracking-tight">
              Environmental Readings Supporting Hour {selectedHourResult.displayHour}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-xs font-semibold text-[#713F2B] hover:text-[#E8874A] flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-[#E8D2B4]/40 transition-colors cursor-pointer interactive-tap"
            aria-expanded={showTechnicalDetails}
          >
            <span>{showTechnicalDetails ? 'Collapse Details' : 'Expand Details'}</span>
            {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Quick At-a-Glance Telemetry Strip for Selected Hour */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <div className="p-3 bg-white border border-[#CBD5CD] border-t-2 border-t-[#E8874A] hover:border-[#244C3B]/40 rounded-lg transition-colors">
            <div className="text-[11px] text-[#5F6762]">Dust Concen.</div>
            <div className="font-bold text-sm text-[#1E2522] mt-0.5 font-mono">
              {selectedHourResult.subScores.dust?.rawValue !== null
                ? `${selectedHourResult.subScores.dust.rawValue} µg/m³`
                : 'n/a'}
            </div>
            <div className="text-[10px] text-[#5F6762] mt-0.5">Weight: 30%</div>
          </div>

          <div className="p-3 bg-white border border-[#CBD5CD] border-t-2 border-t-[#E8874A] hover:border-[#244C3B]/40 rounded-lg transition-colors">
            <div className="text-[11px] text-[#5F6762]">PM10 Dust</div>
            <div className="font-bold text-sm text-[#1E2522] mt-0.5 font-mono">
              {selectedHourResult.subScores.pm10?.rawValue !== null
                ? `${selectedHourResult.subScores.pm10.rawValue} µg/m³`
                : 'n/a'}
            </div>
            <div className="text-[10px] text-[#5F6762] mt-0.5">Weight: 25%</div>
          </div>

          <div className="p-3 bg-white border border-[#CBD5CD] hover:border-[#244C3B]/40 rounded-lg transition-colors">
            <div className="text-[11px] text-[#5F6762]">Sustained Wind</div>
            <div className="font-bold text-sm text-[#1E2522] mt-0.5 font-mono">
              {selectedHourResult.subScores.wind_speed_10m?.rawValue !== null
                ? `${selectedHourResult.subScores.wind_speed_10m.rawValue} km/h`
                : 'n/a'}
            </div>
            <div className="text-[10px] text-[#5F6762] mt-0.5">Weight: 10%</div>
          </div>

          <div className="p-3 bg-white border border-[#CBD5CD] hover:border-[#244C3B]/40 rounded-lg transition-colors">
            <div className="text-[11px] text-[#5F6762]">Wind Gusts</div>
            <div className="font-bold text-sm text-[#1E2522] mt-0.5 font-mono">
              {selectedHourResult.subScores.wind_gusts_10m?.rawValue !== null
                ? `${selectedHourResult.subScores.wind_gusts_10m.rawValue} km/h`
                : 'n/a'}
            </div>
            <div className="text-[10px] text-[#5F6762] mt-0.5">Weight: 10%</div>
          </div>

          <div className="p-3 bg-white border border-[#CBD5CD] hover:border-[#244C3B]/40 rounded-lg transition-colors">
            <div className="text-[11px] text-[#5F6762]">Visibility</div>
            <div className="font-bold text-sm text-[#1E2522] mt-0.5 font-mono">
              {selectedHourResult.subScores.visibility?.rawValue !== null
                ? `${selectedHourResult.subScores.visibility.rawValue} m`
                : 'n/a'}
            </div>
            <div className="text-[10px] text-[#5F6762] mt-0.5">Weight: 10%</div>
          </div>

          <div className="p-3 bg-white border border-[#CBD5CD] hover:border-[#244C3B]/40 rounded-lg transition-colors">
            <div className="text-[11px] text-[#5F6762]">Aerosol Depth</div>
            <div className="font-bold text-sm text-[#1E2522] mt-0.5 font-mono">
              {selectedHourResult.subScores.aerosol_optical_depth?.rawValue !== null
                ? `${selectedHourResult.subScores.aerosol_optical_depth.rawValue} AOD`
                : 'n/a'}
            </div>
            <div className="text-[10px] text-[#5F6762] mt-0.5">Weight: 10%</div>
          </div>

          <div className="p-3 bg-white border border-[#CBD5CD] hover:border-[#244C3B]/40 rounded-lg transition-colors">
            <div className="text-[11px] text-[#5F6762]">Humidity</div>
            <div className="font-bold text-sm text-[#1E2522] mt-0.5 font-mono">
              {selectedHourResult.subScores.relative_humidity_2m?.rawValue !== null
                ? `${selectedHourResult.subScores.relative_humidity_2m.rawValue} %`
                : 'n/a'}
            </div>
            <div className="text-[10px] text-[#5F6762] mt-0.5">Weight: 5%</div>
          </div>
        </div>

        {/* Detailed WhyThisRating Progressive Disclosure Component with Smooth Animation */}
        <AnimatePresence>
          {showTechnicalDetails && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-2">
                <WhyThisRating
                  selectedHour={selectedHourResult}
                  activeModelInfo={currentOutlook.activeModelInfo}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* =========================================================================
          QUESTION 5: How fresh and reliable is the available information?
          (Data Freshness, Confidence & Provenance)
         ========================================================================= */}
      <section aria-labelledby="heading-data-reliability" className="space-y-4">
        <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E8874A]" />
          <span>Data Integrity & Provenance</span>
        </div>
        <h2 id="heading-data-reliability" className="text-xl sm:text-2xl font-bold text-[#3A1E13] tracking-tight">
          How Fresh and Reliable is This Information?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Confidence Evaluation */}
          <div className="p-5 bg-[#FFFDFB] border border-[#DFCBB3] rounded-xl flex flex-col justify-between hover:border-[#E8874A]/40 transition-colors">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#713F2B]">
                  Confidence Rating
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-bold border ${getConfidenceBadgeColor(
                    currentOutlook.confidence
                  )}`}
                >
                  {currentOutlook.confidence} Confidence
                </span>
              </div>
              <p className="text-xs text-[#5A453A] leading-relaxed">
                Determined by heuristic checks for missing factors, sensor discrepancies, and boundary proximity.
              </p>
              {currentOutlook.confidenceReasons.length > 0 && (
                <ul className="text-xs text-[#8C6D58] list-disc pl-4 space-y-1 pt-1">
                  {currentOutlook.confidenceReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pt-4 border-t border-[#DFCBB3] text-[11px] text-[#8C6D58]">
              Unvalidated prototypes capped at Medium confidence
            </div>
          </div>

          {/* Card 2: Freshness & Simulation Controls */}
          <div className="p-5 bg-[#FFFDFB] border border-[#DFCBB3] rounded-xl flex flex-col justify-between hover:border-[#E8874A]/40 transition-colors">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#713F2B]">
                Telemetry Freshness
              </span>
              <div className="text-sm font-semibold text-[#2D1A12] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#E8874A]" />
                <span>{lastUpdatedFormatted}</span>
              </div>
              <p className="text-xs text-[#5A453A] leading-relaxed">
                Data refreshes automatically every 30 minutes from open forecast models. Use the top navigation bar to toggle Demonstration Mode.
              </p>
            </div>

            {onRefresh && (
              <div className="pt-4 border-t border-[#DFCBB3]">
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-[#244C3B] hover:bg-[#1B3A2D] active:scale-[0.98] text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Retrieving fresh forecast...' : 'Force Refresh Now'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Card 3: Provenance & External Ground Truth */}
          <div className="p-5 bg-[#FFFDFB] border border-[#DFCBB3] rounded-xl flex flex-col justify-between hover:border-[#E8874A]/40 transition-colors">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#713F2B]">
                Model Provenance
              </span>
              <p className="text-xs text-[#5A453A] leading-relaxed">
                {STRINGS.panel.dataSources}
              </p>
              <div className="pt-1">
                <a
                  href={STRINGS.panel.satelliteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#244C3B] hover:underline flex items-center gap-1"
                >
                  <span>{STRINGS.panel.satelliteLink}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <p className="text-[11px] text-[#8C6D58] mt-0.5">
                  {STRINGS.panel.satelliteNote}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-[#DFCBB3]">
              <a
                href={STRINGS.disclaimer.ncmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-[#E8874A] hover:underline flex items-center gap-1"
              >
                <span>Official UAE Warnings: ncm.ae</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
