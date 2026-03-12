/**
 * Events Tab — Lunch Event Pipeline Management
 *
 * Manages the 700→300→20 event funnel:
 * - Event scheduling and tracking
 * - Run of Show reference
 * - Attendee selection criteria
 * - Post-event follow-up protocol
 * - Pipeline compounding metrics
 */

import { useState } from "react";
import {
  Calendar,
  Users,
  Clock,
  ChevronRight,
  Target,
  MessageSquare,
  UserCheck,
  BarChart3,
  Send,
  CheckCircle2,
  AlertCircle,
  Plus,
  Flame,
} from "lucide-react";
import type { AiFundWorkspace } from "@/types/ai-fund";

interface Props {
  workspace: AiFundWorkspace;
}

interface LunchEvent {
  id: string;
  date: string;
  title: string;
  portfolioCompany: string;
  speakers: string[];
  invitesSent: number;
  applications: number;
  attendeesSelected: number;
  status: "planning" | "invites_sent" | "applications_open" | "selected" | "completed";
  followUpStatus: "pending" | "in_progress" | "completed";
  depthSignals: string[];
  notes: string;
}

const EMPTY_EVENT: Omit<LunchEvent, "id"> = {
  date: "",
  title: "",
  portfolioCompany: "",
  speakers: [],
  invitesSent: 0,
  applications: 0,
  attendeesSelected: 0,
  status: "planning",
  followUpStatus: "pending",
  depthSignals: [],
  notes: "",
};

const STATUS_CONFIG = {
  planning: { label: "Planning", color: "bg-secondary text-secondary-foreground", icon: Calendar },
  invites_sent: { label: "Invites Sent", color: "bg-blue-100 text-blue-700", icon: Send },
  applications_open: { label: "Applications Open", color: "bg-amber-100 text-amber-700", icon: Users },
  selected: { label: "Selected", color: "bg-violet-100 text-violet-700", icon: UserCheck },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
};

