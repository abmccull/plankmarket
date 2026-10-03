"use client";

import { trpc } from "@/lib/trpc/client";
import { ProGate } from "@/components/pro-gate";
import { AgentSettingsNav } from "@/components/agent/agent-settings-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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

const ACTION_ICONS: Record<
  AgentActionType,
  React.ComponentType<{ className?: string }>
> = {
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
    <Card role="group" aria-label={label}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="shrink-0 rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.agent.getActivity.useQuery({ days: 30 }, { staleTime: 2 * 60 * 1000 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <section
        role="alert"
        aria-label="Agent activity unavailable"
        className="space-y-3 rounded-xl border p-5"
      >
        <h2 className="text-lg font-semibold">Agent activity unavailable</h2>
        <p className="text-sm text-muted-foreground">
          We could not load current activity. Counts and estimates will appear
          after a successful read.
        </p>
        <Button
          variant="outline"
          className="h-auto min-h-11 whitespace-normal"
          disabled={isFetching}
          onClick={() => {
            void refetch();
          }}
        >
          {isFetching ? "Retrying…" : "Retry agent activity"}
        </Button>
      </section>
    );
  }

  const counts = data.counts;
  const recent = data.recent;

  const offersHandled = OFFER_ACTION_TYPES.reduce(
    (sum, type) => sum + (counts[type] ?? 0),
    0,
  );
  const acceptedOffers = counts["offer_accepted"] ?? 0;
  const listingsRepriced = counts["listing_repriced"] ?? 0;
  const matchesFound = counts["match_found"] ?? 0;

  const totalMinutes = Object.entries(counts).reduce((sum, [type, count]) => {
    const mins = MINUTES_PER_ACTION[type as AgentActionType] ?? 0;
    return sum + mins * count;
  }, 0);
  const timeSaved =
    totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
      : `${totalMinutes}m`;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          label="Offers Handled"
          value={offersHandled}
          icon={Handshake}
        />
        <SummaryCard
          label="Accepted offers"
          value={acceptedOffers}
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Listings Repriced"
          value={listingsRepriced}
          icon={TrendingDown}
        />
        <SummaryCard
          label="Historical Matches"
          value={matchesFound}
          icon={Search}
        />
        <SummaryCard
          label="Estimated time saved"
          value={timeSaved}
          icon={Clock}
        />
      </div>

      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Counts cover recorded actions in the last 30 days. Accepted offers
          count acceptance actions, not completed trades.
        </p>
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">
            How estimated time is calculated
          </summary>
          <p className="mb-2">
            Estimated time = action count × assumed minutes per action, summed
            across all action types: {totalMinutes} minutes in this period. This
            is a model estimate, not measured time savings.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {Object.entries(MINUTES_PER_ACTION).map(([type, minutes]) => (
              <li key={type}>
                {ACTION_TYPE_LABELS[type as AgentActionType]}: {minutes} minutes
                per action
              </li>
            ))}
          </ul>
        </details>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>
            Up to 50 most recent recorded actions from the last 30 days,
            including any previous listing matches. Summary counts include all
            recorded actions in that period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agent activity in the last 30 days"
              description="Offer handling and repricing actions will appear here. Manage listing alerts in saved-search settings."
            />
          ) : (
            <ul className="space-y-3" aria-label="Agent activity feed">
              {recent.map((action) => {
                const actionType = action.actionType as AgentActionType;
                const Icon = ACTION_ICONS[actionType] ?? Bot;
                const label =
                  ACTION_TYPE_LABELS[actionType] ?? action.actionType;
                const description =
                  ACTION_TYPE_DESCRIPTIONS[actionType] ??
                  "Agent action performed";

                return (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-start gap-3 rounded-md border p-3"
                  >
                    <div className="mt-0.5 shrink-0 rounded-md bg-muted p-1.5">
                      <Icon
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                    <time
                      className="w-full text-xs text-muted-foreground sm:w-auto"
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
    <div className="min-w-0 max-w-2xl mx-auto space-y-6 px-4 py-8 [overflow-wrap:anywhere]">
      <div>
        <h1 className="text-2xl font-bold">AI Agent Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Review recorded automation activity from the last 30 days. Listing
          alerts are managed per saved search.
        </p>
      </div>

      <div className="[&>nav]:flex-wrap [&_svg]:shrink-0">
        <AgentSettingsNav />
      </div>

      <ProGate feature="AI Agent">
        <DashboardContent />
      </ProGate>
    </div>
  );
}
