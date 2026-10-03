"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { ColumnDef } from "@tanstack/react-table";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { formatDate, getErrorMessage } from "@/lib/utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type User = RouterOutputs["admin"]["getUsers"]["users"][number];
type Role = User["role"];
type UserAction =
  | { kind: "role"; user: User; nextRole: Role }
  | { kind: "suspend" | "reinstate"; user: User };
const PAGE_SIZE = 25;
const controlClassName = "min-h-11 h-auto whitespace-normal px-3 py-2";
const selectClassName =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const roleLabel = (role: Role) =>
  role === "admin" ? "Administrator" : role === "seller" ? "Seller" : "Buyer";
const isRole = (value: string): value is Role =>
  value === "buyer" || value === "seller" || value === "admin";

function verificationLabel(user: User) {
  switch (user.verificationStatus) {
    case "verified":
      return "Verified";
    case "pending":
      return "Pending review";
    case "rejected":
      return "Rejected";
    case "unverified":
      return "Unverified";
    default:
      return "Status unavailable";
  }
}

export default function AdminUsersPage() {
  const user = useAuthStore((state) => state.user);
  if (!user || user.role !== "admin") {
    return <StatePanelLoading label="Checking administrator access" rows={2} />;
  }
  return <UsersQueue key={user.id} actorId={user.id} />;
}

