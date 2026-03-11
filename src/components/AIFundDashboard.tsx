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
  FolderKanban,
  Users,
  Link2,
  Mail,
  Home,
  FileCheck,
  Zap,
  Settings,
  Search,
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
import FounderFinderTab from "@/components/ai-fund/FounderFinderTab";
import BuildOsTab from "@/components/ai-fund/BuildOsTab";

type AiFundTab =
  | "overview"
  | "concepts"
  | "talent"
  | "matching"
  | "engagements"
  | "residencies"
  | "investment"
  | "intelligence"
  | "build_os"
  | "founderfinder"
  | "settings";

const TABS: { id: AiFundTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "concepts", label: "Concepts", icon: Briefcase },
  { id: "talent", label: "Talent Pool", icon: Users },
  { id: "matching", label: "Matching", icon: Link2 },
  { id: "engagements", label: "Engagements", icon: Mail },
  { id: "residencies", label: "Residencies", icon: Home },
  { id: "investment", label: "Investment", icon: FileCheck },
  { id: "intelligence", label: "Intelligence", icon: Zap },
  { id: "build_os", label: "Build OS", icon: FolderKanban },
  { id: "founderfinder", label: "Founder Finder", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function AIFundDashboard() {
  const workspace = useAiFundWorkspace();
  const [activeTab, setActiveTab] = useState<AiFundTab>("overview");

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab workspace={workspace} />;
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
      case "build_os":
        return <BuildOsTab workspace={workspace} />;
      case "founderfinder":
        return <FounderFinderTab workspace={workspace} />;
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
