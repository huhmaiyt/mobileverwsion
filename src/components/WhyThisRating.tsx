/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, Cpu, Info, ShieldAlert } from 'lucide-react';
import { STRINGS } from '../strings.ts';
import { HourlyRiskResult, ModelFileConfig } from '../types.ts';

interface WhyThisRatingProps {
  selectedHour: HourlyRiskResult;
  activeModelInfo?: {
    name: string;
    version: string;
    trainedDate: string;
  };
}

export const WhyThisRating: React.FC<WhyThisRatingProps> = ({
  selectedHour,
  activeModelInfo,
}) => {
  const subScores = selectedHour.subScores;
  const scoredFactorKeys = Object.keys(subScores);

  const getStatusBadge = (status: 'low' | 'moderate' | 'high' | 'missing') => {
    switch (status) {
      case 'high':
        return <span className="text-[10px] bg-red-100 text-red-800 font-semibold px-1.5 py-0.2 rounded border border-red-200">High</span>;
      case 'moderate':
        return <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.2 rounded border border-amber-200">Moderate</span>;
      case 'low':
        return <span className="text-[10px] bg-[#E8D2B4]/40 text-[#713F2B] font-semibold px-1.5 py-0.2 rounded border border-[#DFCBB3]">Low</span>;
      case 'missing':
        return <span className="text-[10px] bg-[#F3EADD] text-[#2D221C] font-semibold px-1.5 py-0.2 rounded border border-[#DFCBB3]">Missing</span>;
    }
  };

  return (
    <div className="dw-panel p-5 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm text-[#713F2B]">
          {STRINGS.whyThisRating.title}
        </h3>
        <span className="text-xs font-bold text-[#713F2B] bg-[#E8D2B4]/50 border border-[#DFCBB3] px-2.5 py-0.5 rounded-md">
          Hour: {selectedHour.displayHour}
        </span>
      </div>

      <p className="text-xs text-[#6B564B] mb-4">
        {STRINGS.whyThisRating.hourSubtitle(selectedHour.displayHour)}
      </p>

      {/* Active Mode Banner */}
      <div className="mb-4 p-3 rounded-lg bg-[#F7F1E8] border border-[#DFCBB3] text-xs text-[#2D1A12] flex items-start gap-2.5">
        <Cpu className="w-4 h-4 text-[#E8874A] shrink-0 mt-0.5" />
        <div>
          {activeModelInfo ? (
            <span className="font-medium">
              {STRINGS.whyThisRating.activeModeModel(
                activeModelInfo.name,
                activeModelInfo.version,
                activeModelInfo.trainedDate
              )}
            </span>
          ) : (
            <span className="font-medium text-[#6B564B]">
              {STRINGS.whyThisRating.activeModeBaseline}
            </span>
          )}
        </div>
      </div>

      {/* When trained model is active, show comparison next to baseline */}
      {selectedHour.modelScore !== undefined && (
        <div className="mb-4 p-3 rounded-lg bg-[#E8D2B4]/30 border border-[#DFCBB3] text-xs text-[#2D1A12]">
          <div className="font-semibold mb-1 text-[#713F2B]">{STRINGS.whyThisRating.comparisonTitle}</div>
          <p>
            {STRINGS.whyThisRating.baselineComparison(
              selectedHour.baselineCategory,
              Math.round(selectedHour.baselineScore),
              selectedHour.category,
              Math.round(selectedHour.finalScore)
            )}
          </p>
        </div>
      )}

      {/* Particle cap notice if active */}
      {selectedHour.isParticleCapped && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p>{STRINGS.whyThisRating.particleCapNotice}</p>
        </div>
      )}

      {/* Missing variables warning */}
      {selectedHour.missingVariables.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{STRINGS.whyThisRating.missingDataWarning}: </span>
            <span>{selectedHour.missingVariables.join(', ')} (confidence lowered)</span>
          </div>
        </div>
      )}

      {/* Scored factors list */}
      <div className="mb-4">
        <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-2.5">
          {STRINGS.whyThisRating.scoredFactors}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {scoredFactorKeys.map((key) => {
            const factor = subScores[key];
            if (!factor) return null;

            return (
              <div
                key={key}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#F7F1E8] border border-[#DFCBB3]/80"
              >
                <div>
                  <div className="font-semibold text-[#2D1A12]">{factor.displayName}</div>
                  <div className="text-[11px] text-[#6B564B]">
                    {factor.rawValue !== null
                      ? `${factor.rawValue} ${factor.unit}`
                      : 'Missing (null)'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(factor.status)}
                  {factor.subScore !== null && (
                    <span className="font-mono text-xs font-semibold text-[#6B564B] w-6 text-right">
                      {Math.round(factor.subScore)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contextual factors (PM2.5, Temperature) */}
      <div className="mb-4 pt-3 border-t border-[#DFCBB3]">
        <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-2">
          {STRINGS.whyThisRating.contextFactors}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-[#F7F1E8] border border-[#DFCBB3]/80 flex justify-between items-center">
            <span className="text-[#6B564B]">PM2.5 particles:</span>
            <span className="font-bold text-[#2D1A12]">
              {selectedHour.contextVariables.pm2_5.value !== null
                ? `${selectedHour.contextVariables.pm2_5.value} ${selectedHour.contextVariables.pm2_5.unit}`
                : 'n/a'}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#F7F1E8] border border-[#DFCBB3]/80 flex justify-between items-center">
            <span className="text-[#6B564B]">Air Temperature:</span>
            <span className="font-bold text-[#2D1A12]">
              {selectedHour.contextVariables.temperature_2m.value !== null
                ? `${selectedHour.contextVariables.temperature_2m.value} ${selectedHour.contextVariables.temperature_2m.unit}`
                : 'n/a'}
            </span>
          </div>
        </div>
      </div>

      {/* Top contributors */}
      {selectedHour.topContributors.length > 0 && (
        <div className="mb-4 text-xs text-[#6B564B]">
          <span className="font-semibold text-[#2D1A12]">
            {STRINGS.whyThisRating.topContributors}:{' '}
          </span>
          <span>{selectedHour.topContributors.join('; ')}</span>
        </div>
      )}

      {/* Scientific Caution */}
      <div className="p-3 rounded-lg bg-[#E8D2B4]/40 border border-[#DFCBB3] text-xs text-[#2D1A12] flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#713F2B] shrink-0 mt-0.5" />
        <p className="leading-relaxed italic">{STRINGS.whyThisRating.scientificCaution}</p>
      </div>
    </div>
  );
};