function UsersQueue({ actorId }: { actorId: string }) {
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [action, setAction] = useState<UserAction | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewUser, setReviewUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const reviewRequired = useRef(false);
  const usersQuery = trpc.admin.getUsers.useQuery({
    page,
    limit: PAGE_SIZE,
    query: query || undefined,
    role: role === "all" ? undefined : role,
  });
  const utils = trpc.useUtils();
  const updateRole = trpc.admin.updateUser.useMutation({ retry: false });
  const suspendUser = trpc.admin.suspendUser.useMutation({ retry: false });
  const reinstateUser = trpc.admin.unsuspendUser.useMutation({ retry: false });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function isCurrent() {
    const live = useAuthStore.getState().user;
    return mounted.current && live?.id === actorId && live.role === "admin";
  }

  function openAction(next: UserAction) {
    if (
      !isCurrent() ||
      pending.current ||
      reviewRequired.current ||
      usersQuery.isError ||
      usersQuery.isFetching
    )
      return;
    setAction(next);
    setReason("");
    setActionError(null);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCurrent() || pending.current) return;
    setQuery(searchDraft.trim());
    setPage(1);
  }

  async function reviewCurrentUser() {
    if (!reviewUser || !isCurrent() || pending.current) return;
    const target = reviewUser;
    pending.current = true;
    setBusy(true);
    try {
      // Direct read avoids placing a departed administrator's late result into query cache.
      const result = await utils.client.admin.getUsers.query({
        query: target.email,
        page: 1,
        limit: PAGE_SIZE,
      });
      if (!isCurrent()) return;
      const fresh = result.users.find((user) => user.id === target.id);
      if (!fresh)
        throw new Error(
          "This account was not returned. Keep account changes paused and contact support if refreshing does not restore it.",
        );
      setAction((previous) =>
        previous && previous.user.id === fresh.id
          ? { ...previous, user: fresh }
          : previous,
      );
      reviewRequired.current = false;
      setReviewUser(null);
      setActionError(null);
      setNotice(
        "Current account details reloaded. Review the displayed status before deciding on another change. This does not confirm the earlier request's provider outcome.",
      );
      await utils.admin.getUsers.invalidate(undefined, { refetchType: "none" });
      if (!isCurrent()) return;
      const refreshed = await usersQuery.refetch();
      if (!isCurrent()) return;
      if (refreshed.error)
        setNotice(
          "Account details reloaded, but the user list could not refresh. Retry the list before making another change; no account change was submitted by this refresh.",
        );
    } catch (error) {
      if (!isCurrent()) return;
      setActionError(
        getErrorMessage(
          error,
          "We could not reload this account. Account changes remain paused.",
        ),
      );
    } finally {
      pending.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  async function confirmAction() {
    if (
      !action ||
      !isCurrent() ||
      pending.current ||
      reviewRequired.current ||
      usersQuery.isError ||
      usersQuery.isFetching
    )
      return;
    const selected = action;
    if (selected.kind === "role" && selected.nextRole === selected.user.role)
      return;
    if (
      selected.kind === "suspend" &&
      (!reason.trim() || reason.length > 500)
    ) {
      setActionError("Enter a suspension reason of 1 to 500 characters.");
      return;
    }
    if (
      selected.kind === "suspend" &&
      (selected.user.role === "admin" || !selected.user.active)
    )
      return;
    if (selected.kind === "reinstate" && selected.user.active) return;
    pending.current = true;
    setBusy(true);
    setActionError(null);
    let acceptedMessage: string | null = null;
    try {
      if (selected.kind === "role") {
        const updated = await updateRole.mutateAsync({
          userId: selected.user.id,
          role: selected.nextRole,
        });
        if (
          !updated ||
          updated.id !== selected.user.id ||
          updated.role !== selected.nextRole
        ) {
          throw new Error(
            "The role change was not confirmed. Refresh account details before another attempt.",
          );
        }
        acceptedMessage =
          "Role updated for " +
          selected.user.name +
          " to " +
          roleLabel(updated.role) +
          ".";
      } else if (selected.kind === "suspend") {
        await suspendUser.mutateAsync({
          userId: selected.user.id,
          reason: reason.trim(),
        });
        acceptedMessage = "Suspension accepted for " + selected.user.name + ".";
      } else {
        await reinstateUser.mutateAsync({ userId: selected.user.id });
        acceptedMessage =
          "Reinstatement accepted for " + selected.user.name + ".";
      }
      if (!isCurrent()) return;
      setNotice(acceptedMessage);
      setAction(null);
      setReason("");
      // Refetch only this queue; never repeat an accepted mutation to refresh its display.
      await utils.admin.getUsers.invalidate(undefined, { refetchType: "none" });
      if (!isCurrent()) return;
      const refreshed = await usersQuery.refetch();
      if (!isCurrent()) return;
      if (refreshed.error)
        setNotice(
          acceptedMessage +
            " We could not refresh the list. Retry refresh; do not repeat the change.",
        );
    } catch (error) {
      if (!isCurrent()) return;
      if (acceptedMessage) {
        setNotice(
          acceptedMessage +
            " We could not refresh the list. Retry refresh; do not repeat the change.",
        );
      } else {
        reviewRequired.current = true;
        setReviewUser(selected.user);
        setActionError(
          getErrorMessage(error, "We could not confirm this account change.") +
            " Refresh account details before another attempt; the earlier request may have completed.",
        );
      }
    } finally {
      pending.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  const actionsDisabled =
    busy || !!reviewUser || usersQuery.isFetching || usersQuery.isError;
  const unchangedAction =
    action?.kind === "role"
      ? action.nextRole === action.user.role
      : action?.kind === "suspend"
        ? !action.user.active || action.user.role === "admin"
        : action?.kind === "reinstate"
          ? action.user.active
          : true;

  function renderActions(user: User) {
    return (
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className={controlClassName}
          disabled={actionsDisabled}
          aria-label={"Change role for " + user.name + " (" + user.email + ")"}
          onClick={() =>
            openAction({ kind: "role", user, nextRole: user.role })
          }
        >
          Change role
        </Button>
        {user.active && user.role !== "admin" ? (
          <Button
            type="button"
            variant="outline"
            className={controlClassName}
            disabled={actionsDisabled}
            aria-label={"Suspend " + user.name + " (" + user.email + ")"}
            onClick={() => openAction({ kind: "suspend", user })}
          >
            Suspend
          </Button>
        ) : null}
        {!user.active ? (
          <Button
            type="button"
            variant="outline"
            className={controlClassName}
            disabled={actionsDisabled}
            aria-label={"Reinstate " + user.name + " (" + user.email + ")"}
            onClick={() => openAction({ kind: "reinstate", user })}
          >
            Reinstate
          </Button>
        ) : null}
      </div>
    );
  }

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "name",
      header: "Account",
      cell: ({ row }) => (
        <div className="max-w-xs break-words">
          <p className="font-medium">{row.original.name}</p>
          {row.original.businessName ? (
            <p className="text-sm text-muted-foreground">
              {row.original.businessName}
            </p>
          ) : null}
          <p className="break-all text-sm text-muted-foreground">
            {row.original.email}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => roleLabel(row.original.role),
    },
    {
      accessorKey: "verificationStatus",
      header: "Verification",
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.verificationStatus === "verified" &&
            row.original.verified
              ? "success"
              : "outline"
          }
        >
          {verificationLabel(row.original)}
        </Badge>
      ),
    },
    {
      accessorKey: "active",
      header: "Access",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "outline" : "destructive"}>
          {row.original.active ? "Active" : "Suspended"}
        </Badge>
      ),
    },
    {
      accessorKey: "stripeAccountId",
      header: "Stripe",
      cell: ({ row }) =>
        row.original.stripeAccountId ? "Account linked" : "Not linked",
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => renderActions(row.original),
    },
  ];

  return (
    <div className="space-y-6" aria-label="User management workspace">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="mt-1 text-muted-foreground">
          Find an account, review its status, and confirm changes to access.
        </p>
      </div>
      <form
        onSubmit={search}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        aria-label="Search users"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="user-search">Name, email, or business</Label>
          <Input
            id="user-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            disabled={busy}
            className="min-h-11"
            type="search"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="user-role-filter">Role</Label>
          <select
            id="user-role-filter"
            value={role}
            disabled={busy}
            className={selectClassName}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all" || isRole(value)) {
                setRole(value);
                setPage(1);
              }
            }}
          >
            <option value="all">All roles</option>
            <option value="buyer">Buyers</option>
            <option value="seller">Sellers</option>
            <option value="admin">Administrators</option>
          </select>
        </div>
        <Button type="submit" disabled={busy} className={controlClassName}>
          Search users
        </Button>
      </form>
      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}
      {reviewUser && !action ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-destructive/40 p-4"
        >
          <p className="text-sm">
            {actionError || "Refresh account details before another change."}
          </p>
          <Button
            type="button"
            variant="outline"
            className={controlClassName}
            disabled={busy}
            onClick={() => void reviewCurrentUser()}
          >
            Refresh account details
          </Button>
        </div>
      ) : null}
      {usersQuery.isError ? (
        <QueryErrorState
          title="We couldn't load users"
          description="Account actions are unavailable until the list refreshes. Refreshing only reads account details and does not repeat an accepted change."
          onRetry={() => {
            if (isCurrent() && !pending.current) void usersQuery.refetch();
          }}
          isRetrying={usersQuery.isFetching || busy}
        />
      ) : usersQuery.isLoading || !usersQuery.data ? (
        <StatePanelLoading label="Loading users" rows={3} />
      ) : (
        <DataTable
          columns={columns}
          data={usersQuery.data.users}
          serverPagination={{
            page,
            pageSize: PAGE_SIZE,
            total: usersQuery.data.total,
            totalPages: usersQuery.data.totalPages,
            isFetching: usersQuery.isFetching || busy,
            onPageChange: (next) => {
              if (isCurrent() && !pending.current) setPage(next);
            },
          }}
          renderMobileRow={(user) => (
            <article data-user-id={user.id} className="min-w-0 space-y-3">
              <div className="min-w-0">
                <h2 className="break-words font-semibold">{user.name}</h2>
                {user.businessName ? (
                  <p className="break-words text-sm">{user.businessName}</p>
                ) : null}
                <p className="break-all text-sm text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{roleLabel(user.role)}</Badge>
                <Badge
                  variant={
                    user.verificationStatus === "verified" && user.verified
                      ? "success"
                      : "outline"
                  }
                >
                  {verificationLabel(user)}
                </Badge>
                <Badge variant={user.active ? "outline" : "destructive"}>
                  {user.active ? "Active" : "Suspended"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {user.stripeAccountId
                  ? "Stripe account linked"
                  : "Stripe account not linked"}
              </p>
              {renderActions(user)}
            </article>
          )}
        />
      )}
      <AlertDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !pending.current) setAction(null);
        }}
      >
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action?.kind === "role"
                ? "Confirm role change"
                : action?.kind === "suspend"
                  ? "Confirm suspension"
                  : "Confirm reinstatement"}
            </AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {action?.user.name}{" "}
              <span className="break-all">({action?.user.email})</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {action?.kind === "role" ? (
            <div className="space-y-3">
              <p className="text-sm">
                Current role: <strong>{roleLabel(action.user.role)}</strong> →
                Proposed role: <strong>{roleLabel(action.nextRole)}</strong>
              </p>
              <Label htmlFor="proposed-user-role">New role</Label>
              <select
                id="proposed-user-role"
                className={selectClassName}
                value={action.nextRole}
                disabled={busy || !!reviewUser}
                onChange={(event) => {
                  const nextRole = event.target.value;
                  if (isRole(nextRole)) setAction({ ...action, nextRole });
                }}
              >
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="admin">Administrator</option>
              </select>
              {action.nextRole === "admin" ? (
                <p className="text-sm">
                  Administrator access includes managing accounts, marketplace
                  operations, and financial actions. Existing security checks
                  still apply.
                </p>
              ) : (
                <p className="text-sm">
                  This changes the account’s marketplace role. Account activity
                  and business verification status are not changed by this
                  action.
                </p>
              )}
              {action.user.role === "admin" && action.nextRole !== "admin" ? (
                <p className="text-sm">
                  This removes administrator access from this account.
                </p>
              ) : null}
              {action.user.id === actorId ? (
                <p className="text-sm font-medium">
                  You are changing your own account. Choosing another role can
                  remove your access to these administrator tools.
                </p>
              ) : null}
            </div>
          ) : action?.kind === "suspend" ? (
            <div className="space-y-3">
              <p className="text-sm">
                This account will lose platform access. The suspension reason is
                included in the account notification.
              </p>
              <Label htmlFor="user-suspend-reason">Suspension reason</Label>
              <Textarea
                id="user-suspend-reason"
                value={reason}
                maxLength={500}
                disabled={busy || !!reviewUser}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby="user-suspend-help"
                rows={3}
              />
              <p
                id="user-suspend-help"
                className="text-sm text-muted-foreground"
              >
                Required. Up to 500 characters.
              </p>
            </div>
          ) : (
            <p className="text-sm">
              This restores platform access and sends an account notification.
              It does not change the account’s role or verification status.
            </p>
          )}
          {actionError ? (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          ) : null}
          {reviewUser ? (
            <Button
              type="button"
              variant="outline"
              className={controlClassName}
              disabled={busy}
              onClick={() => void reviewCurrentUser()}
            >
              Refresh account details
            </Button>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className={controlClassName}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={controlClassName}
              disabled={
                actionsDisabled ||
                unchangedAction ||
                (action?.kind === "suspend" && !reason.trim())
              }
              onClick={(event) => {
                event.preventDefault();
                void confirmAction();
              }}
            >
              {busy ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {busy
                ? "Working…"
                : action?.kind === "role"
                  ? "Confirm role change"
                  : action?.kind === "suspend"
                    ? "Suspend account"
                    : "Reinstate account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