const FOLLOWUP_CONFIG = {
  pending: { label: "Pending", color: "bg-secondary text-secondary-foreground" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
  completed: { label: "Done", color: "bg-emerald-100 text-emerald-700" },
};

type SubView = "dashboard" | "run_of_show" | "selection" | "followup" | "metrics";

export default function EventsTab({ workspace }: Props) {
  const [events, setEvents] = useState<LunchEvent[]>([]);
  const [activeView, setActiveView] = useState<SubView>("dashboard");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState(EMPTY_EVENT);
  const [speakerInput, setSpeakerInput] = useState("");
  void workspace;

  const handleAddEvent = () => {
    if (!newEvent.date || !newEvent.title) return;
    const event: LunchEvent = {
      ...newEvent,
      id: crypto.randomUUID(),
    };
    setEvents(prev => [event, ...prev]);
    setNewEvent(EMPTY_EVENT);
    setSpeakerInput("");
    setShowAddForm(false);
  };

  const updateEventStatus = (id: string, status: LunchEvent["status"]) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  };

  const updateFollowUpStatus = (id: string, followUpStatus: LunchEvent["followUpStatus"]) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, followUpStatus } : e));
  };

  const completedEvents = events.filter(e => e.status === "completed");
  const totalAttendees = completedEvents.reduce((sum, e) => sum + e.attendeesSelected, 0);
  const avgApplyRate = completedEvents.length > 0
    ? Math.round(completedEvents.reduce((sum, e) => sum + (e.invitesSent > 0 ? (e.applications / e.invitesSent) * 100 : 0), 0) / completedEvents.length)
    : 43;

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-foreground">{events.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Total Events</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-foreground">{completedEvents.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Completed</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-foreground">{totalAttendees}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Total Attendees</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-foreground">{avgApplyRate}%</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">Avg Apply Rate</div>
        </div>
      </div>

      {/* Add Event */}
      {showAddForm ? (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Schedule New Event</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Date</label>
              <input
                type="date"
                value={newEvent.date}
                onChange={e => setNewEvent(prev => ({ ...prev, date: e.target.value }))}
                className="w-full mt-1 px-3 py-1.5 text-xs bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Event Title</label>
              <input
                type="text"
                value={newEvent.title}
                onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., AI Fund Lunch — Strata Deep Dive"
                className="w-full mt-1 px-3 py-1.5 text-xs bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Portfolio Company</label>
              <input
                type="text"
                value={newEvent.portfolioCompany}
                onChange={e => setNewEvent(prev => ({ ...prev, portfolioCompany: e.target.value }))}
                placeholder="e.g., Strata"
                className="w-full mt-1 px-3 py-1.5 text-xs bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Speakers (comma-separated)</label>
              <input
                type="text"
                value={speakerInput}
                onChange={e => {
                  setSpeakerInput(e.target.value);
                  setNewEvent(prev => ({ ...prev, speakers: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }));
                }}
                placeholder="e.g., Andrew Ng, Rish, Julia, Brian"
                className="w-full mt-1 px-3 py-1.5 text-xs bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Notes</label>
            <textarea
              value={newEvent.notes}
              onChange={e => setNewEvent(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Event-specific notes..."
              className="w-full mt-1 px-3 py-1.5 text-xs bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddEvent}
              disabled={!newEvent.date || !newEvent.title}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Create Event
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewEvent(EMPTY_EVENT); }}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-card border border-border hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
          Schedule New Event
        </button>
      )}

      {/* Event List */}
      {events.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No events scheduled yet</p>
          <p className="text-xs text-muted-foreground mt-1">Events feed the founder pipeline. Schedule one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const statusConf = STATUS_CONFIG[event.status];
            const StatusIcon = statusConf.icon;
            const followupConf = FOLLOWUP_CONFIG[event.followUpStatus];
            return (
              <div key={event.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-foreground">{event.title}</h4>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusConf.color}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {statusConf.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(event.date).toLocaleDateString()}</span>
                      {event.portfolioCompany && <span className="flex items-center gap-1"><Flame className="w-3 h-3" />{event.portfolioCompany}</span>}
                      {event.speakers.length > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{event.speakers.join(", ")}</span>}
                    </div>

                    {/* Funnel metrics */}
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1">
                        <Send className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Invites:</span>
                        <input
                          type="number"
                          value={event.invitesSent || ""}
                          onChange={e => setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, invitesSent: parseInt(e.target.value) || 0 } : ev))}
                          className="w-16 px-1.5 py-0.5 text-xs bg-secondary/50 border border-border rounded text-center"
                          placeholder="700"
                        />
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Applied:</span>
                        <input
                          type="number"
                          value={event.applications || ""}
                          onChange={e => setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, applications: parseInt(e.target.value) || 0 } : ev))}
                          className="w-16 px-1.5 py-0.5 text-xs bg-secondary/50 border border-border rounded text-center"
                          placeholder="300"
                        />
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Selected:</span>
                        <input
                          type="number"
                          value={event.attendeesSelected || ""}
                          onChange={e => setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, attendeesSelected: parseInt(e.target.value) || 0 } : ev))}
                          className="w-12 px-1.5 py-0.5 text-xs bg-secondary/50 border border-border rounded text-center"
                          placeholder="20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <select
                      value={event.status}
                      onChange={e => updateEventStatus(event.id, e.target.value as LunchEvent["status"])}
                      className="text-[10px] px-2 py-1 bg-secondary/50 border border-border rounded-lg"
                    >
                      <option value="planning">Planning</option>
                      <option value="invites_sent">Invites Sent</option>
                      <option value="applications_open">Apps Open</option>
                      <option value="selected">Selected</option>
                      <option value="completed">Completed</option>
                    </select>
                    <select
                      value={event.followUpStatus}
                      onChange={e => updateFollowUpStatus(event.id, e.target.value as LunchEvent["followUpStatus"])}
                      className="text-[10px] px-2 py-1 bg-secondary/50 border border-border rounded-lg"
                    >
                      <option value="pending">Follow-up: Pending</option>
                      <option value="in_progress">Follow-up: In Progress</option>
                      <option value="completed">Follow-up: Done</option>
                    </select>
                    <span className={`text-center px-2 py-0.5 rounded text-[10px] font-bold ${followupConf.color}`}>
                      {followupConf.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderRunOfShow = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Standard Run of Show</h3>
        <p className="text-xs text-muted-foreground">1-hour informal lunch format. Mountain View office. 20 pre-screened attendees.</p>
      </div>

      {/* Timeline */}
      <div className="relative pl-8 space-y-6">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

        {/* 2:00 PM */}
        <div className="relative">
          <div className="absolute -left-5 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <span className="text-[8px] font-bold text-primary-foreground">2:00</span>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 border-l-4 border-l-primary">
            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">2:00 PM - 10 min - Andrew Ng</div>
            <h4 className="text-sm font-semibold text-foreground mb-1">AI Fund Introduction + AI Era Trends</h4>
            <p className="text-xs text-muted-foreground">
              Andrew sets context: what AI Fund is building, why this moment in the AI era is the right time,
              and what kinds of founders and problems they're looking to back. Casual and conversational — not a pitch.
            </p>
            <div className="flex gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">No slides needed</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Sets the frame</span>
            </div>
          </div>
        </div>

        {/* 2:10 PM */}
        <div className="relative">
          <div className="absolute -left-5 w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">2:10</span>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 border-l-4 border-l-teal-500">
            <div className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-1">2:10 PM - 10 min - Rish</div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Portfolio Stage-Set + Speaker Introduction</h4>
            <p className="text-xs text-muted-foreground">
              Rish provides company context — what problem the portfolio company solves, where it sits,
              and why the founders are the right people building it. Bridges Andrew's macro framing to a concrete example.
            </p>
            <div className="flex gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">Portfolio storytelling</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Context bridge</span>
            </div>
          </div>
        </div>

        {/* 2:20 PM */}
        <div className="relative">
          <div className="absolute -left-5 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">2:20</span>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 border-l-4 border-l-violet-500">
            <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1">2:20-2:30 PM - 10 min - Portfolio Founders</div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Deep Dive — Product Features + Business Potential</h4>
            <p className="text-xs text-muted-foreground">
              Founders walk through what they're building: specific product features, go-to-market logic,
              and scope of the business opportunity. Most concrete segment — attendees should leave with a clear mental model
              of how an AI Fund portfolio company actually gets built.
            </p>
            <div className="flex gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Product specifics</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Business case</span>
            </div>
          </div>
        </div>

        {/* 2:30 PM */}
        <div className="relative">
          <div className="absolute -left-5 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">2:30</span>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 border-l-4 border-l-amber-500">
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">2:30-3:00 PM - 30 min - Full Group</div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Open Discussion + Q&A</h4>
            <p className="text-xs text-muted-foreground">
              The highest-signal segment for recruiting purposes. How attendees engage — what questions they ask,
              what they push back on, what problems they raise — is live EEA signal. Mike takes notes.
              Attendees showing genuine depth get flagged for immediate follow-up.
            </p>
            <div className="flex gap-1.5 mt-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">Highest signal segment</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Mike takes live notes</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">Flag depth indicators</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSelection = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Invite Composition (per event, 700 sends)</h3>
        <p className="text-xs text-muted-foreground mb-3">Invites are not random — they're the top-scoring candidates from the enrichment pipeline.</p>
        <div className="space-y-2">
          {[
            { count: "150", label: "W1/W2 + high EEA (>=65 combined)", desc: "Priority targets. Personal invite from Mike referencing Andrew.", color: "bg-red-100 text-red-700" },
            { count: "250", label: "W3 + medium EEA (45-64)", desc: "Bulk of invite list. Standard invite template.", color: "bg-blue-100 text-blue-700" },
            { count: "200", label: "Prior AI Fund applicants", desc: "Re-engagement of declined or stale applications.", color: "bg-amber-100 text-amber-700" },
            { count: "100", label: "Fresh pipeline additions", desc: "New completers or newly funded founders from Harmonic refresh.", color: "bg-emerald-100 text-emerald-700" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 text-xs">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${item.color}`}>{item.count}</span>
              <div>
                <div className="font-semibold text-foreground">{item.label}</div>
                <div className="text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Attendee Selection (20 from ~300 applicants)</h3>
        <div className="space-y-2">
          {[
            { slots: "10 slots", criteria: "Combined score >=70", desc: "Top EEA + warmth. Primary targets." },
            { slots: "6 slots", criteria: "Combined score 50-69", desc: "Strong potential. Good for cohort energy." },
            { slots: "2 slots", criteria: "Wildcards", desc: "Outlier signals, unusual background, moonshot traction." },
            { slots: "2 slots", criteria: "Re-invites", desc: "Prior attendees who engaged well but didn't convert." },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 text-xs">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary whitespace-nowrap">{item.slots}</span>
              <div>
                <div className="font-semibold text-foreground">{item.criteria}</div>
                <div className="text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">Application Evaluation Criteria</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="text-left px-4 py-2 font-semibold">Field</th>
              <th className="text-left px-4 py-2 font-semibold">What We Evaluate</th>
              <th className="text-left px-4 py-2 font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody>
            {[
              { field: "Current company + role", eval: "Is this person building? Founder or wishing they were?", weight: "High", color: "bg-emerald-100 text-emerald-700" },
              { field: "Technical background", eval: "Matches EEA signals in enrichment profile.", weight: "High", color: "bg-emerald-100 text-emerald-700" },
              { field: "\"What are you working on?\"", eval: "Quality of problem framing. Genuine depth vs. trend chasing.", weight: "High", color: "bg-emerald-100 text-emerald-700" },
              { field: "\"Why AI Fund?\"", eval: "Specificity. References to Andrew's actual work score higher.", weight: "Medium", color: "bg-blue-100 text-blue-700" },
              { field: "DL.AI course history", eval: "Which courses, completion rate, recency.", weight: "Medium", color: "bg-blue-100 text-blue-700" },
              { field: "LinkedIn profile quality", eval: "Already scored in pipeline. Use existing EEA score.", weight: "Reference", color: "bg-amber-100 text-amber-700" },
            ].map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/10">
                <td className="px-4 py-2.5 font-semibold text-foreground">{row.field}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.eval}</td>
                <td className="px-4 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${row.color}`}>{row.weight}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderFollowup = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            Conversion happens in the <strong>72 hours after</strong> the event. Every attendee should receive a follow-up
            that reflects what they actually said during the session — not a generic thank-you.
          </div>
        </div>
      </div>

      <div className="relative pl-8 space-y-6">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

        {[
          {
            step: "1",
            time: "During event",
            title: "Mike captures live signals",
            desc: "Note every attendee who asks a substantive question, challenges a framing, or mentions a specific technical problem. Tags: depth signal, founder instinct, product insight.",
            color: "bg-primary",
          },
          {
            step: "2",
            time: "Within 4 hours",
            title: "Tier 1 immediate outreach",
            desc: "Any attendee scored >=70 combined AND showed depth signal gets same-day follow-up from Andrew or Mike. Reference the specific thing they said. Subject: \"Continuing from today's lunch.\"",
            color: "bg-red-500",
          },
          {
            step: "3",
            time: "Within 24 hours",
            title: "All 20 attendees get a follow-up",
            desc: "Standard follow-up from Mike. Thanks for attending, note about what resonated from their application or question, and soft ask: \"Would you be open to a follow-up conversation?\"",
            color: "bg-blue-500",
          },
          {
            step: "4",
            time: "Within 72 hours",
            title: "Update enrichment scores",
            desc: "Log event attendance as warmth upgrade (+5 pts). Log depth signals (+5-10 pts additional). Update Clay profile with event date and engagement level.",
            color: "bg-violet-500",
          },
          {
            step: "5",
            time: "Day 7",
            title: "Re-invite or pipeline routing decision",
            desc: "Decide: invite to next event (needs more touchpoints) or route to recruiter pipeline. Two events without 1:1 conversion → 90-day nurture list.",
            color: "bg-amber-500",
          },
        ].map((item, i) => (
          <div key={i} className="relative">
            <div className={`absolute -left-5 w-6 h-6 rounded-full ${item.color} flex items-center justify-center`}>
              <span className="text-[9px] font-bold text-white">{item.step}</span>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{item.time}</div>
              <h4 className="text-sm font-semibold text-foreground mb-1">{item.title}</h4>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderMetrics = () => (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">Pipeline Compounding by Event Cadence</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="text-left px-4 py-2 font-semibold">Cadence</th>
              <th className="text-left px-4 py-2 font-semibold">Annual Invites</th>
              <th className="text-left px-4 py-2 font-semibold">Applicants</th>
              <th className="text-left px-4 py-2 font-semibold">Attendees</th>
              <th className="text-left px-4 py-2 font-semibold">Est. 1:1 Convos</th>
              <th className="text-left px-4 py-2 font-semibold">Est. FIR Placements</th>
            </tr>
          </thead>
          <tbody>
            {[
              { cadence: "1x per week", invites: "36,400", apps: "~15,600", attendees: "1,040", convos: "~155", fir: "8-12" },
              { cadence: "2x per week (current)", invites: "72,800", apps: "~31,200", attendees: "2,080", convos: "~310", fir: "15-25" },
              { cadence: "3x per week (scaled)", invites: "109,200", apps: "~46,800", attendees: "3,120", convos: "~470", fir: "25-40" },
            ].map((row, i) => (
              <tr key={i} className={`border-b border-border/50 ${i === 1 ? "bg-primary/5" : "hover:bg-secondary/10"}`}>
                <td className="px-4 py-2.5 font-semibold text-foreground">{row.cadence}</td>
                <td className="px-4 py-2.5">{row.invites}</td>
                <td className="px-4 py-2.5">{row.apps}</td>
                <td className="px-4 py-2.5">{row.attendees}</td>
                <td className="px-4 py-2.5">{row.convos}</td>
                <td className="px-4 py-2.5 font-bold text-primary">{row.fir}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800">
        <div className="flex items-start gap-2">
          <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Pipeline compounds.</strong> Every new DL.AI course cohort adds candidates. Every AI Fund portfolio
            announcement increases warmth scores. The enrichment infrastructure built in Month 1 runs quarterly refreshes
            automatically. By Month 6, the pipeline is self-refreshing.
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Database depletion note:</strong> At 2x/week, 72,800 annual invites from ~4K enriched candidates
            means repeat invites. W1/W2 candidates should receive max 1-2 event invites before transitioning to direct
            1:1 outreach. Harmonic refresh (newly funded founders) and quarterly DL.AI cohort refresh keep the pool fresh.
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeView) {
      case "dashboard": return renderDashboard();
      case "run_of_show": return renderRunOfShow();
      case "selection": return renderSelection();
      case "followup": return renderFollowup();
      case "metrics": return renderMetrics();
      default: return renderDashboard();
    }
  };

  const VIEW_TABS: { id: SubView; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Events", icon: Calendar },
    { id: "run_of_show", label: "Run of Show", icon: Clock },
    { id: "selection", label: "Selection Criteria", icon: UserCheck },
    { id: "followup", label: "Follow-Up Protocol", icon: MessageSquare },
    { id: "metrics", label: "Pipeline Metrics", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground tracking-tight">Lunch Events</h2>
        <p className="text-xs text-muted-foreground mt-1">
          700 invites → 300 applications → 20 selected. AI Fund's highest-leverage sourcing mechanism.
        </p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {VIEW_TABS.map(tab => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {renderContent()}
    </div>
  );
}
