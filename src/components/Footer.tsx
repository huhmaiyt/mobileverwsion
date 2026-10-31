/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { APP_CONFIG } from '../config.ts';
import { STRINGS } from '../strings.ts';

interface FooterProps {
  onSelectScreen: (screen: 'home' | 'map' | 'school-mode' | 'how-it-works' | 'accuracy' | 'test-view') => void;
  activeScreen: string;
}

export const Footer: React.FC<FooterProps> = ({ onSelectScreen, activeScreen }) => {
  return (
    <footer className="border-t border-[#DFCBB3] bg-[#F7F1E8] py-8 pb-24 px-4 mt-16 text-xs text-[#6B564B] relative">
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
            <div className="border-l border-[#DFCBB3] pl-3">
              <span className="font-bold text-xs text-[#713F2B] block">
                {STRINGS.app.badge}
              </span>
              <span className="text-[11px] text-[#8C6D58] block">
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
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer"
          >
            {STRINGS.nav.home}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('map')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer"
          >
            {STRINGS.nav.dashboard}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('school-mode')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer"
          >
            {STRINGS.nav.schoolMode}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('how-it-works')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer"
          >
            {STRINGS.nav.howItWorks}
          </button>

          <button
            type="button"
            onClick={() => onSelectScreen('accuracy')}
            className="hover:underline text-[#244C3B] font-semibold cursor-pointer"
          >
            {STRINGS.nav.accuracy}
          </button>

          <a
            href={STRINGS.disclaimer.ncmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline text-[#D5A45F] font-bold"
          >
            <span>{STRINGS.disclaimer.ncmLinkLabel}</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {/* Test view link (hidden if config.showTestViewLink is false) */}
          {APP_CONFIG.showTestViewLink && (
            <button
              type="button"
              onClick={() => onSelectScreen(activeScreen === 'test-view' ? 'home' : 'test-view')}
              className="hover:underline text-[#5F6762] font-mono cursor-pointer ml-2 border-l border-[#CBD5CD] pl-4"
            >
              {activeScreen === 'test-view' ? 'Close Diagnostics' : 'Diagnostics & Test'}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
