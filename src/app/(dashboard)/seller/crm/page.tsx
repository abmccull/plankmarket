"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { ProGate } from "@/components/pro-gate";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Download, Clock, Loader2, ArrowRight } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

export default function SellerCrmPage() {
  const user = useAuthStore((state) => state.user);
  if (!user) return <StatePanelLoading label="Loading buyer CRM" rows={2} />;
  return (
    <ProGate feature="Buyer CRM">
      <CrmDashboardContent key={user.id} actorId={user.id} />
    </ProGate>
  );
}

function CrmDashboardContent({ actorId }: { actorId: string }) {
  const utils = trpc.useUtils();
  const dueTodayQuery = trpc.crm.getDueToday.useQuery();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const mounted = useRef(false),
    pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current && useAuthStore.getState().user?.id === actorId;
  const handleExportCsv = async () => {
    if (!current() || pending.current) return;
    pending.current = true;
    setExporting(true);
    setExportError(null);
    setExported(false);
    try {
      const csv = await utils.client.crm.exportLeadsCsv.query();
      if (!current()) return;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      try {
        link.href = url;
        link.download =
          "plankmarket-leads-" +
          new Date().toISOString().split("T")[0] +
          ".csv";
        document.body.appendChild(link);
        link.click();
        setExported(true);
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (current())
        setExportError(
          getErrorMessage(error, "The CSV could not be exported. Try again."),
        );
    } finally {
      pending.current = false;
      if (current()) setExporting(false);
    }
  };
  const dueCount = dueTodayQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-3xl font-bold">Buyer CRM</h1>
          </div>
          <p className="text-muted-foreground">
            Manage buyer relationships across orders, offers, and conversations
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11 h-auto whitespace-normal"
          onClick={handleExportCsv}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Export CSV
        </Button>
      </div>

      {exportError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm"
        >
          {exportError}
        </p>
      )}
      {exported && (
        <p role="status" className="text-sm">
          Your CSV download is ready.
        </p>
      )}
      {dueTodayQuery.isLoading ? (
        <StatePanelLoading label="Loading due reminders" rows={1} />
      ) : dueTodayQuery.isError || !dueTodayQuery.data ? (
        <QueryErrorState
          title="Due reminders unavailable"
          description="We could not check your due and overdue follow-ups. Retry to see current reminders."
          onRetry={() => void dueTodayQuery.refetch()}
          isRetrying={dueTodayQuery.isFetching}
        />
      ) : dueCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pending follow-ups due through today.
        </p>
      ) : null}
      {!dueTodayQuery.isError && dueCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Clock
                  className="h-5 w-5 text-amber-700 dark:text-amber-400"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {dueCount} follow-up{dueCount !== 1 ? "s" : ""} due today or
                  overdue
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Review and complete your pending follow-ups
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        asChild
        variant="outline"
        className="h-auto min-h-11 max-w-full whitespace-normal py-2"
      >
        <Link href="/seller/followups">
          View Follow-ups{" "}
          <ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      </Button>

      <details className="border-t pt-4 text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">
          How CRM tools work
        </summary>
        <div className="space-y-3 pt-2">
          <p>
            <span className="font-medium text-foreground">Tag your buyers</span>{" "}
            from any order, offer, or message page. Use tags like
            &ldquo;high-value&rdquo;, &ldquo;repeat-buyer&rdquo;, or
            &ldquo;needs-followup&rdquo; to categorize relationships.
          </p>
          <p>
            <span className="font-medium text-foreground">
              Add private notes
            </span>{" "}
            to track important details about each buyer&mdash;preferences, past
            conversations, and follow-up items. Notes are only visible to you
            and appear on relevant pages.
          </p>
          <p>
            <span className="font-medium text-foreground">
              Export your leads
            </span>{" "}
            as a CSV file for use in external CRM tools or spreadsheets.
            Includes buyer names, tags, note counts, and interaction history.
          </p>
        </div>
      </details>
    </div>
  );
}
