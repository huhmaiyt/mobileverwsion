/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart3, BookOpen, GraduationCap, Home, LayoutDashboard } from 'lucide-react';
import { STRINGS } from '../strings.ts';

export type ScreenId = 'home' | 'map' | 'school-mode' | 'how-it-works' | 'accuracy' | 'test-view';

interface SidebarProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
}

const ITEMS: Array<{ id: ScreenId; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: STRINGS.nav.home, Icon: Home },
  { id: 'map', label: STRINGS.nav.dashboard, Icon: LayoutDashboard },
  { id: 'school-mode', label: STRINGS.nav.schoolMode, Icon: GraduationCap },
  { id: 'how-it-works', label: STRINGS.nav.howItWorks, Icon: BookOpen },
  { id: 'accuracy', label: STRINGS.nav.accuracy, Icon: BarChart3 },
];

/**
 * Compact desktop sidebar (large screens only). Mobile and tablet keep the top Navbar.
 * Icon-only, so every item has an accessible name and a tooltip that appears on hover and keyboard focus.
 */
export const Sidebar: React.FC<SidebarProps> = ({ activeScreen, onSelectScreen }) => {
  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[84px] flex-col items-center bg-[#244C3B] py-5 shadow-[4px_0_24px_-12px_rgba(36,76,59,0.5)]"
      aria-label="DustWatch sidebar"
    >
      <button
        type="button"
        onClick={() => onSelectScreen('home')}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFFDF8] shadow-xs cursor-pointer interactive-tap"
        aria-label="DustWatch home"
      >
        <img
          src="/assets/dustwatch-logo-transparent.png"
          alt=""
          className="h-8 w-8 object-contain"
          width={32}
          height={32}
          decoding="async"
        />
      </button>

      <nav aria-label="Main navigation" className="mt-8 flex flex-1 flex-col items-center gap-2.5">
        {ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeScreen === id;
          return (
            <div key={id} className="group relative">
              <button
                type="button"
                onClick={() => onSelectScreen(id)}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors cursor-pointer interactive-tap ${
                  isActive
                    ? 'bg-[#E8874A] text-[#1B3A2D] shadow-xs'
                    : 'text-[#C5D9C5] hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
              </button>
              <span
                role="presentation"
                className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#1B3A2D] px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
              >
                {label}
              </span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
};
