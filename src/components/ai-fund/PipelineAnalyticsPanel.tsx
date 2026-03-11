/**
 * PipelineAnalyticsPanel — Score distribution, tier breakdown, and signal stats.
 *
 * Renders an analytics dashboard for the current candidate batch.
 * Uses pure CSS bar charts (no chart library dependency).
 */

import { useMemo } from "react";
import {
  BarChart3,
  Shield,
  TrendingUp,
  DollarSign,
  Target,
} from "lucide-react";
import type { CandidateResult, PipelineAnalytics } from "@/types/founder-finder";
import { computePipelineAnalytics } from "@/lib/eea-scorer";

interface Props {
  candidates: CandidateResult[];
}

function StatBox({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-gray-100 text-gray-600">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function BarChartRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-right text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-gray-600 font-medium shrink-0">{count}</span>
    </div>
  );
}

export default function PipelineAnalyticsPanel({ candidates }: Props) {
  const analytics: PipelineAnalytics = useMemo(
    () => computePipelineAnalytics(candidates),
    [candidates],
  );

  if (candidates.length === 0) return null;

  const maxBucket = Math.max(...analytics.scoreDistribution.map((b) => b.count), 1);
  const maxSignal = Math.max(...analytics.topSignals.map((s) => s.count), 1);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <BarChart3 size={16} /> Pipeline Analytics
      </h3>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox
          label="Candidates"
          value={analytics.totalCandidates}
          icon={<Target size={16} />}
        />
        <StatBox
          label="Avg Score"
          value={analytics.avgScore}
          sub={`Median: ${analytics.medianScore}`}
          icon={<TrendingUp size={16} />}
        />
        <StatBox
          label="Tier 1"
          value={analytics.tierBreakdown.tier1}
          sub={`${analytics.tierBreakdown.tier2} T2, ${analytics.tierBreakdown.tier3} T3`}
          icon={<Shield size={16} />}
        />
        <StatBox
          label="Funded"
          value={analytics.fundingBreakdown.funded}
          sub={`${analytics.fundingBreakdown.unfunded} unfunded`}
          icon={<DollarSign size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Score distribution */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-semibold text-gray-600">Score Distribution</h4>
          {analytics.scoreDistribution.map((b) => (
            <BarChartRow
              key={b.bucket}
              label={b.bucket}
              count={b.count}
              max={maxBucket}
              color={
                b.bucket.startsWith("9") || b.bucket.startsWith("8")
                  ? "bg-green-500"
                  : b.bucket.startsWith("5") || b.bucket.startsWith("6") || b.bucket.startsWith("7")
                    ? "bg-blue-500"
                    : "bg-gray-400"
              }
            />
          ))}
        </div>

        {/* Top signals */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-semibold text-gray-600">Top Signals</h4>
          {analytics.topSignals.length === 0 ? (
            <p className="text-xs text-gray-400">No signals detected yet.</p>
          ) : (
            analytics.topSignals.map((s) => (
              <BarChartRow
                key={s.signal}
                label={s.signal.length > 16 ? s.signal.slice(0, 14) + "..." : s.signal}
                count={s.count}
                max={maxSignal}
                color="bg-indigo-500"
              />
            ))
          )}
        </div>
      </div>

      {/* Confidence breakdown */}
      <div className="flex items-center gap-4 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
        <span className="font-semibold text-gray-600">Confidence:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          High: {analytics.confidenceBreakdown.high}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          Medium: {analytics.confidenceBreakdown.medium}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Low: {analytics.confidenceBreakdown.low}
        </span>
      </div>
    </div>
  );
}
