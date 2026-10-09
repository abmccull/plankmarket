"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  Trash2,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { getNotificationHref } from "@/lib/utils/notification-href";

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  order_confirmed: "Order",
  order_shipped: "Shipping",
  order_delivered: "Delivery",
  new_offer: "Offer",
  listing_match: "Match",
  listing_expiring: "Listing",
  payment_received: "Payment",
  review_received: "Review",
  system: "System",
};

const NOTIFICATION_TYPE_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  order_confirmed: "default",
  order_shipped: "default",
  order_delivered: "default",
  new_offer: "secondary",
  listing_match: "secondary",
  listing_expiring: "destructive",
  payment_received: "default",
  review_received: "secondary",
  system: "outline",
};

type NotificationAction =
  | { kind: "read" | "delete"; id: string; title: string }
  | { kind: "readAll" | "clearRead" };

function actionFailure(action: NotificationAction) {
  switch (action.kind) {
    case "read":
      return `We couldn't mark “${action.title}” as read.`;
    case "readAll":
      return "We couldn't mark all notifications as read.";
    case "delete":
      return `We couldn't confirm whether “${action.title}” was deleted. Refresh notifications before trying again.`;
    case "clearRead":
      return "We couldn't confirm whether read notifications were cleared. Refresh notifications before trying again.";
  }
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<NotificationAction | null>(
    null,
  );
  const [failedAction, setFailedAction] = useState<NotificationAction | null>(
    null,
  );
  const actionLock = useRef(false);
  const { user } = useAuthStore();
  const listQuery = trpc.notification.getMyNotifications.useQuery({
    page,
    limit: 20,
  });
  const unreadQuery = trpc.notification.getUnreadCount.useQuery();
  const utils = trpc.useUtils();
  const markAsReadMutation = trpc.notification.markAsRead.useMutation();
  const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation();
  const deleteMutation = trpc.notification.delete.useMutation();
  const clearReadMutation = trpc.notification.clearRead.useMutation();
  const data = listQuery.data;
  const unreadCount = unreadQuery.isSuccess ? unreadQuery.data.count : null;
  const countsAvailable = listQuery.isSuccess && unreadCount !== null;
  const readCount = countsAvailable
    ? Math.max(0, (data?.total ?? 0) - unreadCount)
    : 0;
  const lastPage = data ? Math.max(1, data.totalPages) : page;
  const pageNeedsClamp = listQuery.isSuccess && page > lastPage;
  const needsReconciliation =
    failedAction?.kind === "delete" || failedAction?.kind === "clearRead";
  const controlsDisabled = pendingAction !== null || needsReconciliation;

  useEffect(() => {
    if (pageNeedsClamp) setPage(lastPage);
  }, [pageNeedsClamp, lastPage]);

  async function refreshNotifications() {
    const [list, unread] = await Promise.all([
      listQuery.refetch(),
      unreadQuery.refetch(),
    ]);
    void utils.notification.getLatest.invalidate();
    if (!list.isError && !unread.isError) setFailedAction(null);
  }

  async function runAction(action: NotificationAction) {
    if (actionLock.current || needsReconciliation) return;
    actionLock.current = true;
    setPendingAction(action);
    setFailedAction(null);
    try {
      switch (action.kind) {
        case "read":
          await markAsReadMutation.mutateAsync({ id: action.id });
          break;
        case "readAll":
          await markAllAsReadMutation.mutateAsync();
          break;
        case "delete":
          await deleteMutation.mutateAsync({ id: action.id });
          break;
        case "clearRead":
          await clearReadMutation.mutateAsync();
          break;
      }
    } catch {
      setFailedAction(action);
      toast.error(actionFailure(action));
      return;
    } finally {
      actionLock.current = false;
      setPendingAction(null);
    }

    void utils.notification.getMyNotifications.invalidate();
    void utils.notification.getUnreadCount.invalidate();
    void utils.notification.getLatest.invalidate();
    if (action.kind === "readAll")
      toast.success("All notifications marked as read");
    if (action.kind === "delete") toast.success("Notification deleted");
    if (action.kind === "clearRead")
      toast.success("Read notifications cleared");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold">Notifications</h1>
          <p className="mt-1 text-muted-foreground" aria-live="polite">
            {unreadCount === null
              ? unreadQuery.isError
                ? "Unread count is unavailable"
                : "Checking unread notifications…"
              : unreadCount > 0
                ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "All caught up"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount !== null && unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-11 whitespace-normal"
              onClick={() => void runAction({ kind: "readAll" })}
              disabled={controlsDisabled}
            >
              <CheckCheck
                className="mr-2 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {pendingAction?.kind === "readAll"
                ? "Marking as read…"
                : "Mark all as read"}
            </Button>
          )}
          {countsAvailable && readCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-11 whitespace-normal"
              onClick={() => void runAction({ kind: "clearRead" })}
              disabled={controlsDisabled}
            >
              <XCircle className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
              {pendingAction?.kind === "clearRead"
                ? "Clearing read…"
                : "Clear read"}
            </Button>
          )}
        </div>
      </div>

      {unreadQuery.isError && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-destructive/30 p-4"
        >
          <p className="text-sm">
            We couldn&apos;t check your unread count. Your notifications may
            still be available below.
          </p>
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={unreadQuery.isFetching}
            onClick={() => void unreadQuery.refetch()}
          >
            {unreadQuery.isFetching ? "Checking…" : "Retry unread count"}
          </Button>
        </div>
      )}

      {failedAction && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-destructive/30 p-4"
        >
          <p className="break-words text-sm">{actionFailure(failedAction)}</p>
          <div className="flex flex-wrap gap-2">
            {!needsReconciliation && (
              <Button
                variant="outline"
                className="h-auto min-h-11 whitespace-normal"
                disabled={pendingAction !== null}
                onClick={() => void runAction(failedAction)}
              >
                Try again
              </Button>
            )}
            <Button
              variant="outline"
              className="h-auto min-h-11 whitespace-normal"
              disabled={listQuery.isFetching || unreadQuery.isFetching}
              onClick={() => void refreshNotifications()}
            >
              {listQuery.isFetching || unreadQuery.isFetching
                ? "Refreshing…"
                : "Refresh notifications"}
            </Button>
          </div>
        </div>
      )}

      {listQuery.isError && (
        <QueryErrorState
          title={
            data
              ? "Latest notifications are unavailable"
              : "We couldn't load your notifications"
          }
          description={
            data
              ? "Your last loaded notifications are shown below. Refresh before relying on their latest status."
              : "We couldn't confirm your notification history. Try again to load it."
          }
          onRetry={() => void listQuery.refetch()}
          isRetrying={listQuery.isFetching}
        />
      )}

      {listQuery.isLoading || pageNeedsClamp ? (
        <StatePanelLoading
          label={
            pageNeedsClamp
              ? "Loading earlier notifications"
              : "Loading notifications"
          }
        />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((notification) => {
            const href = getNotificationHref(notification, user?.role);
            return (
              <Card
                key={notification.id}
                className={
                  notification.read ? "" : "border-l-4 border-l-primary"
                }
              >
                <CardContent className="py-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row">
                    <div className="w-full min-w-0 flex-1 sm:w-auto">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            NOTIFICATION_TYPE_VARIANTS[notification.type] ??
                            "outline"
                          }
                        >
                          {NOTIFICATION_TYPE_LABELS[notification.type] ??
                            notification.type}
                        </Badge>
                        {!notification.read && (
                          <span className="text-xs font-medium text-primary">
                            Unread
                          </span>
                        )}
                      </div>
                      {href ? (
                        <Link
                          href={href}
                          aria-label={`Open notification: ${notification.title}`}
                          className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-sm text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            if (!notification.read)
                              void runAction({
                                kind: "read",
                                id: notification.id,
                                title: notification.title,
                              });
                          }}
                        >
                          <span className="min-w-0 break-words">
                            {notification.title}
                          </span>
                          <ChevronRight
                            className="h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                        </Link>
                      ) : (
                        <p className="break-words text-sm font-semibold">
                          {notification.title}
                        </p>
                      )}
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          aria-label={`Mark as read: ${notification.title}`}
                          disabled={controlsDisabled}
                          onClick={() =>
                            void runAction({
                              kind: "read",
                              id: notification.id,
                              title: notification.title,
                            })
                          }
                        >
                          <CheckCheck className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete notification: ${notification.title}`}
                            disabled={controlsDisabled}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete notification?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="break-words">
                              Permanently remove “{notification.title}” from
                              your notifications. The related order, offer or
                              conversation is not deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={controlsDisabled}
                              onClick={() =>
                                void runAction({
                                  kind: "delete",
                                  id: notification.id,
                                  title: notification.title,
                                })
                              }
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : listQuery.isSuccess && data?.total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell
              className="mx-auto h-12 w-12 text-muted-foreground/50"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-lg font-medium">No notifications</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Updates about your orders, offers and saved searches will appear
              here.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {(page > 1 || (data?.totalPages ?? 0) > 1) && (
        <nav
          aria-label="Notification pages"
          className="flex flex-wrap items-center justify-between gap-3 pt-4"
        >
          <p className="text-sm text-muted-foreground">
            {listQuery.isSuccess && data && !pageNeedsClamp
              ? `Page ${data.page} of ${data.totalPages} (${data.total} total)`
              : `Page ${page}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-11"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-11"
              disabled={
                !listQuery.isSuccess || !data?.hasMore || pageNeedsClamp
              }
              onClick={() => setPage((current) => current + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
