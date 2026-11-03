/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { APP_CONFIG } from './config.ts';
import { CityOutlook, ModelFileConfig, RawCityData, SchoolPolicyConfig } from './types.ts';
import { DEFAULT_UNCONFIGURED_POLICY, validateSchoolPolicy } from './schoolPolicy.ts';
import { DataFetchStatus, getCityOutlooks } from './dataService.ts';
import { Navbar } from './components/Navbar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { PageHeader } from './components/PageHeader.tsx';
import { Banners } from './components/Banners.tsx';
import { DisclaimerBar } from './components/DisclaimerBar.tsx';
import { Footer } from './components/Footer.tsx';
import { HomeScreen } from './components/HomeScreen.tsx';
import { MapScreen } from './components/MapScreen.tsx';
import { SchoolModeScreen } from './components/SchoolModeScreen.tsx';
import { HowItWorksScreen } from './components/HowItWorksScreen.tsx';
import { AccuracyScreen } from './components/AccuracyScreen.tsx';
import { TestView } from './components/TestView.tsx';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<'home' | 'map' | 'school-mode' | 'how-it-works' | 'accuracy' | 'test-view'>('home');
  const shouldReduceMotion = useReducedMotion();

  const [selectedCityId, setSelectedCityId] = useState<string>(() => {
    try {
      return localStorage.getItem('dustwatch_city') || APP_CONFIG.defaultSelectedCityId;
    } catch {
      return APP_CONFIG.defaultSelectedCityId;
    }
  });

  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dustwatch_demo') === 'true';
    } catch {
      return false;
    }
  });

  const [outlooks, setOutlooks] = useState<Record<string, CityOutlook>>({});
  const [rawCityData, setRawCityData] = useState<Record<string, RawCityData>>({});
  const [status, setStatus] = useState<DataFetchStatus>({
    isLoading: true,
    isError: false,
    isDemoMode: false,
    isSnapshotLoaded: false,
    hasLiveCache: false,
  });
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeModel, setActiveModel] = useState<ModelFileConfig | null>(null);
  const [schoolPolicy, setSchoolPolicy] = useState<SchoolPolicyConfig>(() => {
    try {
      const saved = localStorage.getItem('dustwatch_school_policy');
      if (saved) return validateSchoolPolicy(JSON.parse(saved));
    } catch {
      // ignore
    }
    return DEFAULT_UNCONFIGURED_POLICY;
  });

  // Save selected city safely
  const handleSelectCity = useCallback((cityId: string) => {
    setSelectedCityId(cityId);
    try {
      localStorage.setItem('dustwatch_city', cityId);
    } catch {
      // Storage unavailable, ignore safely
    }
  }, []);

  // Toggle demo mode safely
  const handleToggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dustwatch_demo', String(next));
      } catch {
        // Storage unavailable, ignore safely
      }
      return next;
    });
  }, []);

  // Fetch or refresh data
  const loadData = useCallback(
    async (forceRefresh: boolean = false) => {
      setIsRefreshing(true);
      try {
        const result = await getCityOutlooks(isDemoMode, forceRefresh, activeModel);
        setOutlooks(result.outlooks);
        setRawCityData(result.rawCityData);
        setStatus(result.status);
      } catch (err) {
        console.error('Fatal loadData error:', err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [isDemoMode, activeModel]
  );

  // Initial load and when demo mode or model changes
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Automatic refresh every 30 minutes
  useEffect(() => {
    const timer = setInterval(() => {
      loadData(true);
    }, APP_CONFIG.autoRefreshIntervalMs);

    return () => clearInterval(timer);
  }, [loadData]);

  const lastUpdatedFormatted =
    status.lastFetchTimeFormatted ||
    status.lastLiveFetchTime ||
    'Updating...';

  return (
    <div className="min-h-screen flex flex-col text-[#2D221C]">
      {/* Compact sidebar (large screens) */}
      <Sidebar activeScreen={activeScreen} onSelectScreen={setActiveScreen} />

      <div className="flex-1 flex flex-col lg:pl-[84px]">
      {/* Top Navigation (mobile and tablet) */}
      <Navbar
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
        onRefresh={() => loadData(true)}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdatedFormatted}
      />

      <PageHeader
        activeScreen={activeScreen}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* Prominent Banners for data status */}
      <Banners status={status} />

      {/* Main Content Area: pb-24 ensures fixed DisclaimerBar never covers content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-28 overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeScreen}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            {activeScreen === 'home' && (
              <HomeScreen
                outlooks={outlooks}
                onSelectScreen={setActiveScreen}
                onSelectCity={handleSelectCity}
                lastUpdatedFormatted={lastUpdatedFormatted}
              />
            )}

            {activeScreen === 'map' && (
              <MapScreen
                outlooks={outlooks}
                selectedCityId={selectedCityId}
                onSelectCity={handleSelectCity}
                lastUpdatedFormatted={lastUpdatedFormatted}
                isDemoMode={isDemoMode}
                onRefresh={() => loadData(true)}
                isRefreshing={isRefreshing}
                onToggleDemoMode={handleToggleDemoMode}
                onSelectScreen={setActiveScreen}
              />
            )}

            {activeScreen === 'school-mode' && (
              <SchoolModeScreen
                outlooks={outlooks}
                rawCityData={rawCityData}
                selectedCityId={selectedCityId}
                onSelectCity={handleSelectCity}
                lastUpdatedFormatted={lastUpdatedFormatted}
                schoolPolicy={schoolPolicy}
                onUpdateSchoolPolicy={setSchoolPolicy}
                isDemoMode={isDemoMode}
              />
            )}

            {activeScreen === 'how-it-works' && <HowItWorksScreen />}

            {activeScreen === 'accuracy' && (
              <AccuracyScreen />
            )}

            {/* Internal diagnostics: not a public destination unless showTestViewLink is enabled in config */}
            {APP_CONFIG.showTestViewLink && activeScreen === 'test-view' && (
              <TestView
                outlooks={outlooks}
                rawCityData={rawCityData}
                selectedCityId={selectedCityId}
                onSelectCity={handleSelectCity}
                onDataRefresh={(force) => loadData(force)}
                activeModel={activeModel}
                onSetActiveModel={setActiveModel}
                schoolPolicy={schoolPolicy}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <Footer
        onSelectScreen={setActiveScreen}
        activeScreen={activeScreen}
      />

      </div>

      {/* Fixed bottom disclaimer bar (present on every screen) */}
      <DisclaimerBar />
    </div>
  );
}
