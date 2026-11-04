/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BookOpen, Info, ShieldAlert } from 'lucide-react';
import { APP_CONFIG } from '../config.ts';
import { STRINGS } from '../strings.ts';
import { EvaluationPredictorStats } from '../types.ts';
import {
  OutlineDrawCard,
  OutlineDrawHeading,
  OutlineDrawBody,
  OutlineDrawVisual,
} from './OutlineDrawCard.tsx';

export const AccuracyScreen: React.FC = () => {
  const renderStatsRow = (name: string, stats: EvaluationPredictorStats) => {
    const formatPct = (val: number | null) =>
      val !== null ? `${(val * 100).toFixed(1)}%` : 'n/a';

    return (
      <tr key={name} className="hover:bg-[#F7F1E8] border-b border-[#DFCBB3]">
        <td className="py-2.5 px-3 font-semibold text-[#2D221C]">{name}</td>
        <td className="py-2.5 px-3 text-center font-mono">{stats.hits}</td>
        <td className="py-2.5 px-3 text-center font-mono text-red-600 font-bold">{stats.misses}</td>
        <td className="py-2.5 px-3 text-center font-mono text-amber-600">{stats.falseAlarms}</td>
        <td className="py-2.5 px-3 text-center font-mono text-emerald-600">{stats.correctNegatives}</td>
        <td className="py-2.5 px-3 text-center font-semibold text-[#244C3B]">{formatPct(stats.hitRate)}</td>
        <td className="py-2.5 px-3 text-center text-red-700">{formatPct(stats.missRate)}</td>
        <td className="py-2.5 px-3 text-center text-amber-800">{formatPct(stats.falseAlarmRatio)}</td>
        <td className="py-2.5 px-3 text-center font-bold text-[#2D221C]">{formatPct(stats.accuracy)}</td>
      </tr>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div>
        <div className="text-xs font-bold text-[#713F2B] uppercase tracking-wider mb-1">
          Model Evaluation & Verification
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#713F2B]">
          {STRINGS.accuracy.title}
        </h1>
        <p className="text-sm text-[#5A453A] mt-1">
          {STRINGS.accuracy.subtitle}
        </p>
      </div>

      {/* 1. How we define a dust event (Top highlighted box) */}
      <OutlineDrawCard
        outlineColor="#E8874A"
        baseBorderColor="rgba(252, 211, 77, 0.7)"
        borderRadius={8}
        duration={0.7}
        delay={0.05}
        className="bg-amber-50 border border-amber-300 rounded-lg p-5 shadow-xs space-y-3"
      >
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="w-full space-y-2">
            <OutlineDrawHeading>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-base font-bold text-amber-950">
                  {STRINGS.accuracy.eventDefHeader}
                </h2>
                <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-semibold border border-amber-300">
                  {APP_CONFIG.eventDefinitionStatus}
                </span>
              </div>
            </OutlineDrawHeading>

            <OutlineDrawBody>
              <div className="p-3 bg-white/90 rounded border border-amber-200 text-sm font-mono text-[#2D221C]">
                {APP_CONFIG.eventDefinitionText}
              </div>
            </OutlineDrawBody>

            <OutlineDrawVisual>
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-medium text-amber-950">
                  {APP_CONFIG.eventDefinitionDataSource}
                </p>
                <p className="p-2 bg-amber-100/70 border border-amber-300 rounded font-semibold text-amber-950">
                  {APP_CONFIG.eventDefinitionCircularWarning}
                </p>
              </div>
            </OutlineDrawVisual>
          </div>
        </div>
      </OutlineDrawCard>

      {/* 1b. Historical Validation Methodology & Benchmarks */}
      <OutlineDrawCard
        outlineColor="#713F2B"
        baseBorderColor="rgba(213, 217, 223, 0.6)"
        borderRadius={8}
        duration={0.75}
        delay={0.08}
        className="dw-panel p-5 space-y-3"
      >
        <OutlineDrawHeading>
          <h2 className="text-base font-bold text-[#2D221C] flex items-center gap-2">
            <Info className="w-4 h-4 text-[#244C3B]" />
            <span>Historical Validation Methodology: Chronological Splits & Benchmarks</span>
          </h2>
        </OutlineDrawHeading>

        <OutlineDrawBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
            <div className="p-3 bg-[#F7F1E8] rounded border border-[#DFCBB3] space-y-1.5">
              <h3 className="font-bold text-[#2D221C]">1. Chronological Time-Series Splits (No Random K-Fold)</h3>
              <p className="text-[#5A453A] leading-relaxed">
                Atmospheric data is heavily auto-correlated across consecutive hours and days. Random k-fold cross-validation causes severe data leakage (future hours leaking into training folds).
                DustWatch strictly mandates chronological train/test partitioning (e.g. 2021–2022 train, 2023–2024 test &mdash; <em>Example of a planned method, not what was done</em>) across all 10 UAE grid points.
              </p>
            </div>

            <div className="p-3 bg-[#F7F1E8] rounded border border-[#DFCBB3] space-y-1.5">
              <h3 className="font-bold text-[#2D221C]">2. Persistence Benchmark ("the next 12 hours look like now")</h3>
              <p className="text-[#5A453A] leading-relaxed">
                Any valid predictive system must outperform persistence. In weather forecasting, the persistence benchmark assumes the next 12 hours look like now.
                In our evaluations, the persistence benchmark ("the next 12 hours look like now") is tracked alongside the baseline rule score to ensure true skill score gain.
              </p>
            </div>
          </div>
        </OutlineDrawBody>

        <OutlineDrawVisual>
          <div className="p-3 bg-red-50 rounded border border-red-200 text-xs text-red-950">
            <strong>The Rare-Event Imbalance Paradox:</strong> Dust events are usually rare. The team will measure the real share in its own data. A naive predictor that always outputs "Low" would achieve high raw accuracy while missing hazardous dust events. Consequently, <strong>Hit Rate (Recall)</strong> and <strong>Miss Rate</strong> are the primary safety-critical metrics, not overall accuracy.
          </div>
        </OutlineDrawVisual>
      </OutlineDrawCard>

      {/* 2. Plain-language explanation of the four outcomes */}
      <OutlineDrawCard
        outlineColor="#E8874A"
        baseBorderColor="rgba(213, 217, 223, 0.6)"
        borderRadius={8}
        duration={0.7}
        delay={0.12}
        className="dw-panel p-5 space-y-4"
      >
        <OutlineDrawHeading>
          <h2 className="text-base font-bold text-[#2D221C]">
            {STRINGS.accuracy.outcomesTitle}
          </h2>
        </OutlineDrawHeading>

        <OutlineDrawBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STRINGS.accuracy.outcomes.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-lg border border-[#DFCBB3] bg-[#F7F1E8]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-[#2D221C]">{item.name}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      item.name === 'Hit'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : item.name === 'Miss'
                        ? 'bg-red-100 text-red-800 border-red-300'
                        : item.name === 'False Alarm'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-[#E8F0E7] text-[#1B3A2D] border-[#C5D9C5]'
                    }`}
                  >
                    {item.badge}
                  </span>
                </div>
                <p className="text-xs text-[#5A453A] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </OutlineDrawBody>
      </OutlineDrawCard>

      {/* 3. Official Results Panel */}
      <section className="dw-panel p-5 space-y-3">
        <h2 className="text-base font-bold text-[#2D221C] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#2D221C]" />
          <span>{STRINGS.accuracy.officialTitle}</span>
        </h2>

        {!APP_CONFIG.evaluationResults ? (
          <div className="p-4 rounded-lg bg-[#F7F1E8] border border-[#DFCBB3] text-center py-6">
            <h3 className="font-bold text-base text-[#2D221C] mb-1">
              {STRINGS.accuracy.notYetEvaluatedTitle}
            </h3>
            <p className="text-xs text-[#5A453A] max-w-xl mx-auto leading-relaxed">
              {STRINGS.accuracy.notYetEvaluatedDesc}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* If filled in config, render official table */}
            <p className="text-xs text-[#5A453A]">
              Dataset: {APP_CONFIG.evaluationResults.datasetDescription} ({APP_CONFIG.evaluationResults.period})
            </p>
            <div className="overflow-x-auto border border-[#DFCBB3] rounded-md">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F7F1E8] border-b border-[#DFCBB3]">
                  <tr>
                    <th className="py-2 px-3">Predictor</th>
                    <th className="py-2 px-3 text-center">Hits</th>
                    <th className="py-2 px-3 text-center">Misses</th>
                    <th className="py-2 px-3 text-center">False Alarms</th>
                    <th className="py-2 px-3 text-center">Correct Neg.</th>
                    <th className="py-2 px-3 text-center">Hit Rate</th>
                    <th className="py-2 px-3 text-center">Miss Rate</th>
                    <th className="py-2 px-3 text-center">FAR</th>
                    <th className="py-2 px-3 text-center">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {renderStatsRow('Baseline Rule Score', APP_CONFIG.evaluationResults.predictors.baselineRuleScore)}
                  {APP_CONFIG.evaluationResults.predictors.trainedModel &&
                    renderStatsRow('Trained Model', APP_CONFIG.evaluationResults.predictors.trainedModel)}
                  {APP_CONFIG.evaluationResults.predictors.persistenceBenchmark &&
                    renderStatsRow('Persistence ("the next 12 hours look like now")', APP_CONFIG.evaluationResults.predictors.persistenceBenchmark)}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#5A453A]">{STRINGS.accuracy.accuracyCaveat}</p>
          </div>
        )}
      </section>

      {/* 4. Known Limitations List */}
      <section className="dw-panel p-5 space-y-3">
        <h2 className="text-base font-bold text-[#2D221C] flex items-center gap-2">
          <Info className="w-4 h-4 text-[#2D221C]" />
          <span>{STRINGS.accuracy.limitationsTitle}</span>
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#5A453A] leading-relaxed">
          {STRINGS.accuracy.limitations.map((lim, idx) => (
            <li key={idx}>{lim}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};
