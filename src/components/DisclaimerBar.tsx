/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { STRINGS } from '../strings.ts';

export const DisclaimerBar: React.FC = () => {
  return (
    <aside
      aria-label="Important project disclaimer"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#1E2522] text-white border-t border-[#313B36] px-3 sm:px-4 py-2 sm:py-2.5 shadow-lg"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-[11px] sm:text-xs gap-1.5 sm:gap-2">
        <p className="leading-tight text-center sm:text-left text-gray-200">
          <strong className="text-white font-semibold">DustWatch:</strong> {STRINGS.disclaimer.barText}
        </p>
        <a
          href={STRINGS.disclaimer.ncmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[#D5A45F] hover:text-[#E8C28A] underline focus-visible:ring-2 focus-visible:ring-[#D5A45F] rounded px-1.5 py-1 text-[11px] sm:text-xs font-semibold inline-flex items-center min-h-[32px]"
        >
          {STRINGS.disclaimer.ncmLinkLabel} &rarr;
        </a>
      </div>
    </aside>
  );
};
