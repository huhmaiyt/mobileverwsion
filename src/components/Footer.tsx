/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { APP_CONFIG } from '../config.ts';
import { STRINGS } from '../strings.ts';

interface FooterProps {
  onSelectScreen: (screen: 'map' | 'school-mode' | 'how-it-works' | 'accuracy' | 'about' | 'test-view') => void;
  activeScreen: string;
}

export const Footer: React.FC<FooterProps> = ({ onSelectScreen, activeScreen }) => {
  return (
    <footer className="border-t border-[#CBD3D7] bg-white py-6 pb-20 px-4 mt-12 text-xs text-[#4B5964]">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-[#16222B]">
            {STRINGS.app.title} &bull; {STRINGS.app.badge}
          </p>
          <p className="text-[11px] text-[#4B5964] mt-0.5">
            {STRINGS.panel.dataSources}
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">

          {/* Test view link (hidden if config.showTestViewLink is false) */}
          {APP_CONFIG.showTestViewLink && (
            <button
              type="button"
              onClick={() => onSelectScreen(activeScreen === 'test-view' ? 'map' : 'test-view')}
              className="hover:underline text-purple-700 font-semibold cursor-pointer"
            >
              {activeScreen === 'test-view' ? 'Close Test view' : STRINGS.nav.testView}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
