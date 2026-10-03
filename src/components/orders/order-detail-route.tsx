"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";
import { AlertCircle } from "lucide-react";
import { QueryErrorState, StatePanel, StatePanelLoading } from "@/components/ui/state-panel";

export type ParticipantOrder = inferRouterOutputs<AppRouter>["order"]["getById"];
type Side = "buyer" | "seller";
type Props = {
  orderId: string;
  side: Side;
  children: (order: ParticipantOrder, refetch: () => void) => ReactNode;
};
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const loading = () => <StatePanelLoading label="Loading order details" rows={2} className="max-w-4xl" />;

function ReadFailure({ orderId, side, code, message, retry, pending = false }: {
  orderId: string; side: Side; code?: string; message?: string; retry?: () => void; pending?: boolean;
}) {
  const unavailable = code === "NOT_FOUND" || code === "FORBIDDEN";
  const signInRequired = code === "UNAUTHORIZED";
  const mfaRequired = code === "FORBIDDEN" && message === MFA_REQUIRED_MESSAGE;
  const returnPath = `/${side}/orders/${orderId}`;
  const back = { label: "Back to orders", href: `/${side}/orders` };
  const recoveryAction = mfaRequired
    ? { label: "Verify session", href: `/mfa?next=${encodeURIComponent(returnPath)}` }
    : signInRequired
      ? { label: "Sign in again", href: `/login?redirect=${encodeURIComponent(returnPath)}` }
      : undefined;
  const title = mfaRequired ? "Verify your session" : signInRequired ? "Sign in to view this order" : unavailable ? "Order unavailable" : "We couldn't load this order";
  const description = mfaRequired ? "Verify your session to continue viewing this order." : signInRequired ? "Sign in again to verify access to this order." : unavailable ? "This order is unavailable to your account. Return to your orders to choose another order, or retry to check again." : "We could not confirm the latest order details. Retry before taking another action.";
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Order details</h1>
      {recoveryAction || !retry ? (
        <StatePanel icon={AlertCircle} tone="error" title={title}
          description={!retry && !recoveryAction ? "Return to your orders to choose an available order." : description}
          primaryAction={recoveryAction ?? back} secondaryAction={recoveryAction ? back : undefined} />
      ) : (
        <QueryErrorState title={title} description={description} onRetry={retry}
          isRetrying={pending} secondaryAction={back} />
      )}
    </div>
  );
}

export function OrderDetailRoute(props: Props) {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return loading();
  if (!isAuthenticated || !user) {
    return <ReadFailure {...props} code="UNAUTHORIZED" />;
  }
  if (!validId(props.orderId)) {
    return <ReadFailure {...props} code="NOT_FOUND" />;
  }
  return <OwnedOrderRoute key={`${user.id}:${user.role}:${props.orderId}:${props.side}`} {...props} ownerId={user.id} accountRole={user.role} />;
}

function OwnedOrderRoute({ ownerId, accountRole, orderId, side, children }: Props & {
  ownerId: string;
  accountRole: "buyer" | "seller" | "admin";
}) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [accepted, setAccepted] = useState<ParticipantOrder | null>(null);
  const current = () => {
    const auth = useAuthStore.getState();
    return !auth.isLoading && auth.isAuthenticated && auth.user?.id === ownerId && auth.user.role === accountRole;
  };
  // This projection is viewer-sensitive. Its cache cannot be shared solely by
  // order ID, even when the new account is the order's other participant.
  const query = useQuery<{
    ownerId: string; accountRole: string; order: ParticipantOrder;
  }, TRPCClientErrorLike<AppRouter>>({
    queryKey: [...getQueryKey(trpc.order.getById, { id: orderId }, "query"), { ownerId, accountRole }],
    queryFn: async ({ signal }) => {
      if (!current()) throw new Error("Order account changed");
      const order = await utils.client.order.getById.query({ id: orderId }, { signal });
      if (signal.aborted || !current()) throw new Error("Order account changed");
      return { ownerId, accountRole, order };
    },
    retry: 1,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const owned = query.data?.ownerId === ownerId && query.data.accountRole === accountRole;
  const order = owned && query.data?.order?.id === orderId ? query.data.order : undefined;
  const participantSide = order?.buyerId === ownerId ? "buyer" : order?.sellerId === ownerId ? "seller" : null;
  const allowed = Boolean(order && (accountRole === "admin" || participantSide));
  const settled = current() && query.isFetchedAfterMount && !query.isFetching && !query.isError;
  const destination = settled && allowed && accountRole !== "admin" && participantSide !== side
    ? `/${participantSide}/orders/${orderId}` : null;
  const showContent = settled && allowed && Boolean(order) && !destination;
  // Admit only a fresh, correctly scoped row. The keyed boundary clears this
  // snapshot for an owner/role/order/side change; initial cached or wrong-side
  // data can never create a detail subtree.
  if (showContent && order && accepted !== order) setAccepted(order);

  useEffect(() => {
    const auth = useAuthStore.getState();
    if (destination && !auth.isLoading && auth.isAuthenticated && auth.user?.id === ownerId && auth.user.role === accountRole) {
      router.replace(destination);
    }
  }, [destination, ownerId, accountRole, router]);

  const refetch = () => { if (current()) void query.refetch(); };
  if (!current()) return loading();
  // Keep accepted same-account form state through revalidation and read errors,
  // while withholding its controls until the required order read is current.
  const feedback = query.isError
    ? <ReadFailure orderId={orderId} side={side} code={query.error.data?.code} message={query.error.message} retry={refetch} pending={query.isFetching} />
    : !query.isFetchedAfterMount || query.isPending || query.isFetching || destination
      ? loading()
      : !allowed || !order
        ? <ReadFailure orderId={orderId} side={side} code="NOT_FOUND" retry={refetch} />
        : null;
  return (
    <>
      {feedback}
      {accepted && (
        <div hidden={!showContent} inert={!showContent} aria-hidden={!showContent ? true : undefined}>
          {children(accepted, refetch)}
        </div>
      )}
    </>
  );
}
