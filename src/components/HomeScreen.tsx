/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Compass,
  Clock,
  GraduationCap,
  Scale,
  ShieldAlert,
  ExternalLink,
  Layers,
  Wind,
  CheckCircle2,
} from 'lucide-react';
import { APP_CONFIG, CITIES } from '../config.ts';
import { STRINGS } from '../strings.ts';
import { CityOutlook } from '../types.ts';
import {
  OutlineDrawCard,
  OutlineDrawHeading,
  OutlineDrawBody,
  OutlineDrawVisual,
} from './OutlineDrawCard.tsx';

interface HomeScreenProps {
  outlooks: Record<string, CityOutlook>;
  onSelectScreen: (screen: 'home' | 'map' | 'school-mode' | 'how-it-works' | 'accuracy' | 'test-view') => void;
  onSelectCity: (cityId: string) => void;
  lastUpdatedFormatted: string;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  outlooks,
  onSelectScreen,
  onSelectCity,
  lastUpdatedFormatted,
}) => {
  const [imageError, setImageError] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const heroImagePath = '/src/assets/images/uae_dust_monitoring_hero_1793364864881.jpg';

  const handleCityClick = (cityId: string) => {
    onSelectCity(cityId);
    onSelectScreen('map');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.08,
        delayChildren: 0.02,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
    },
  };

  return (
    <div className="space-y-16 pb-12">
      {/* Hero Section */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="relative pt-4 sm:pt-8"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Main Hero Copy and Actions */}
          <div className="lg:col-span-8">
            {/* Metadata line: Zero-pill discipline */}
            <motion.div
              variants={itemVariants}
              className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#713F2B] uppercase mb-4"
            >
              <span className="text-[#713F2B] font-extrabold">{STRINGS.home.heroKicker}</span>
              <span aria-hidden="true" className="text-[#E8874A]">·</span>
              <span className="text-[#713F2B] font-medium">{STRINGS.app.badge}</span>
              <span aria-hidden="true" className="text-[#E8874A]">·</span>
              <span className="text-[#6B564B]">Updated {lastUpdatedFormatted}</span>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              style={{ textWrap: 'balance' }}
              className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#3A1E13] leading-[1.12] mb-6"
            >
              {STRINGS.home.heroHeadline}
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="text-base sm:text-lg text-[#5A453A] leading-relaxed max-w-2xl mb-8"
            >
              {STRINGS.home.heroDescription}
            </motion.p>

            {/* Primary & Secondary Action Pair with Full Mobile Touch Support */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={() => onSelectScreen('map')}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-[#244C3B] text-white font-semibold text-sm rounded-lg hover:bg-[#1B3A2D] active:scale-[0.98] transition-all shadow-xs hover:shadow-sm cursor-pointer whitespace-nowrap min-h-[48px] interactive-tap"
              >
                <span>{STRINGS.home.exploreCta}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                type="button"
                onClick={() => onSelectScreen('how-it-works')}
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-[#713F2B] border border-[#DFCBB3] font-semibold text-sm rounded-lg hover:bg-[#E8D2B4]/40 hover:border-[#E8874A]/50 active:scale-[0.98] transition-all shadow-xs cursor-pointer whitespace-nowrap min-h-[48px] interactive-tap"
              >
                <span>{STRINGS.home.howItWorksCta}</span>
              </button>
            </motion.div>
          </div>

          {/* Official Primary Logo Showcase in Hero */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-4 flex flex-col items-center justify-center"
          >
            <div className="w-full max-w-[280px] sm:max-w-[320px] lg:max-w-none bg-[#FFFDFB] border border-[#DFCBB3] rounded-2xl p-6 sm:p-7 shadow-xs hover:shadow-sm transition-shadow duration-300 flex flex-col items-center text-center">
              <img
                src="/assets/dustwatch-logo-transparent.png"
                alt="DustWatch - Official Logo"
                className="w-full max-w-[220px] sm:max-w-[240px] h-auto object-contain drop-shadow-2xs"
                width={929}
                height={580}
                loading="eager"
              />
              <div className="mt-4 pt-3.5 border-t border-[#DFCBB3]/80 w-full">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#713F2B] block">
                  Official Project Identity
                </span>
                <span className="text-xs text-[#5A453A] font-medium block mt-0.5">
                  UAE Atmospheric Particulate & Dust Outlook
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Visual Introduction to UAE Dust Monitoring */}
      <OutlineDrawCard
        outlineColor="#E8874A"
        baseBorderColor="rgba(223, 203, 179, 0.5)"
        borderRadius={12}
        duration={0.75}
        className="overflow-hidden rounded-xl border border-[#DFCBB3] border-t-4 border-t-[#E8874A] bg-[#FFFDFB] shadow-xs transition-shadow duration-300 hover:shadow-sm"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Image Container with Fallback */}
          <div className="lg:col-span-7 relative min-h-[220px] sm:min-h-[300px] lg:min-h-[420px] bg-[#E8D2B4]/30 flex items-center justify-center overflow-hidden">
            {!imageError ? (
              <motion.img
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.03 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                src={heroImagePath}
                alt="Meteorological observation station in the UAE desert dunes measuring atmospheric aerosol optical depth and particulate levels"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
                className="w-full h-full object-cover object-center transition-transform duration-700 hover:scale-[1.01]"
              />
            ) : (
              <div className="p-8 text-center flex flex-col items-center justify-center h-full text-[#713F2B]">
                <Wind className="w-12 h-12 mb-3 text-[#E8874A]" />
                <h3 className="font-bold text-lg text-[#3A1E13]">UAE Atmospheric Observation</h3>
                <p className="text-xs text-[#6B564B] max-w-sm mt-1">
                  Continuous atmospheric analysis combining Open-Meteo forecasts and CAMS particulate models.
                </p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent lg:hidden" />
          </div>

          {/* Context & Scientific Narrative */}
          <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between bg-[#FFFDFB]">
            <div className="space-y-4">
              <OutlineDrawHeading>
                <div className="flex items-center gap-2 text-xs font-bold text-[#713F2B] uppercase tracking-wider">
                  <Compass className="w-4 h-4 text-[#E8874A]" />
                  <span>Regional Atmospheric Context</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#3A1E13] tracking-tight mt-1">
                  {STRINGS.home.monitoringIntroTitle}
                </h2>
              </OutlineDrawHeading>

              <OutlineDrawBody>
                <p className="text-sm text-[#5A453A] leading-relaxed">
                  {STRINGS.home.monitoringIntroBody}
                </p>

                {/* Atmospheric Dust & Warm Sand Context Detail */}
                <div className="mt-3 p-3 rounded-lg bg-[#E8D2B4]/50 border border-[#DFCBB3] text-[#5A382A] text-xs flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8874A] mt-1.5 shrink-0" />
                  <p className="leading-relaxed">
                    <strong className="text-[#713F2B]">Arabian Desert Dynamics:</strong> Diurnal heating and regional shamal winds lift desert dust particles into the boundary layer, producing late-afternoon and sunset atmospheric haze.
                  </p>
                </div>
              </OutlineDrawBody>

              <OutlineDrawVisual>
                <div className="pt-2 text-xs text-[#6B564B] space-y-1.5 border-t border-[#DFCBB3]">
                  <p className="font-semibold text-[#3A1E13]">Operational Pillars:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="flex items-center gap-1.5 text-[#5A453A]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E8874A]" /> 7 Atmospheric Factors
                    </span>
                    <span className="flex items-center gap-1.5 text-[#5A453A]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E8874A]" /> Physical Particle Cap
                    </span>
                    <span className="flex items-center gap-1.5 text-[#5A453A]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E8874A]" /> 10 UAE Municipalities
                    </span>
                    <span className="flex items-center gap-1.5 text-[#5A453A]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E8874A]" /> 30-Min Telemetry Cycle
                    </span>
                  </div>
                </div>
              </OutlineDrawVisual>
            </div>

            <OutlineDrawVisual delayOffset={0.28}>
              <div className="pt-6 mt-6 border-t border-[#DFCBB3] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectScreen('map')}
                  className="text-xs font-bold text-[#713F2B] hover:text-[#E8874A] flex items-center gap-1.5 cursor-pointer min-h-[44px] interactive-tap group"
                >
                  <span>Launch Interactive Map View</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1 text-[#E8874A]" />
                </button>
                <span className="text-[11px] text-[#6B564B]">No login required</span>
              </div>
            </OutlineDrawVisual>
          </div>
        </div>
      </OutlineDrawCard>

      {/* Live Conditions Snapshot Across UAE Cities (Ten-city pulse strip) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#3A1E13]">
              Live Regional Risk Overview
            </h2>
            <p className="text-sm text-[#5A453A] mt-0.5">
              Click any city to open its dedicated 12-hour timeline and factor analysis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectScreen('map')}
            className="text-xs font-bold text-[#244C3B] hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer group min-h-[44px]"
          >
            <span>Full UAE Interactive Map</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CITIES.map((city) => {
            const outlook = outlooks[city.id];
            const level = outlook ? outlook.levelNow : 'Low';
            const score = outlook ? Math.round(outlook.scoreNow) : 0;
            const colorCfg = APP_CONFIG.colors[level];

            return (
              <button
                key={city.id}
                type="button"
                onClick={() => handleCityClick(city.id)}
                className="p-3.5 bg-[#FFFDFB] border border-[#DFCBB3] hover:border-[#E8874A] hover:bg-[#FFF8F0] rounded-lg text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.98] cursor-pointer group flex flex-col justify-between min-h-[104px]"
              >
                <div>
                  <div className="text-xs text-[#6B564B] group-hover:text-[#713F2B] transition-colors">
                    Emirate / City
                  </div>
                  <div className="font-bold text-sm text-[#2D1A12] truncate mt-0.5">
                    {city.name}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#F2E5D5]">
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
                  <span className="font-mono text-xs font-bold text-[#713F2B]">
                    {score}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Core Platform Capabilities: Bento-Style Grid */}
      <section className="space-y-6">
        <div>
          <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8874A]" />
            <span>Platform Architecture</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#3A1E13]">
            Engineered for Plain Environmental Clarity
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Interactive UAE Map */}
          <OutlineDrawCard
            outlineColor="#E8874A"
            baseBorderColor="rgba(223, 203, 179, 0.45)"
            borderRadius={12}
            duration={0.7}
            delay={0}
            className="p-6 dw-panel flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs group"
          >
            <div className="space-y-3">
              <OutlineDrawHeading>
                <div className="w-10 h-10 rounded-lg bg-[#E8D2B4]/50 text-[#713F2B] flex items-center justify-center transition-colors group-hover:bg-[#E8874A] group-hover:text-white mb-3">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#3A1E13]">
                  {STRINGS.home.pillars[0].title}
                </h3>
              </OutlineDrawHeading>

              <OutlineDrawBody>
                <p className="text-sm text-[#5A453A] leading-relaxed">
                  {STRINGS.home.pillars[0].desc}
                </p>
              </OutlineDrawBody>
            </div>

            <OutlineDrawVisual>
              <div className="pt-6 mt-4 border-t border-[#DFCBB3]">
                <button
                  type="button"
                  onClick={() => onSelectScreen('map')}
                  className="text-xs font-bold text-[#244C3B] hover:underline flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                >
                  <span>View Map Layers & Rasters</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </OutlineDrawVisual>
          </OutlineDrawCard>

          {/* Card 2: 12-Hour Outlook & Window Scoring - Featured Warm Sunset Surface */}
          <OutlineDrawCard
            outlineColor="#E8874A"
            baseBorderColor="rgba(232, 135, 74, 0.5)"
            borderRadius={12}
            duration={0.7}
            delay={0.12}
            className="p-6 bg-gradient-to-br from-[#FFF8F2] via-[#F7ECE1] to-[#E8D2B4]/50 border border-[#E8874A]/80 rounded-xl flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs group"
          >
            <div className="space-y-3">
              <OutlineDrawHeading>
                <div className="w-10 h-10 rounded-lg bg-[#E8874A] text-white flex items-center justify-center shadow-xs mb-3">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#3A1E13]">
                  {STRINGS.home.pillars[1].title}
                </h3>
              </OutlineDrawHeading>

              <OutlineDrawBody>
                <p className="text-sm text-[#5A453A] leading-relaxed">
                  {STRINGS.home.pillars[1].desc}
                </p>
              </OutlineDrawBody>
            </div>

            <OutlineDrawVisual>
              <div className="pt-6 mt-4 border-t border-[#DFCBB3]">
                <button
                  type="button"
                  onClick={() => onSelectScreen('map')}
                  className="text-xs font-bold text-[#713F2B] hover:text-[#E8874A] flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                >
                  <span>Explore Hourly Trajectories</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1 text-[#E8874A]" />
                </button>
              </div>
            </OutlineDrawVisual>
          </OutlineDrawCard>

          {/* Card 3: School Safety Mode */}
          <OutlineDrawCard
            outlineColor="#244C3B"
            baseBorderColor="rgba(223, 203, 179, 0.45)"
            borderRadius={12}
            duration={0.7}
            delay={0.08}
            className="p-6 dw-panel flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs group"
          >
            <div className="space-y-3">
              <OutlineDrawHeading>
                <div className="w-10 h-10 rounded-lg bg-[#E8D2B4]/50 text-[#713F2B] flex items-center justify-center transition-colors group-hover:bg-[#244C3B] group-hover:text-white mb-3">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#3A1E13]">
                  {STRINGS.home.pillars[2].title}
                </h3>
              </OutlineDrawHeading>

              <OutlineDrawBody>
                <p className="text-sm text-[#5A453A] leading-relaxed">
                  {STRINGS.home.pillars[2].desc}
                </p>
              </OutlineDrawBody>
            </div>

            <OutlineDrawVisual>
              <div className="pt-6 mt-4 border-t border-[#DFCBB3]">
                <button
                  type="button"
                  onClick={() => onSelectScreen('school-mode')}
                  className="text-xs font-bold text-[#244C3B] hover:underline flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                >
                  <span>{STRINGS.home.schoolModeCta}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </OutlineDrawVisual>
          </OutlineDrawCard>

          {/* Card 4: Methodology & Open Science */}
          <OutlineDrawCard
            outlineColor="#E8874A"
            baseBorderColor="rgba(223, 203, 179, 0.45)"
            borderRadius={12}
            duration={0.7}
            delay={0.2}
            className="p-6 dw-panel flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs group"
          >
            <div className="space-y-3">
              <OutlineDrawHeading>
                <div className="w-10 h-10 rounded-lg bg-[#E8D2B4]/50 text-[#713F2B] flex items-center justify-center transition-colors group-hover:bg-[#244C3B] group-hover:text-white mb-3">
                  <Scale className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#3A1E13]">
                  {STRINGS.home.pillars[3].title}
                </h3>
              </OutlineDrawHeading>

              <OutlineDrawBody>
                <p className="text-sm text-[#5A453A] leading-relaxed">
                  {STRINGS.home.pillars[3].desc}
                </p>
              </OutlineDrawBody>
            </div>

            <OutlineDrawVisual>
              <div className="pt-6 mt-4 border-t border-[#DFCBB3] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectScreen('how-it-works')}
                  className="text-xs font-bold text-[#244C3B] hover:underline flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                >
                  <span>Read Full Methodology</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectScreen('accuracy')}
                  className="text-xs text-[#6B564B] hover:text-[#3A1E13] cursor-pointer min-h-[44px] inline-flex items-center"
                >
                  {STRINGS.home.accuracyCta}
                </button>
              </div>
            </OutlineDrawVisual>
          </OutlineDrawCard>
        </div>
      </section>

      {/* Transparent Disclaimer & Scientific Caution Section - Prominent Soft Sand Surface */}
      <OutlineDrawCard
        outlineColor="#713F2B"
        baseBorderColor="rgba(216, 195, 170, 0.6)"
        borderRadius={12}
        delay={0.06}
        duration={0.75}
        className="p-6 sm:p-8 rounded-xl bg-[#E8D2B4] border border-[#D8C3AA] text-[#3D251A] space-y-4"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#713F2B] shrink-0 mt-0.5" />
          <div className="space-y-2 w-full">
            <OutlineDrawHeading>
              <h3 className="font-bold text-base text-[#713F2B]">
                Experimental Project Disclaimer & Safety Boundaries
              </h3>
            </OutlineDrawHeading>

            <OutlineDrawBody>
              <p className="text-sm text-[#4D3123] leading-relaxed">
                {STRINGS.home.experimentalNotice}
              </p>
            </OutlineDrawBody>

            <OutlineDrawVisual>
              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
                <a
                  href={STRINGS.disclaimer.ncmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-[#244C3B] hover:underline min-h-[44px]"
                >
                  <span>National Center of Meteorology (ncm.ae)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <span className="text-[#6B564B] hidden sm:inline">|</span>
                <span className="text-[#6B564B]">Data source: Open-Meteo & CAMS Atmospheric Models</span>
              </div>
            </OutlineDrawVisual>
          </div>
        </div>
      </OutlineDrawCard>
    </div>
  );
};
