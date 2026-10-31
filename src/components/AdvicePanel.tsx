/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GraduationCap, HardHat, HeartPulse, Info, ShieldCheck } from 'lucide-react';
import { STRINGS } from '../strings.ts';
import { AdviceResponse, CityOutlook } from '../types.ts';
import { getAdviceForOutlook } from '../geminiService.ts';

interface AdvicePanelProps {
  outlook: CityOutlook;
}

export const AdvicePanel: React.FC<AdvicePanelProps> = ({ outlook }) => {
  const [activeTab, setActiveTab] = useState<'schools' | 'workers' | 'families'>('schools');
  const [adviceData, setAdviceData] = useState<AdviceResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    getAdviceForOutlook(outlook).then((res) => {
      if (isMounted) {
        setAdviceData(res);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [outlook]);

  const peakLevel = outlook.peakLevel;
  const worstWindowText = outlook.worstWindow.displayRange;

  return (
    <div className="bg-white border border-[#CBD3D7] rounded-lg p-4 shadow-sm">
      {/* Highest estimated risk header */}
      <div className="mb-3 pb-3 border-b border-[#CBD3D7]">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-bold text-[#16222B]">
            {STRINGS.advice.highestPrefix(peakLevel, worstWindowText)}
          </span>
          <span className="text-xs text-[#4B5964] bg-gray-100 border border-gray-200 px-2 py-0.5 rounded font-medium">
            3-Hour Peak Window
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Advice recipient categories"
        className="flex items-center gap-1 border-b border-[#CBD3D7] mb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'schools'}
          onClick={() => setActiveTab('schools')}
          className={`px-3 py-2 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors min-h-[44px] cursor-pointer ${
            activeTab === 'schools'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-[#4B5964] hover:text-[#16222B]'
          }`}
        >
          <GraduationCap className="w-4 h-4 shrink-0" />
          <span>{STRINGS.advice.tabSchools}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'workers'}
          onClick={() => setActiveTab('workers')}
          className={`px-3 py-2 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors min-h-[44px] cursor-pointer ${
            activeTab === 'workers'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-[#4B5964] hover:text-[#16222B]'
          }`}
        >
          <HardHat className="w-4 h-4 shrink-0" />
          <span>{STRINGS.advice.tabWorkers}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'families'}
          onClick={() => setActiveTab('families')}
          className={`px-3 py-2 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors min-h-[44px] cursor-pointer ${
            activeTab === 'families'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-[#4B5964] hover:text-[#16222B]'
          }`}
        >
          <HeartPulse className="w-4 h-4 shrink-0" />
          <span>{STRINGS.advice.tabFamilies}</span>
        </button>
      </div>

      {/* Tab Panel Content */}
      <div className="min-h-[70px] flex flex-col justify-center">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#4B5964] italic py-2">
            <span>{STRINGS.advice.preparing}</span>
          </div>
        ) : adviceData ? (
          <div className="text-sm text-[#16222B] leading-relaxed">
            {activeTab === 'schools' && <p>{adviceData.schools}</p>}
            {activeTab === 'workers' && <p>{adviceData.workers}</p>}
            {activeTab === 'families' && <p>{adviceData.families}</p>}
          </div>
        ) : null}
      </div>

      {/* Attribution Label */}
      <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-start gap-1.5 text-xs text-[#4B5964]">
        {adviceData?.isAI ? (
          <>
            <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
            <p className="leading-tight">{STRINGS.advice.aiAttribution}</p>
          </>
        ) : (
          <>
            <ShieldCheck className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
            <p className="leading-tight">{STRINGS.advice.standardAttribution}</p>
          </>
        )}
      </div>
    </div>
  );
};
