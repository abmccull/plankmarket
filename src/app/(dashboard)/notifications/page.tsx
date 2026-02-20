"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Loader2,
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

const NOTIFICATION_TYPE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
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

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const router = useRouter();
  const { user } = useAuthStore();

  const { data, isLoading } = trpc.notification.getMyNotifications.useQuery({
    page,
    limit,
  });

  const utils = trpc.useUtils();

  const markAsReadMutation = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      utils.notification.getMyNotifications.invalidate();
      utils.notification.getUnreadCount.invalidate();
      utils.notification.getLatest.invalidate();
    },
  });

  const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notification.getMyNotifications.invalidate();
      utils.notification.getUnreadCount.invalidate();
      utils.notification.getLatest.invalidate();
      toast.success("All notifications marked as read");
    },
  });

  const deleteMutation = trpc.notification.delete.useMutation({
    onSuccess: () => {
      utils.notification.getMyNotifications.invalidate();
      utils.notification.getUnreadCount.invalidate();
      utils.notification.getLatest.invalidate();
      toast.success("Notification deleted");
    },
  });

  const clearReadMutation = trpc.notification.clearRead.useMutation({
    onSuccess: () => {
      utils.notification.getMyNotifications.invalidate();
      utils.notification.getUnreadCount.invalidate();
      utils.notification.getLatest.invalidate();
      toast.success("Read notifications cleared");
    },
  });

  const { data: unreadData } = trpc.notification.getUnreadCount.useQuery();
  const unreadCount = unreadData?.count ?? 0;
  const readCount = (data?.total ?? 0) - unreadCount;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              {markAllAsReadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Mark all as read
            </Button>
          )}
          {readCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearReadMutation.mutate()}
              disabled={clearReadMutation.isPending}
            >
              {clearReadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Clear read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-5 w-16" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="space-y-3">
            {data.items.map((notification) => {
              const href = getNotificationHref(notification, user?.role);
              return (
                <Card
                  key={notification.id}
                  className={`${
                    notification.read
                      ? "opacity-75"
                      : "border-l-4 border-l-primary"
                  }${href ? " cursor-pointer transition-colors hover:bg-muted/50" : ""}`}
                  onClick={() => {
                    if (!href) return;
                    if (!notification.read) {
                      markAsReadMutation.mutate({ id: notification.id });
                    }
                    router.push(href);
                  }}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-2 pt-0.5">
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                        <Badge
                          variant={
                            NOTIFICATION_TYPE_VARIANTS[notification.type] ??
                            "outline"
                          }
                          className="text-[10px] shrink-0"
                        >
                          {NOTIFICATION_TYPE_LABELS[notification.type] ??
                            notification.type}
                        </Badge>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatRelativeTime(notification.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              markAsReadMutation.mutate({
                                id: notification.id,
                              })
                            }
                            disabled={markAsReadMutation.isPending}
                            title="Mark as read"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="Delete notification"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete notification?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove this notification.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  deleteMutation.mutate({
                                    id: notification.id,
                                  })
                                }
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        {href && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages} ({data.total} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No notifications</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              When you receive notifications, they will appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
