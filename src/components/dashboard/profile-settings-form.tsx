"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validators/auth";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState, StatePanelLoading } from "@/components/ui/state-panel";

type Profile = inferRouterOutputs<AppRouter>["auth"]["getProfile"];
const fields = [
  ["name", "Full name", "name"], ["phone", "Phone (optional)", "tel"],
  ["businessName", "Business name", "organization"], ["businessAddress", "Business address", "street-address"],
  ["businessCity", "City", "address-level2"], ["businessState", "State", "address-level1"],
  ["businessZip", "ZIP code", "postal-code"],
] as const;

function values(profile: Profile): UpdateProfileInput {
  return Object.fromEntries(fields.map(([name]) => [name, profile[name] ?? undefined]));
}

export function ProfileSettingsForm() {
  const accountId = useAuthStore((state) => state.user?.id);
  const query = trpc.auth.getProfile.useQuery();
  if (!accountId || query.isLoading) return <StatePanelLoading label="Loading your profile" rows={3} />;
  if (!query.data || query.data.id !== accountId) return <QueryErrorState title="We couldn’t load your profile" description="Your saved details have not changed. Retry before editing your profile." onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
  return <ProfileEditor key={accountId} accountId={accountId} profile={query.data} unavailable={query.isError} retrying={query.isFetching} onRetry={() => void query.refetch()} />;
}

function ProfileEditor({ accountId, profile, unavailable, retrying, onRetry }: { accountId: string; profile: Profile; unavailable: boolean; retrying: boolean; onRetry: () => void }) {
  const utils = trpc.useUtils();
  const mutation = trpc.auth.updateProfile.useMutation();
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = () => active.current && useAuthStore.getState().user?.id === accountId;
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema), defaultValues: values(profile) });

  async function refreshAccount() {
    await Promise.all([utils.auth.getProfile.invalidate(), utils.auth.getSession.invalidate()]);
    const [freshProfile, session] = await Promise.all([utils.auth.getProfile.fetch(), utils.auth.getSession.fetch()]);
    if (!current()) return;
    if (freshProfile.id !== accountId || !session.isAuthenticated || session.user?.id !== accountId) throw new Error("Account refresh unavailable");
    useAuthStore.getState().setUser(session.user);
    setRefreshNeeded(false);
  }

  async function save(data: UpdateProfileInput) {
    if (!current() || unavailable || submitting.current) return;
    submitting.current = true; setBusy(true); setFeedback(null);
    try {
      await mutation.mutateAsync(data);
      if (!current()) return;
      reset(data);
      setFeedback({ error: false, message: "Profile saved." });
      try { await refreshAccount(); }
      catch { if (current()) { setRefreshNeeded(true); setFeedback({ error: true, message: "Your profile was saved, but we couldn’t refresh your account status. Refresh status before continuing." }); } }
    } catch (error) {
      if (current()) setFeedback({ error: true, message: error instanceof Error ? error.message : "We couldn’t confirm the save. Your edits are still here. Check your profile before trying again." });
    } finally { submitting.current = false; if (current()) setBusy(false); }
  }

  if (unavailable) return <QueryErrorState title={refreshNeeded ? "Profile saved; account status unavailable" : "We couldn’t refresh your profile"} description={refreshNeeded ? "Your changes were saved. Retry the account read; you do not need to save the same changes again." : "Your unsaved edits are kept on this page. Retry before saving."} onRetry={onRetry} isRetrying={retrying} />;
  return <form onSubmit={handleSubmit(save)} noValidate>
    <Card><CardHeader><CardTitle>Profile information</CardTitle><CardDescription>Keep your contact and business details current.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm"}>{feedback.message}</p>}
        {refreshNeeded && <Button type="button" variant="outline" disabled={busy} onClick={() => { setBusy(true); void refreshAccount().then(() => { if (current()) setFeedback({ error: false, message: "Profile saved and account status refreshed." }); }).catch(() => { if (current()) setFeedback({ error: true, message: "Your profile is saved. Account status is still unavailable; try refreshing again." }); }).finally(() => { if (current()) setBusy(false); }); }}>Refresh account status</Button>}
        {profile.verificationStatus !== "unverified" && <p className="rounded-md border p-3 text-sm text-muted-foreground">Changing your business name or address may require business verification again before you can transact.</p>}
        <fieldset disabled={busy || refreshNeeded} className="grid gap-4 sm:grid-cols-2">
          {fields.map(([name, label, autoComplete]) => <div key={name} className={name === "businessAddress" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
            <Label htmlFor={name}>{label}</Label>
            <Input id={name} type={name === "phone" ? "tel" : "text"} autoComplete={autoComplete} maxLength={name === "businessState" ? 2 : undefined} {...register(name)} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${name}-error` : undefined} />
            {errors[name] && <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{errors[name]?.message}</p>}
          </div>)}
          <div className="sm:col-span-2"><Button type="submit" disabled={!isDirty || busy || refreshNeeded}>{busy ? "Saving…" : "Save changes"}</Button></div>
        </fieldset>
      </CardContent>
    </Card>
  </form>;
}
