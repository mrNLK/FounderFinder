/**
 * CandidateCard — Detailed expandable card for a single candidate.
 *
 * Shows EEA score breakdown, confidence badge, funding signals,
 * recency bonus, and all matched tier signals in a compact layout.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Clock,
} from "lucide-react";
import type { CandidateResult } from "@/types/founder-finder";

interface Props {
  candidate: CandidateResult;
  rank: number;
}

const TIER_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-800 border-green-300",
  2: "bg-blue-100 text-blue-800 border-blue-300",
  3: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

const CONFIDENCE_STYLES: Record<string, { bg: string; label: string }> = {
  high: { bg: "bg-green-500", label: "High confidence" },
  medium: { bg: "bg-yellow-500", label: "Medium confidence" },
  low: { bg: "bg-red-400", label: "Low confidence" },
};

export default function CandidateCard({ candidate, rank }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { eeaScore } = candidate;
  const tierColor = eeaScore.tier ? TIER_COLORS[eeaScore.tier] : "bg-gray-100 text-gray-600 border-gray-300";
  const conf = CONFIDENCE_STYLES[eeaScore.confidence] ?? CONFIDENCE_STYLES.low;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Rank */}
        <span className="text-sm font-mono text-gray-400 w-6 text-right shrink-0">
          #{rank}
        </span>

        {/* Score gauge */}
        <div className="relative w-10 h-10 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={eeaScore.score >= 85 ? "#22c55e" : eeaScore.score >= 50 ? "#3b82f6" : eeaScore.score > 0 ? "#eab308" : "#d1d5db"}
              strokeWidth="3"
              strokeDasharray={`${eeaScore.score}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
            {eeaScore.score}
          </span>
        </div>

        {/* Name + title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">{candidate.name}</span>
            {eeaScore.tier && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${tierColor}`}>
                T{eeaScore.tier}
              </span>
            )}
            {/* Confidence dot */}
            <span className={`w-2 h-2 rounded-full ${conf.bg}`} title={conf.label} />
          </div>
          <div className="text-sm text-gray-500 truncate">
            {candidate.title} @ {candidate.company}
          </div>
        </div>

        {/* Quick badges */}
        <div className="flex items-center gap-2 shrink-0">
          {eeaScore.fundingSignals.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              <DollarSign size={12} /> Funded
            </span>
          )}
          {eeaScore.recencyBonus > 0 && (
            <span className="flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
              <Clock size={12} /> Recent
            </span>
          )}
          {eeaScore.falsePositiveFlags.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
              <AlertTriangle size={12} /> {eeaScore.falsePositiveFlags.length} FP
            </span>
          )}
        </div>

        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100 space-y-3">
          {/* Summary */}
          <p className="text-sm text-gray-700">{eeaScore.summary}</p>

          {/* Signal breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Tier 1 */}
            {eeaScore.matchedTier1.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-green-700 flex items-center gap-1 mb-1">
                  <Shield size={12} /> Tier 1 Signals
                </h4>
                <ul className="space-y-0.5">
                  {eeaScore.matchedTier1.map((s) => (
                    <li key={s} className="text-xs text-gray-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tier 2 */}
            {eeaScore.matchedTier2.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-1">
                  <TrendingUp size={12} /> Tier 2 Signals
                </h4>
                <ul className="space-y-0.5">
                  {eeaScore.matchedTier2.map((s) => (
                    <li key={s} className="text-xs text-gray-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Funding */}
            {eeaScore.fundingSignals.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-emerald-700 flex items-center gap-1 mb-1">
                  <DollarSign size={12} /> Funding Signals
                </h4>
                <ul className="space-y-0.5">
                  {eeaScore.fundingSignals.map((s) => (
                    <li key={s} className="text-xs text-gray-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* False positives */}
            {eeaScore.falsePositiveFlags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-1">
                  <AlertTriangle size={12} /> False Positive Flags
                </h4>
                <ul className="space-y-0.5">
                  {eeaScore.falsePositiveFlags.map((f) => (
                    <li key={f} className="text-xs text-amber-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Score details row */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 pt-1 border-t border-gray-200">
            <span>Score: <strong>{eeaScore.score}/100</strong></span>
            <span>Confidence: <strong className="capitalize">{eeaScore.confidence}</strong></span>
            {eeaScore.recencyBonus > 0 && <span>Recency bonus: <strong>+{eeaScore.recencyBonus}</strong></span>}
            <span>B2B: <strong>{candidate.b2bFocus}</strong></span>
            <span>Tech: <strong>{candidate.technicalDepth}</strong></span>
          </div>

          {/* Links */}
          <div className="flex gap-3 pt-1">
            {candidate.profileUrl && (
              <a
                href={candidate.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <ExternalLink size={12} /> Profile
              </a>
            )}
            {candidate.linkedinUrl && (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <ExternalLink size={12} /> LinkedIn
              </a>
            )}
            {candidate.githubUrl && (
              <a
                href={candidate.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <ExternalLink size={12} /> GitHub
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
