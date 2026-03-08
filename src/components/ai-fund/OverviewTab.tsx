import {
  Activity,
  Briefcase,
  Users,
  Home,
  Zap,
  FileCheck,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import type { AiFundWorkspace } from "@/types/ai-fund";

interface Props {
  workspace: AiFundWorkspace;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-600", ring: "ring-cyan-100" },
  };

  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${c.bg} ring-1 ${c.ring} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-3xl font-semibold text-foreground tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-4xl font-bold text-foreground tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default function OverviewTab({ workspace }: Props) {
  const { stats, loading } = workspace;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-muted-foreground text-sm">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Loading pipeline data...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-6xl">
      {/* Hero strip */}
      <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Pipeline at a Glance</h1>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-6">
          <HeroMetric label="Concepts" value={stats.totalConcepts} />
          <HeroMetric label="Active" value={stats.activeConcepts} />
          <HeroMetric label="People" value={stats.totalPeople} />
          <HeroMetric label="In Pipeline" value={stats.activePipeline} />
          <HeroMetric label="Residencies" value={stats.activeResidencies} />
          <HeroMetric label="Pending" value={stats.pendingDecisions} />
        </div>
      </div>

      {/* Detailed stat cards */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Breakdown</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Concepts" value={stats.totalConcepts} icon={Briefcase} color="blue" />
          <StatCard label="Active Concepts" value={stats.activeConcepts} icon={Zap} color="emerald" />
          <StatCard label="Total People" value={stats.totalPeople} icon={Users} color="violet" />
          <StatCard label="Active Pipeline" value={stats.activePipeline} icon={Activity} color="cyan" />
          <StatCard label="Active Residencies" value={stats.activeResidencies} icon={Home} color="amber" />
          <StatCard label="Pending Decisions" value={stats.pendingDecisions} icon={FileCheck} color="rose" />
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h2>
        {stats.recentActivity.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-3">
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No activity yet. Start by adding a concept or person.
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl shadow-sm divide-y divide-border overflow-hidden">
            {stats.recentActivity.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{event.action}</span>{" "}
                    <span className="text-muted-foreground">on {event.entityType}</span>
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(event.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
