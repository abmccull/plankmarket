"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { trpc } from "@/lib/trpc/client";
import { ProGate } from "@/components/pro-gate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Clock,
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  CalendarClock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FollowupStatus = "pending" | "completed" | "cancelled";

type Followup = {
  id: string;
  title: string;
  dueAt: Date;
  status: FollowupStatus;
  sellerId: string;
  buyerId?: string | null;
  conversationId?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDue(date: Date | string) {
  const d = new Date(date);
  const now = new Date();
  const isOverdue = d < now;

  const label = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return { label, isOverdue };
}

// ─── Followup Card ────────────────────────────────────────────────────────────

function FollowupCard({
  followup,
  onComplete,
  onCancel,
  actingId,
}: {
  followup: Followup;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  actingId: string | null;
}) {
  const { label: dueLabel, isOverdue } = formatDue(followup.dueAt);
  const isPending = followup.status === "pending";
  const isThisActing = actingId === followup.id;

  return (
    <Card data-followup-id={followup.id}>
      <CardContent className="p-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="font-medium break-words">{followup.title}</p>
            {followup.conversationId && (
              <Link
                className="inline-flex min-h-11 items-center text-sm underline"
                href={"/messages/" + followup.conversationId}
              >
                Open conversation
              </Link>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span
                className={
                  isOverdue && isPending
                    ? "text-destructive flex items-center gap-1"
                    : "text-muted-foreground flex items-center gap-1"
                }
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {dueLabel}
                {isOverdue && isPending && (
                  <Badge variant="destructive" className="text-xs ml-1">
                    Overdue
                  </Badge>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {followup.status === "completed" && (
              <Badge variant="secondary" className="capitalize">
                Completed
              </Badge>
            )}
            {followup.status === "cancelled" && (
              <Badge variant="outline" className="capitalize">
                Cancelled
              </Badge>
            )}

            {isPending && (
              <>
                <Button
                  size="sm"
                  className="min-h-11"
                  onClick={() => onComplete(followup.id)}
                  disabled={!!actingId}
                  aria-label={`Mark "${followup.title}" as completed`}
                >
                  {isThisActing ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span className="ml-1.5">Complete</span>
                </Button>
                <Button
                  size="sm"
                  className="min-h-11"
                  variant="ghost"
                  onClick={() => onCancel(followup.id)}
                  disabled={!!actingId}
                  aria-label={`Cancel "${followup.title}"`}
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="ml-1.5">Cancel</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── New Followup Dialog ──────────────────────────────────────────────────────

function NewFollowupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  const createMutation = trpc.crm.createFollowup.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueAt) {
      toast.error("Title and due date are required.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        dueAt: new Date(dueAt),
      });
      toast.success("Follow-up created!");
      setTitle("");
      setDueAt("");
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create follow-up.";
      toast.error(msg);
    }
  };

  const handleClose = () => {
    setTitle("");
    setDueAt("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>New Follow-up</DialogTitle>
            <DialogDescription>
              Schedule a reminder to follow up with a buyer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="fu-title">
                Title{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="fu-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Follow up on oak hardwood quote"
                required
                aria-required="true"
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fu-due">
                Due Date &amp; Time{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="fu-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                required
                aria-required="true"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Create Follow-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Followup List ────────────────────────────────────────────────────────────

function FollowupList({
  followups,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onComplete,
  onCancel,
  actingId,
  emptyMessage,
}: {
  followups: Followup[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  actingId: string | null;
  emptyMessage: string;
}) {
  if (isLoading)
    return <StatePanelLoading label="Loading follow-ups" rows={3} />;
  if (isError)
    return (
      <QueryErrorState
        title="Follow-ups unavailable"
        description="We could not load this follow-up view. Your selected status and page are kept. Retry before acting on these reminders."
        onRetry={onRetry}
        isRetrying={isFetching}
      />
    );
  if (!followups.length)
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/20">
        <Clock
          className="mx-auto h-10 w-10 text-muted-foreground mb-3"
          aria-hidden="true"
        />
        <CardDescription>{emptyMessage}</CardDescription>
      </div>
    );
  return (
    <div className="space-y-3">
      {followups.map((followup) => (
        <FollowupCard
          key={followup.id}
          followup={followup}
          onComplete={onComplete}
          onCancel={onCancel}
          actingId={actingId}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabValue = "today" | "pending" | "completed" | "cancelled";
export default function SellerFollowupsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("today");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const todayQuery = trpc.crm.getDueToday.useQuery();
  const status = activeTab === "today" ? "pending" : activeTab;
  const historyQuery = trpc.crm.getMyFollowups.useQuery(
    { status, page, limit: 20 },
    { enabled: activeTab !== "today" },
  );
  const completeMutation = trpc.crm.completeFollowup.useMutation();
  const cancelMutation = trpc.crm.cancelFollowup.useMutation();
  const refetchAll = () => {
    void utils.crm.getDueToday.invalidate();
    void utils.crm.getMyFollowups.invalidate();
  };
  const handleComplete = async (id: string) => {
    setActingId(id);
    try {
      await completeMutation.mutateAsync({ followupId: id });
      toast.success("Follow-up marked complete!");
      refetchAll();
    } catch {
      toast.error("Failed to complete follow-up.");
    } finally {
      setActingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setActingId(id);
    try {
      await cancelMutation.mutateAsync({ followupId: id });
      toast.success("Follow-up cancelled.");
      refetchAll();
    } catch {
      toast.error("Failed to cancel follow-up.");
    } finally {
      setActingId(null);
    }
  };

  useEffect(() => {
    if (
      activeTab !== "today" &&
      historyQuery.data &&
      !historyQuery.isError &&
      !historyQuery.isFetching &&
      page > Math.max(1, historyQuery.data.totalPages)
    )
      setPage(Math.max(1, historyQuery.data.totalPages));
  }, [
    activeTab,
    historyQuery.data,
    historyQuery.isError,
    historyQuery.isFetching,
    page,
  ]);
  const today = (todayQuery.data ?? []) as Followup[];
  const items =
    activeTab === "today"
      ? today
      : ((historyQuery.data?.items ?? []) as Followup[]);
  const query = activeTab === "today" ? todayQuery : historyQuery;
  const recoveringPage =
    activeTab !== "today" &&
    Boolean(historyQuery.data) &&
    !historyQuery.isError &&
    page > Math.max(1, historyQuery.data?.totalPages ?? 1);
  const known =
    !query.isLoading &&
    !query.isError &&
    query.data !== undefined &&
    !recoveringPage;
  const pages = Math.max(1, historyQuery.data?.totalPages ?? 1);
  const total = historyQuery.data?.total ?? 0;
  const switching = Boolean(actingId);
  const emptyMessage =
    activeTab === "today"
      ? "No pending follow-ups due through today."
      : activeTab === "pending"
        ? "No pending follow-ups."
        : activeTab === "completed"
          ? "No completed follow-ups yet."
          : "No cancelled follow-ups.";
  return (
    <ProGate feature="Buyer CRM">
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-6 w-6 text-primary" aria-hidden="true" />
              <h1 className="text-3xl font-bold">Follow-ups</h1>
            </div>
            <p className="text-muted-foreground">
              Stay on top of buyer conversations and commitments.
            </p>
          </div>
          <Button
            className="min-h-11 h-auto whitespace-normal"
            onClick={() => setDialogOpen(true)}
            disabled={switching}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New Follow-up
          </Button>
        </header>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (!switching) {
              setActiveTab(value as TabValue);
              setPage(1);
            }
          }}
        >
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger
              className="min-h-11 whitespace-normal"
              disabled={switching}
              value="today"
            >
              Due &amp; overdue
              {!todayQuery.isError && todayQuery.data && today.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {today.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              className="min-h-11 whitespace-normal"
              disabled={switching}
              value="pending"
            >
              All pending
            </TabsTrigger>
            <TabsTrigger
              className="min-h-11 whitespace-normal"
              disabled={switching}
              value="completed"
            >
              Completed
            </TabsTrigger>
            <TabsTrigger
              className="min-h-11 whitespace-normal"
              disabled={switching}
              value="cancelled"
            >
              Cancelled
            </TabsTrigger>
          </TabsList>
          {(["today", "pending", "completed", "cancelled"] as const).map(
            (tab) => (
              <TabsContent key={tab} value={tab} className="mt-6 space-y-4">
                {tab === activeTab && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {tab === "today"
                        ? "Pending reminders due through today's end, including overdue items."
                        : tab === "pending"
                          ? "Every pending reminder, including overdue items and future dates."
                          : "Saved follow-up history."}
                    </p>
                    <FollowupList
                      followups={items}
                      isLoading={query.isLoading || recoveringPage}
                      isError={
                        query.isError ||
                        (!query.isLoading && query.data === undefined)
                      }
                      isFetching={query.isFetching}
                      onRetry={() => void query.refetch()}
                      onComplete={handleComplete}
                      onCancel={handleCancel}
                      actingId={query.isFetching ? "reading" : actingId}
                      emptyMessage={emptyMessage}
                    />
                    {tab !== "today" && known && (
                      <nav
                        aria-label="Follow-up pages"
                        className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                      >
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          {items.length ? (page - 1) * 20 + 1 : 0}–
                          {items.length ? (page - 1) * 20 + items.length : 0} of{" "}
                          {total} follow-ups · Page {Math.min(page, pages)} of{" "}
                          {pages}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="min-h-11"
                            variant="outline"
                            disabled={
                              page <= 1 || query.isFetching || switching
                            }
                            onClick={() =>
                              setPage((value) =>
                                Math.max(1, Math.min(value - 1, pages)),
                              )
                            }
                          >
                            Previous
                          </Button>
                          <Button
                            className="min-h-11"
                            variant="outline"
                            disabled={
                              page >= pages || query.isFetching || switching
                            }
                            onClick={() => setPage((value) => value + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </nav>
                    )}
                  </>
                )}
              </TabsContent>
            ),
          )}
        </Tabs>
        <NewFollowupDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={refetchAll}
        />
      </div>
    </ProGate>
  );
}
