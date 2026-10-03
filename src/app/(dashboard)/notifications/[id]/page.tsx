"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";
import { StatePanel, StatePanelLoading } from "@/components/ui/state-panel";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const validId = new RegExp(`^${uuid}$`, "i");
const validDestination = new RegExp(`^(?:/(?:buyer|seller)/(?:orders/${uuid}|samples)|/(?:offers|messages)/${uuid}\\?workspace=(?:buyer|seller)|/admin/orders)$`, "i");

export default function NotificationDestinationPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  if (!user) return <StatePanelLoading label="Checking your account" rows={1} />;
  return <NotificationDestination key={`${user.id}:${user.role}:${id}`} id={id} ownerId={user.id} />;
}

function NotificationDestination({ id, ownerId }: { id: string; ownerId: string }) {
  const router = useRouter();
  const idIsValid = validId.test(id);
  const query = trpc.notification.getDestination.useQuery({ id }, {
    enabled: idIsValid,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const destination = query.data;
  const owned = destination?.ownerId === ownerId;
  const safeHref = typeof destination?.href === "string" && validDestination.test(destination.href)
    ? destination.href : null;

  useEffect(() => {
    if (!query.isFetching && !query.isError && owned && safeHref && useAuthStore.getState().user?.id === ownerId) {
      router.replace(safeHref);
    }
  }, [owned, ownerId, query.isError, query.isFetching, router, safeHref]);

  const unavailable = !idIsValid || query.error?.data?.code === "NOT_FOUND" ||
    (query.isSuccess && !query.isFetching && (!owned || !safeHref));
  if (query.isError || unavailable) {
    const signIn = query.error?.data?.code === "UNAUTHORIZED";
    const verify = query.error?.data?.code === "FORBIDDEN" && query.error.message === MFA_REQUIRED_MESSAGE;
    const returnPath = `/notifications/${encodeURIComponent(id)}`;
    return <StatePanel
      icon={AlertCircle}
      tone="error"
      title={verify ? "Verify your session" : signIn ? "Sign in to open this notification" : unavailable ? "Notification unavailable" : "We could not open this notification"}
      description={verify ? "Confirm your identity to view this administrator notification." : signIn ? "Sign in again to check access to this notification." : unavailable ? "This notification or its related record is no longer available to your account." : "We could not confirm the destination. Try again to check the latest information."}
      primaryAction={verify ? { label: "Verify session", href: `/mfa?next=${encodeURIComponent(returnPath)}` }
        : signIn ? { label: "Sign in again", href: `/login?redirect=${encodeURIComponent(returnPath)}` }
          : idIsValid ? { label: "Retry", onClick: () => void query.refetch(), disabled: query.isFetching } : undefined}
      secondaryAction={{ label: "Back to notifications", href: "/notifications" }}
      className="max-w-2xl"
    />;
  }
  return <StatePanelLoading label="Opening notification" rows={1} className="max-w-2xl" />;
}
