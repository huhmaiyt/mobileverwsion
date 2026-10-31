/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { APP_CONFIG, CITIES } from '../config.ts';
import { CityOutlook, RiskCategory } from '../types.ts';

interface CityListProps {
  outlooks: Record<string, CityOutlook>;
  selectedCityId: string;
  onSelectCity: (cityId: string) => void;
  viewMode: 'highest12h' | 'now';
}

export const CityList: React.FC<CityListProps> = ({
  outlooks,
  selectedCityId,
  onSelectCity,
  viewMode,
}) => {
  return (
    <div className="bg-[#FFFDFB] border border-[#DFCBB3] rounded-xl p-4 shadow-xs">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold text-[#713F2B]">
          UAE Municipalities (10 Stations)
        </h3>
        <span className="text-xs text-[#6B564B] font-medium">
          {viewMode === 'highest12h' ? '12h Peak Risk' : 'Current Estimated Risk'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CITIES.map((city) => {
          const outlook = outlooks[city.id];
          const category: RiskCategory = outlook
            ? viewMode === 'highest12h'
              ? outlook.peakLevel
              : outlook.levelNow
            : 'Low';

          const score = outlook
            ? viewMode === 'highest12h'
              ? outlook.peakScore
              : outlook.scoreNow
            : 0;

          const colorCfg = APP_CONFIG.colors[category];
          const isSelected = city.id === selectedCityId;

          return (
            <button
              key={city.id}
              type="button"
              onClick={() => onSelectCity(city.id)}
              aria-pressed={isSelected}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg flex items-center justify-between transition-all duration-150 min-h-[44px] cursor-pointer active:scale-[0.99] ${
                isSelected
                  ? 'bg-[#E8D2B4]/60 border-2 border-[#E8874A] shadow-2xs font-semibold text-[#713F2B]'
                  : 'bg-white border border-[#DFCBB3] hover:bg-[#FFF8F0] hover:border-[#E8874A]/60 hover:shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  style={{ backgroundColor: colorCfg.bg, color: colorCfg.text }}
                  className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 transition-transform group-hover:scale-105"
                  aria-hidden="true"
                >
                  {colorCfg.abbr}
                </span>
                <span className="font-semibold text-sm text-[#2D1A12] truncate">
                  {city.name}
                </span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8874A] shrink-0" aria-label="Active selection" />
                )}
              </div>

              {/* Text badge with full risk word and score */}
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span
                  style={{
                    backgroundColor: colorCfg.badgeBg,
                    color: colorCfg.badgeText,
                    borderColor: colorCfg.border,
                  }}
                  className="text-xs px-2 py-0.5 rounded font-semibold border transition-colors"
                >
                  {colorCfg.label}
                </span>
                <span className="text-xs font-mono font-bold text-[#46504B] w-7 text-right tabular-nums">
                  {Math.round(score)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
