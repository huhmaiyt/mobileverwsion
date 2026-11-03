/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { APP_CONFIG } from '../config.ts';
import { STRINGS } from '../strings.ts';

interface FooterProps {
  onSelectScreen: (screen: 'home' | 'map' | 'school-mode' | 'how-it-works' | 'accuracy' | 'test-view') => void;
  activeScreen: string;
}

export const Footer: React.FC<FooterProps> = ({ onSelectScreen, activeScreen }) => {
  return (
    <footer className="border-t border-[#C5D9C5] bg-[#E8F0E7]/70 py-8 pb-24 px-4 mt-16 text-xs text-[#6B564B] relative">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectScreen('home')}
              className="group cursor-pointer focus:outline-none interactive-tap shrink-0"
              aria-label="DustWatch Homepage"
            >
              <img
                src="/assets/dustwatch-logo-transparent.png"
                alt="DustWatch - UAE Dust Risk Outlook"
                className="h-10 sm:h-11 w-auto object-contain transition-opacity group-hover:opacity-90"
                width={64}
                height={40}
                loading="lazy"
              />
            </button>
            <div className="border-l border-[#C5D9C5] pl-3">
              <span className="font-bold text-xs text-[#713F2B] block">
                {STRINGS.app.badge}
              </span>
              <span className="text-[11px] text-[#6B564B] block">
                UAE Regional Atmospheric Outlook
              </span>
            </div>
          </div>
          <p className="text-[11px] text-[#6B564B] mt-1 max-w-xl">
            {STRINGS.panel.dataSources}
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap text-xs">
          <button
            type="button"
            onClick={() => onSelectScreen('home')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer inline-flex items-center min-h-[44px] px-1"
          >
            {STRINGS.nav.home}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('map')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer inline-flex items-center min-h-[44px] px-1"
          >
            {STRINGS.nav.dashboard}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('school-mode')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer inline-flex items-center min-h-[44px] px-1"
          >
            {STRINGS.nav.schoolMode}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('how-it-works')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer inline-flex items-center min-h-[44px] px-1"
          >
            {STRINGS.nav.howItWorks}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('accuracy')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer inline-flex items-center min-h-[44px] px-1"
          >
            {STRINGS.nav.accuracy}
          </button>

          {/* Test view link (hidden if config.showTestViewLink is false) */}
          {APP_CONFIG.showTestViewLink && (
            <button
              type="button"
              onClick={() => onSelectScreen(activeScreen === 'test-view' ? 'home' : 'test-view')}
              className="hover:underline text-[#5A453A] font-mono cursor-pointer inline-flex items-center min-h-[44px] ml-2 border-l border-[#C5D9C5] pl-4"
            >
              {activeScreen === 'test-view' ? 'Close Diagnostics' : 'Diagnostics & Test'}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
