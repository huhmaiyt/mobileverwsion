/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { APP_CONFIG } from '../config.ts';
import { STRINGS } from '../strings.ts';
import {
  CsvEvaluationResult,
  getCsvTemplate,
  parseAndEvaluateCsv,
} from '../evaluation.ts';
import { EvaluationPredictorStats, WorkbenchEvaluationOutput } from '../types.ts';
import {
  OutlineDrawCard,
  OutlineDrawHeading,
  OutlineDrawBody,
  OutlineDrawVisual,
} from './OutlineDrawCard.tsx';

interface AccuracyScreenProps {
  workbenchData?: WorkbenchEvaluationOutput | null;
}

export const AccuracyScreen: React.FC<AccuracyScreenProps> = ({ workbenchData }) => {
  const [csvEvaluation, setCsvEvaluation] = useState<CsvEvaluationResult | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // Automatically load when workbenchData is passed
  React.useEffect(() => {
    if (workbenchData) {
      setCsvError(null);
      const res = parseAndEvaluateCsv(workbenchData.csvText, {
        hindcastLabel: workbenchData.metadata.hindcastLabel,
        searchedPeriod: workbenchData.metadata.searchedPeriod,
        searchedCities: workbenchData.metadata.searchedCities,
        thresholdsUsed: {
          thresholds: APP_CONFIG.thresholds,
          cutoffs: APP_CONFIG.cutoffs,
          eventPredictionLevel: APP_CONFIG.eventPredictionLevel,
          matchToleranceHours: APP_CONFIG.matchToleranceHours,
        },
        splitInfo: workbenchData.splitStats,
        isSynthetic: workbenchData.isSynthetic ?? workbenchData.metadata.isSynthetic,
      });

      if (res.success && res.result) {
        setCsvEvaluation(res.result);
      } else {
        setCsvError(res.error || 'Failed to load workbench data.');
      }
    }
  }, [workbenchData]);

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCopiedJson(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const res = parseAndEvaluateCsv(text);
      if (res.success && res.result) {
        setCsvEvaluation(res.result);
      } else {
        setCsvError(res.error || 'Failed to parse CSV');
        setCsvEvaluation(null);
      }
    };
    reader.onerror = () => {
      setCsvError('Failed to read the selected file');
      setCsvEvaluation(null);
    };
    reader.readAsText(file);
  };

  // Download template
  const handleDownloadTemplate = () => {
    const templateContent = getCsvTemplate();
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'dustwatch_evaluation_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy JSON
  const handleCopyJson = () => {
    if (!csvEvaluation?.jsonOutput) return;
    navigator.clipboard.writeText(csvEvaluation.jsonOutput).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 3000);
    });
  };

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
                In our CSV evaluation tool, the persistence benchmark ("the next 12 hours look like now") is tracked alongside the baseline rule score to ensure true skill score gain.
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
          </div>
        )}
      </section>

      {/* 4. Team CSV Evaluation Tool */}
      <section className="dw-panel p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#2D221C] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#244C3B]" />
            <span>{STRINGS.accuracy.csvToolTitle}</span>
          </h2>
          <p className="text-xs text-[#5A453A] mt-1">
            {STRINGS.accuracy.csvToolDesc}
          </p>
        </div>

        {/* Action Bar: Upload, Download Template */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#244C3B] text-white rounded-md text-xs sm:text-sm font-semibold hover:bg-[#244C3B] cursor-pointer min-h-[44px]">
            <Upload className="w-4 h-4" />
            <span>{STRINGS.accuracy.csvUploadLabel}</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[#FFFDF8] border border-[#DFCBB3] text-[#2D221C] rounded-md text-xs sm:text-sm font-medium hover:bg-[#F7F1E8] min-h-[44px]"
          >
            <Download className="w-4 h-4 text-[#6B564B]" />
            <span>{STRINGS.accuracy.csvDownloadTemplate}</span>
          </button>
        </div>

        {/* Error message */}
        {csvError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong>CSV Error: </strong>
              <span>{csvError}</span>
            </div>
          </div>
        )}

        {/* Evaluation Results Output */}
        {csvEvaluation && (
          <div className="space-y-4 pt-3 border-t border-[#DFCBB3]">
            {/* Summary counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded bg-[#F7F1E8] border border-[#DFCBB3]">
                <span className="text-[#5A453A] block">Valid Data Rows</span>
                <span className="font-bold text-base text-[#2D221C]">{csvEvaluation.validRowsCount}</span>
              </div>
              <div className="p-2.5 rounded bg-[#F7F1E8] border border-[#DFCBB3]">
                <span className="text-[#5A453A] block">Observed Events</span>
                <span className="font-bold text-base text-[#2D221C]">{csvEvaluation.observedEventsCount}</span>
              </div>
              <div className="p-2.5 rounded bg-[#F7F1E8] border border-[#DFCBB3]">
                <span className="text-[#5A453A] block">Ignored Invalid Rows</span>
                <span className="font-bold text-base text-amber-700">{csvEvaluation.ignoredRowsCount}</span>
              </div>
              <div className="p-2.5 rounded bg-[#F7F1E8] border border-[#DFCBB3]">
                <span className="text-[#5A453A] block">Event Threshold</span>
                <span className="font-bold text-base text-[#244C3B]">&ge; {APP_CONFIG.eventPredictionLevel}</span>
              </div>
            </div>

            {/* Warning if too few events */}
            {!csvEvaluation.hasEnoughEvents && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{STRINGS.accuracy.tooFewEvents}</span>
              </div>
            )}

            {/* A6: Provenance Display when results are from Workbench */}
            {csvEvaluation.workbenchMetadata && (
              <div className="p-4 bg-[#E8F0E7] border border-[#C5D9C5] rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-[#E8F0E7] text-[#1B3A2D] border border-[#C5D9C5] px-2 py-0.5 rounded font-bold uppercase tracking-wide">
                    Evaluation Workbench Run
                  </span>
                  <span className="text-xs text-[#1B3A2D] font-semibold">
                    {csvEvaluation.workbenchMetadata.hindcastLabel}
                  </span>
                </div>

                {csvEvaluation.workbenchMetadata.isSynthetic && (
                  <div className="p-3 bg-amber-100 border border-amber-400 rounded text-xs text-amber-950 flex items-start gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span>
                        Notice: This dataset was generated from synthetic demonstration data. Real-world accuracy claims cannot be substantiated using synthetic data.
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#1B3A2D] pt-1">
                  <div>
                    <strong>Searched Period: </strong>
                    <span className="font-mono">
                      {csvEvaluation.workbenchMetadata.searchedPeriod.start} &rarr; {csvEvaluation.workbenchMetadata.searchedPeriod.end}
                    </span>
                  </div>
                  <div>
                    <strong>Searched Cities: </strong>
                    <span>{csvEvaluation.workbenchMetadata.searchedCities.join(', ')}</span>
                  </div>
                </div>

                {/* Thresholds used */}
                <div className="pt-2 border-t border-[#C5D9C5] text-xs text-[#1B3A2D] space-y-1">
                  <strong>Thresholds &amp; Cutoffs Tested:</strong>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[11px] pt-1">
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5]">Dust: 20-300 (30%)</span>
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5]">PM10: 50-400 (25%)</span>
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5]">Gusts: 25-70 (10%)</span>
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5]">Wind: 15-50 (10%)</span>
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5]">AOD: 0.2-1.5 (10%)</span>
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5]">Vis: 10k-1k (10%)</span>
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5]">Humidity: 60-15% (5%)</span>
                    <span className="bg-white/80 p-1 rounded border border-[#C5D9C5] font-bold">Event: &ge; {APP_CONFIG.eventPredictionLevel}</span>
                  </div>
                </div>

                {/* Chronological Split Display */}
                {csvEvaluation.workbenchMetadata.splitInfo && (
                  <div className="pt-2 border-t border-[#C5D9C5] text-xs text-[#1B3A2D] space-y-2">
                    <div className="flex items-center justify-between">
                      <strong>Chronological Partition Split (Date: {csvEvaluation.workbenchMetadata.splitInfo.splitDate})</strong>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2 bg-[#FFFDF8] rounded border border-[#C5D9C5] space-y-1">
                        <span className="font-bold text-[#2D221C] block">Tuning Period</span>
                        <p className="text-[11px] text-[#6B564B] italic">Only change thresholds using the tuning period.</p>
                        <div className="font-mono text-[11px] pt-1">
                          Hits: {csvEvaluation.workbenchMetadata.splitInfo.tuningPeriod.predictors.baselineRuleScore.hits} |
                          Misses: {csvEvaluation.workbenchMetadata.splitInfo.tuningPeriod.predictors.baselineRuleScore.misses} |
                          FAR: {csvEvaluation.workbenchMetadata.splitInfo.tuningPeriod.predictors.baselineRuleScore.falseAlarmRatio !== null
                            ? `${(csvEvaluation.workbenchMetadata.splitInfo.tuningPeriod.predictors.baselineRuleScore.falseAlarmRatio * 100).toFixed(1)}%`
                            : 'n/a'}
                        </div>
                      </div>

                      <div className="p-2 bg-[#FFFDF8] rounded border border-[#C5D9C5] space-y-1">
                        <span className="font-bold text-[#1B3A2D] block">Test Period</span>
                        <p className="text-[11px] text-[#1B3A2D] font-semibold">Report the test period.</p>
                        <div className="font-mono text-[11px] pt-1">
                          Hits: {csvEvaluation.workbenchMetadata.splitInfo.testPeriod.predictors.baselineRuleScore.hits} |
                          Misses: {csvEvaluation.workbenchMetadata.splitInfo.testPeriod.predictors.baselineRuleScore.misses} |
                          FAR: {csvEvaluation.workbenchMetadata.splitInfo.testPeriod.predictors.baselineRuleScore.falseAlarmRatio !== null
                            ? `${(csvEvaluation.workbenchMetadata.splitInfo.testPeriod.predictors.baselineRuleScore.falseAlarmRatio * 100).toFixed(1)}%`
                            : 'n/a'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Results Table */}
            <div className="overflow-x-auto border border-[#DFCBB3] rounded-md">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F7F1E8] border-b border-[#DFCBB3] text-[#5A453A]">
                  <tr>
                    <th className="py-2.5 px-3">Predictor</th>
                    <th className="py-2.5 px-3 text-center">Hits</th>
                    <th className="py-2.5 px-3 text-center">Misses</th>
                    <th className="py-2.5 px-3 text-center">False Alarms</th>
                    <th className="py-2.5 px-3 text-center">Correct Neg.</th>
                    <th className="py-2.5 px-3 text-center">Hit Rate</th>
                    <th className="py-2.5 px-3 text-center">Miss Rate</th>
                    <th className="py-2.5 px-3 text-center">FAR</th>
                    <th className="py-2.5 px-3 text-center">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {renderStatsRow('Baseline Rule Score', csvEvaluation.predictors.baselineRuleScore)}
                  {csvEvaluation.predictors.trainedModel &&
                    renderStatsRow('Trained Model', csvEvaluation.predictors.trainedModel)}
                  {csvEvaluation.predictors.persistenceBenchmark &&
                    renderStatsRow('Persistence Benchmark ("the next 12 hours look like now")', csvEvaluation.predictors.persistenceBenchmark)}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-[#5A453A] italic">
              {STRINGS.accuracy.accuracyCaveat}
            </p>

            {/* Example Misses and False Alarms */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
              <div className="border border-red-200 rounded-md p-3 bg-red-50/40">
                <h4 className="font-bold text-red-900 mb-2">
                  Example Misses (Observed = 1, Predicted &lt; High)
                </h4>
                {csvEvaluation.exampleMisses.length === 0 ? (
                  <p className="text-[#5A453A]">No misses detected in evaluated dataset.</p>
                ) : (
                  <ul className="space-y-1 font-mono text-[11px]">
                    {csvEvaluation.exampleMisses.map((ex, i) => (
                      <li key={i} className="text-[#2D221C] bg-white/70 p-1 rounded border border-red-100">
                        Row {ex.rowNumber}: {ex.city} ({ex.timestamp}) - Predicted: {ex.predictedLevel}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border border-amber-200 rounded-md p-3 bg-amber-50/40">
                <h4 className="font-bold text-amber-900 mb-2">
                  Example False Alarms (Observed = 0, Predicted &ge; High)
                </h4>
                {csvEvaluation.exampleFalseAlarms.length === 0 ? (
                  <p className="text-[#5A453A]">No false alarms detected in evaluated dataset.</p>
                ) : (
                  <ul className="space-y-1 font-mono text-[11px]">
                    {csvEvaluation.exampleFalseAlarms.map((ex, i) => (
                      <li key={i} className="text-[#2D221C] bg-white/70 p-1 rounded border border-amber-100">
                        Row {ex.rowNumber}: {ex.city} ({ex.timestamp}) - Predicted: {ex.predictedLevel}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Copy Results as JSON */}
            <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-[#5A453A]">
                Paste these verified results into <code className="bg-[#F3EADD] px-1 py-0.5 rounded">config.evaluationResults</code> once team review is complete.
              </p>
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded text-xs font-semibold hover:bg-black"
              >
                {copiedJson ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedJson ? STRINGS.accuracy.csvCopiedJson : STRINGS.accuracy.csvCopyJson}</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 5. Known Limitations List */}
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
