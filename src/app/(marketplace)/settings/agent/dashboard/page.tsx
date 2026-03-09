"use client";

import { trpc } from "@/lib/trpc/client";
import { ProGate } from "@/components/pro-gate";
import { AgentSettingsNav } from "@/components/agent/agent-settings-nav";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/utils";
import {
  Handshake,
  CheckCircle2,
  TrendingDown,
  Search,
  Clock,
  Bot,
  MessageSquare,
  XCircle,
  Tag,
  Send,
} from "lucide-react";
import type { AgentActionType } from "@/types/agent";
import {
  ACTION_TYPE_LABELS,
  ACTION_TYPE_DESCRIPTIONS,
  OFFER_ACTION_TYPES,
  MINUTES_PER_ACTION,
} from "@/types/agent";

const ACTION_ICONS: Record<AgentActionType, React.ComponentType<{ className?: string }>> = {
  offer_accepted: CheckCircle2,
  offer_countered: MessageSquare,
  offer_rejected: XCircle,
  listing_repriced: Tag,
  match_found: Search,
  auto_offer_made: Send,
};

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}

function SummaryCard({ label, value, icon: Icon }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const { data, isLoading } = trpc.agent.getActivity.useQuery(
    { days: 30 },
    { staleTime: 2 * 60 * 1000 }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const counts = data?.counts ?? {};
  const recent = data?.recent ?? [];

  const offersHandled = OFFER_ACTION_TYPES.reduce(
    (sum, type) => sum + (counts[type] ?? 0),
    0
  );
  const dealsFacilitated = counts["offer_accepted"] ?? 0;
  const listingsRepriced = counts["listing_repriced"] ?? 0;
  const matchesFound = counts["match_found"] ?? 0;

  const totalMinutes = Object.entries(counts).reduce((sum, [type, count]) => {
    const mins = MINUTES_PER_ACTION[type as AgentActionType] ?? 0;
    return sum + mins * count;
  }, 0);
  const timeSaved =
    totalMinutes >= 60
      ? `${Math.round(totalMinutes / 60)}h`
      : `${totalMinutes}m`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Offers Handled" value={offersHandled} icon={Handshake} />
        <SummaryCard label="Deals Facilitated" value={dealsFacilitated} icon={CheckCircle2} />
        <SummaryCard label="Listings Repriced" value={listingsRepriced} icon={TrendingDown} />
        <SummaryCard label="Matches Found" value={matchesFound} icon={Search} />
        <SummaryCard label="Time Saved" value={timeSaved} icon={Clock} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>
            Actions taken by your AI agent in the last 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agent activity yet"
              description="Once your AI agent starts working, actions will appear here."
            />
          ) : (
            <ul className="space-y-3" aria-label="Agent activity feed">
              {recent.map((action) => {
                const actionType = action.actionType as AgentActionType;
                const Icon = ACTION_ICONS[actionType] ?? Bot;
                const label = ACTION_TYPE_LABELS[actionType] ?? action.actionType;
                const description =
                  ACTION_TYPE_DESCRIPTIONS[actionType] ?? "Agent action performed";

                return (
                  <li
                    key={action.id}
                    className="flex items-start gap-3 rounded-md border p-3"
                  >
                    <div className="mt-0.5 rounded-md bg-muted p-1.5">
                      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={
                        action.createdAt instanceof Date
                          ? action.createdAt.toISOString()
                          : String(action.createdAt)
                      }
                    >
                      {formatRelativeTime(action.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AgentDashboardPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">AI Agent Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          See what your AI agent has accomplished in the last 30 days.
        </p>
      </div>

      <AgentSettingsNav />

      <ProGate feature="AI Agent">
        <DashboardContent />
      </ProGate>
    </div>
  );
}
