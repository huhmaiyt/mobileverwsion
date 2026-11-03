/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BarChart3, Table as TableIcon } from 'lucide-react';
import { APP_CONFIG } from '../config.ts';
import { STRINGS } from '../strings.ts';
import { HourlyRiskResult } from '../types.ts';

interface TimelineChartProps {
  hourlyResults: HourlyRiskResult[];
  selectedHourIndex: number;
  onSelectHour: (index: number) => void;
}

export const TimelineChart: React.FC<TimelineChartProps> = ({
  hourlyResults,
  selectedHourIndex,
  onSelectHour,
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const shouldReduceMotion = useReducedMotion();

  if (!hourlyResults || hourlyResults.length === 0) {
    return null;
  }

  // Keyboard navigation through hours
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSelectHour(Math.min(hourlyResults.length - 1, selectedHourIndex + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSelectHour(Math.max(0, selectedHourIndex - 1));
    }
  };

  return (
    <div className="dw-panel p-4 sm:p-5 shadow-xs">
      {/* Header with Table / Chart toggle */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm text-[#713F2B]">
            {STRINGS.panel.timelineTitle}
          </h3>
          <p className="text-xs text-[#6B564B]">
            Use click or Left/Right arrow keys to scrub through hourly conditions
          </p>
        </div>

        <div className="relative flex items-center bg-[#E8D2B4]/40 p-0.5 rounded-md border border-[#DFCBB3]">
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={`relative px-3 py-1 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer z-10 min-h-[44px] min-w-[44px] ${
              viewMode === 'chart'
                ? 'text-[#713F2B]'
                : 'text-[#6B564B] hover:text-[#2D1A12]'
            }`}
            aria-label={STRINGS.panel.showAsChart}
          >
            <BarChart3 className="w-3.5 h-3.5 relative z-10" />
            <span className="hidden sm:inline relative z-10">{STRINGS.panel.showAsChart}</span>
            {viewMode === 'chart' && (
              <motion.span
                layoutId={shouldReduceMotion ? undefined : 'timelineViewModePill'}
                className="absolute inset-0 bg-[#FFFDF8] rounded shadow-2xs -z-0"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`relative px-3 py-1 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer z-10 min-h-[44px] min-w-[44px] ${
              viewMode === 'table'
                ? 'text-[#713F2B]'
                : 'text-[#6B564B] hover:text-[#2D1A12]'
            }`}
            aria-label={STRINGS.panel.showAsTable}
          >
            <TableIcon className="w-3.5 h-3.5 relative z-10" />
            <span className="hidden sm:inline relative z-10">{STRINGS.panel.showAsTable}</span>
            {viewMode === 'table' && (
              <motion.span
                layoutId={shouldReduceMotion ? undefined : 'timelineViewModePill'}
                className="absolute inset-0 bg-[#FFFDF8] rounded shadow-2xs -z-0"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        /* Accessible Interactive Bar Chart */
        <div
          role="region"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="12-hour risk timeline bar chart. Use arrow keys to navigate."
          className="pt-2 pb-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#713F2B] rounded-lg"
        >
          <div className="flex items-end justify-between gap-1 sm:gap-2 h-44 border-b border-[#DFCBB3] px-1">
            {hourlyResults.map((hourRes, idx) => {
              const isSelected = idx === selectedHourIndex;
              const colorCfg = APP_CONFIG.colors[hourRes.category];
              // Minimum height of 8% so 0 score bars are still visible and clickable
              const heightPct = Math.max(8, Math.round(hourRes.finalScore));

              return (
                <button
                  key={hourRes.hourIndex}
                  type="button"
                  onClick={() => onSelectHour(idx)}
                  aria-pressed={isSelected}
                  aria-label={`Hour ${hourRes.displayHour}, Risk ${hourRes.category}, Score ${Math.round(hourRes.finalScore)}`}
                  className={`flex-1 flex flex-col items-center justify-end h-full group focus:outline-none cursor-pointer relative ${
                    isSelected ? 'z-10' : ''
                  }`}
                >
                  {/* Score tooltip or label above bar on hover / selection */}
                  <span
                    className={`text-[10px] sm:text-xs font-mono font-bold mb-1 transition-all duration-200 ${
                      isSelected
                        ? 'opacity-100 text-[#713F2B] -translate-y-0.5 font-extrabold'
                        : 'opacity-70 group-hover:opacity-100 text-[#6B564B]'
                    }`}
                  >
                    {Math.round(hourRes.finalScore)}
                  </span>

                  {/* Bar element with smooth height & scale transitions */}
                  <div
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: colorCfg.bg,
                    }}
                    className={`w-full rounded-t-sm transition-all duration-300 ease-out ${
                      isSelected
                        ? 'ring-2 sm:ring-3 ring-[#E8874A] brightness-105 shadow-xs scale-x-105'
                        : 'hover:brightness-95 opacity-90 group-hover:opacity-100'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Hour and Level Labels row */}
          <div className="flex items-start justify-between gap-1 sm:gap-2 mt-2 px-1 text-center">
            {hourlyResults.map((hourRes, idx) => {
              const isSelected = idx === selectedHourIndex;
              const colorCfg = APP_CONFIG.colors[hourRes.category];

              return (
                <button
                  key={hourRes.hourIndex}
                  type="button"
                  onClick={() => onSelectHour(idx)}
                  className={`flex-1 flex flex-col items-center cursor-pointer p-1 rounded-md transition-all duration-150 active:scale-95 ${
                    isSelected ? 'bg-[#E8D2B4]/60 border-b-2 border-[#E8874A] font-bold text-[#713F2B] shadow-2xs' : 'hover:bg-[#FFF8F0]'
                  }`}
                  aria-label={`Select ${hourRes.displayHour}`}
                >
                  <span className="text-[11px] sm:text-xs text-[#2D1A12]">
                    {hourRes.displayHour}
                  </span>
                  <span
                    style={{ color: colorCfg.badgeText }}
                    className="text-[10px] font-semibold"
                  >
                    {colorCfg.abbr}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Accessible Table Alternative */
        <div className="overflow-x-auto max-h-64 border border-[#DFCBB3] rounded-md transition-opacity">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#E8D2B4]/30 border-b border-[#DFCBB3] text-[#713F2B]">
              <tr>
                <th className="py-2 px-3 font-semibold">{STRINGS.panel.hourCol}</th>
                <th className="py-2 px-3 font-semibold">{STRINGS.panel.riskCol}</th>
                <th className="py-2 px-3 font-semibold">{STRINGS.panel.scoreCol}</th>
                <th className="py-2 px-3 font-semibold">{STRINGS.panel.keyFactorsCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFCBB3]">
              {hourlyResults.map((hourRes, idx) => {
                const isSelected = idx === selectedHourIndex;
                const colorCfg = APP_CONFIG.colors[hourRes.category];

                return (
                  <tr
                    key={hourRes.hourIndex}
                    onClick={() => onSelectHour(idx)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#E8D2B4]/50 border-l-3 border-[#E8874A] text-[#713F2B] font-bold' : 'hover:bg-[#FFF8F0]'
                    }`}
                  >
                    <td className="py-2 px-3 text-[#2D1A12]">{hourRes.displayHour}</td>
                    <td className="py-2 px-3">
                      <span
                        style={{
                          backgroundColor: colorCfg.badgeBg,
                          color: colorCfg.badgeText,
                          borderColor: colorCfg.border,
                        }}
                        className="px-2 py-0.5 rounded text-xs font-semibold border"
                      >
                        {colorCfg.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[#2D1A12]">
                      {Math.round(hourRes.finalScore)}
                    </td>
                    <td className="py-2 px-3 text-[#6B564B] text-xs">
                      {hourRes.topContributors.join(', ') || 'Normal'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
