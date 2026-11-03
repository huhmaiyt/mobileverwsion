/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ScreenId } from './Sidebar.tsx';

interface PageHeaderProps {
  activeScreen: ScreenId;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
}

const TITLES: Partial<Record<ScreenId, { title: string; subtitle: string }>> = {
  map: { title: 'Live dashboard', subtitle: 'Estimated dust risk for the next 12 hours across the UAE' },
  'school-mode': { title: 'School Mode', subtitle: 'Outdoor activity guidance for schools, based on your approved policy' },
  'how-it-works': { title: 'How it works', subtitle: 'Where the data comes from and how each rating is calculated' },
  accuracy: { title: 'Accuracy', subtitle: 'How the forecasts compare with what was observed' },
  'test-view': { title: 'Test view', subtitle: 'Model evaluation workbench' },
};

/** Desktop page header (large screens only), shown above every dashboard screen. */
export const PageHeader: React.FC<PageHeaderProps> = ({ activeScreen, isDemoMode, onToggleDemoMode }) => {
  const meta = TITLES[activeScreen];
  if (!meta) return null;

  return (
    <div className="hidden lg:flex max-w-7xl w-full mx-auto px-4 pt-7 pb-4 items-end justify-between gap-6">
      <div>
        <div className="text-2xl font-extrabold tracking-tight text-[#244C3B]">{meta.title}</div>
        <p className="mt-0.5 text-sm text-[#5A453A]">{meta.subtitle}</p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={isDemoMode}
          aria-label={`Demonstration Mode is currently ${isDemoMode ? 'ON' : 'OFF'}. Click to switch.`}
          onClick={onToggleDemoMode}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[40px] border interactive-tap ${
            isDemoMode
              ? 'bg-[#FBEBDD] text-[#713F2B] border-[#E8874A] hover:bg-[#F5DDC9]'
              : 'bg-[#FFFDF8] text-[#5A453A] border-[#DFCBB3] hover:border-[#E8874A] hover:text-[#713F2B]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${isDemoMode ? 'bg-[#E8874A] animate-pulse' : 'bg-[#A8B99A]'}`}
            aria-hidden="true"
          />
          <span>Demo Mode</span>
          <span
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-extrabold ${
              isDemoMode ? 'bg-[#713F2B] text-white' : 'bg-[#E8F0E7] text-[#244C3B]'
            }`}
          >
            {isDemoMode ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>
    </div>
  );
};
