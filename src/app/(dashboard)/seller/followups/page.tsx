"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="font-medium truncate">{followup.title}</p>

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
                  <Badge
                    variant="destructive"
                    className="text-xs ml-1"
                  >
                    Overdue
                  </Badge>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
                  <span className="ml-1.5 hidden sm:inline">Complete</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCancel(followup.id)}
                  disabled={!!actingId}
                  aria-label={`Cancel "${followup.title}"`}
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="ml-1.5 hidden sm:inline">Cancel</span>
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
                Title <span aria-hidden="true" className="text-destructive">*</span>
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
                Due Date &amp; Time <span aria-hidden="true" className="text-destructive">*</span>
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
  onComplete,
  onCancel,
  actingId,
  emptyMessage,
}: {
  followups: Followup[];
  isLoading: boolean;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  actingId: string | null;
  emptyMessage: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (followups.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/20">
        <Clock
          className="mx-auto h-10 w-10 text-muted-foreground mb-3"
          aria-hidden="true"
        />
        <CardDescription>{emptyMessage}</CardDescription>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {followups.map((fu) => (
        <FollowupCard
          key={fu.id}
          followup={fu}
          onComplete={onComplete}
          onCancel={onCancel}
          actingId={actingId}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabValue = "today" | "upcoming" | "completed";

export default function SellerFollowupsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Due today — uses dedicated getDueToday procedure
  const {
    data: todayData,
    isLoading: todayLoading,
    refetch: refetchToday,
  } = trpc.crm.getDueToday.useQuery();

  // Upcoming — pending followups with dueAt in the future
  const {
    data: upcomingData,
    isLoading: upcomingLoading,
    refetch: refetchUpcoming,
  } = trpc.crm.getMyFollowups.useQuery({ status: "pending", page: 1, limit: 50 });

  // Completed
  const {
    data: completedData,
    isLoading: completedLoading,
    refetch: refetchCompleted,
  } = trpc.crm.getMyFollowups.useQuery({
    status: "completed",
    page: 1,
    limit: 50,
  });

  const completeMutation = trpc.crm.completeFollowup.useMutation();
  const cancelMutation = trpc.crm.cancelFollowup.useMutation();

  const refetchAll = () => {
    refetchToday();
    refetchUpcoming();
    refetchCompleted();
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

  // todayData is an array directly (getDueToday returns items[])
  const today: Followup[] = (todayData ?? []) as Followup[];
  // getMyFollowups returns { items, total, ... }
  const upcoming: Followup[] = (upcomingData?.items ?? []) as Followup[];
  const completed: Followup[] = (completedData?.items ?? []) as Followup[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-3xl font-bold">Follow-ups</h1>
          </div>
          <p className="text-muted-foreground">
            Stay on top of buyer conversations and commitments
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New Follow-up
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
      >
        <TabsList>
          <TabsTrigger value="today">
            Due Today
            {today.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 text-xs px-1.5 py-0"
              >
                {today.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            Upcoming
            {upcoming.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 text-xs px-1.5 py-0"
              >
                {upcoming.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-6">
          <FollowupList
            followups={today}
            isLoading={todayLoading}
            onComplete={handleComplete}
            onCancel={handleCancel}
            actingId={actingId}
            emptyMessage="No follow-ups due today."
          />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-6">
          <FollowupList
            followups={upcoming}
            isLoading={upcomingLoading}
            onComplete={handleComplete}
            onCancel={handleCancel}
            actingId={actingId}
            emptyMessage="No upcoming follow-ups scheduled."
          />
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <FollowupList
            followups={completed}
            isLoading={completedLoading}
            onComplete={handleComplete}
            onCancel={handleCancel}
            actingId={actingId}
            emptyMessage="No completed follow-ups yet."
          />
        </TabsContent>
      </Tabs>

      {/* New Followup Dialog */}
      <NewFollowupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={refetchAll}
      />
    </div>
  );
}
