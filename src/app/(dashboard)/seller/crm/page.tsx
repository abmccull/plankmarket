"use client";

import Link from "next/link";
import { ProGate } from "@/components/pro-gate";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  Download,
  Clock,
  Tag,
  StickyNote,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

export default function SellerCrmPage() {
  return (
    <ProGate feature="Buyer CRM">
      <CrmDashboardContent />
    </ProGate>
  );
}

function CrmDashboardContent() {
  const exportQuery = trpc.crm.exportLeadsCsv.useQuery(undefined, {
    enabled: false, // Only fetch on demand
  });

  const dueTodayQuery = trpc.crm.getDueToday.useQuery();

  const handleExportCsv = async () => {
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const blob = new Blob([result.data], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `plankmarket-leads-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("CSV exported successfully");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to export CSV"));
    }
  };

  const dueCount = dueTodayQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          onClick={handleExportCsv}
          disabled={exportQuery.isFetching}
        >
          {exportQuery.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Export CSV
        </Button>
      </div>

      {/* Due Today Alert */}
      {dueCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {dueCount} follow-up{dueCount !== 1 ? "s" : ""} due today
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Review and complete your pending follow-ups
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/seller/followups">
                View Follow-ups
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/seller/followups" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 mb-2">
                <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <CardTitle className="text-base">Follow-ups</CardTitle>
              <CardDescription>
                Schedule and track follow-up tasks for buyer conversations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-primary group-hover:underline">
                Manage follow-ups
                <ArrowRight className="ml-1 inline h-3 w-3" aria-hidden="true" />
              </span>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 mb-2">
              <Tag className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-base">Buyer Tags</CardTitle>
            <CardDescription>
              Tag buyers to categorize and track relationships. Tags appear on
              order, message, and offer pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Add tags from any order, offer, or conversation page
            </p>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 mb-2">
              <StickyNote className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <CardTitle className="text-base">Buyer Notes</CardTitle>
            <CardDescription>
              Keep private notes about buyers. Notes are only visible to you and
              appear on relevant pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Add notes from any order, offer, or conversation page
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How CRM Tools Work</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                1
              </div>
              <p>
                <span className="font-medium text-foreground">Tag your buyers</span>{" "}
                from any order, offer, or message page. Use tags like
                &ldquo;high-value&rdquo;, &ldquo;repeat-buyer&rdquo;, or
                &ldquo;needs-followup&rdquo; to categorize relationships.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                2
              </div>
              <p>
                <span className="font-medium text-foreground">
                  Add private notes
                </span>{" "}
                to track important details about each buyer&mdash;preferences,
                past conversations, and follow-up items.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                3
              </div>
              <p>
                <span className="font-medium text-foreground">
                  Export your leads
                </span>{" "}
                as a CSV file for use in external CRM tools or spreadsheets.
                Includes buyer names, tags, note counts, and interaction history.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
