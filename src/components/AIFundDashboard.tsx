/**
 * AI Fund Dashboard
 *
 * Main wrapper component with internal tab navigation.
 * Uses useAiFundWorkspace hook for all data.
 */

import { useState } from "react";
import { useAiFundWorkspace } from "@/hooks/useAiFundWorkspace";
import {
  BarChart3,
  Briefcase,
  Users,
  Link2,
  Mail,
  Home,
  FileCheck,
  Zap,
  Settings,
  Search,
  BookOpen,
  Calendar,
  Layers,
} from "lucide-react";

// Tab components
import OverviewTab from "@/components/ai-fund/OverviewTab";
import ConceptPipelineTab from "@/components/ai-fund/ConceptPipelineTab";
import TalentPoolTab from "@/components/ai-fund/TalentPoolTab";
import MatchingBoardTab from "@/components/ai-fund/MatchingBoardTab";
import EngagementInboxTab from "@/components/ai-fund/EngagementInboxTab";
import ResidencyTrackerTab from "@/components/ai-fund/ResidencyTrackerTab";
import InvestmentReviewTab from "@/components/ai-fund/InvestmentReviewTab";
import IntelligenceTab from "@/components/ai-fund/IntelligenceTab";
import AiFundSettingsTab from "@/components/ai-fund/SettingsTab";
import FindFoundersTab from "@/components/ai-fund/FindFoundersTab";
import EEASignalsTab from "@/components/ai-fund/EEASignalsTab";
import EventsTab from "@/components/ai-fund/EventsTab";
import StrategyTab from "@/components/ai-fund/StrategyTab";

type AiFundTab =
  | "overview"
  | "find_founders"
  | "concepts"
  | "talent"
  | "matching"
  | "engagements"
  | "residencies"
  | "investment"
  | "intelligence"
  | "eea_signals"
  | "events"
  | "strategy"
  | "settings";

const TABS: { id: AiFundTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "find_founders", label: "Find Founders", icon: Search },
  { id: "concepts", label: "Concepts", icon: Briefcase },
  { id: "talent", label: "Talent Pool", icon: Users },
  { id: "matching", label: "Matching", icon: Link2 },
  { id: "engagements", label: "Engagements", icon: Mail },
  { id: "residencies", label: "Residencies", icon: Home },
  { id: "investment", label: "Investment", icon: FileCheck },
  { id: "intelligence", label: "Intelligence", icon: Zap },
  { id: "eea_signals", label: "EEA Signals", icon: BookOpen },
  { id: "events", label: "Events", icon: Calendar },
  { id: "strategy", label: "DL.AI Strategy", icon: Layers },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AIFundDashboard() {
  const workspace = useAiFundWorkspace();
  const [activeTab, setActiveTab] = useState<AiFundTab>("overview");

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab workspace={workspace} />;
      case "find_founders":
        return <FindFoundersTab workspace={workspace} />;
      case "concepts":
        return <ConceptPipelineTab workspace={workspace} />;
      case "talent":
        return <TalentPoolTab workspace={workspace} />;
      case "matching":
        return <MatchingBoardTab workspace={workspace} />;
      case "engagements":
        return <EngagementInboxTab workspace={workspace} />;
      case "residencies":
        return <ResidencyTrackerTab workspace={workspace} />;
      case "investment":
        return <InvestmentReviewTab workspace={workspace} />;
      case "intelligence":
        return <IntelligenceTab workspace={workspace} />;
      case "eea_signals":
        return <EEASignalsTab workspace={workspace} />;
      case "events":
        return <EventsTab workspace={workspace} />;
      case "strategy":
        return <StrategyTab workspace={workspace} />;
      case "settings":
        return <AiFundSettingsTab workspace={workspace} />;
      default:
        return <OverviewTab workspace={workspace} />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Error banner */}
      {workspace.error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-destructive text-sm">
          {workspace.error}
        </div>
      )}

      {/* Tab navigation - pill style */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin bg-card rounded-2xl border border-border p-1.5 shadow-sm">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {renderTab()}
    </div>
  );
}
