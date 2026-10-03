export interface RegistrationCoverage {
  windowDays: number;
  profilesCreated: number;
  receiptConfirmed: number;
  completionUnknown: number;
  originalBuyers: number;
  originalSellers: number;
}

export function RegistrationCohortPanel({ cohort }: { cohort: RegistrationCoverage }) {
  const metrics = [
    ["Profiles created", cohort.profilesCreated],
    ["Registration confirmed", cohort.receiptConfirmed],
    ["Completion unknown", cohort.completionUnknown],
  ] as const;
  return <section aria-labelledby="registration-coverage-heading" className="space-y-3">
    <div>
      <h2 id="registration-coverage-heading" className="text-xl font-semibold">Registration coverage</h2>
      <p className="text-sm text-muted-foreground">Current non-admin profiles created in the last {cohort.windowDays} days. Account setup is confirmed by provider read-back.</p>
    </div>
    {cohort.profilesCreated === 0 ? <p className="text-sm text-muted-foreground">No new profiles in this period.</p> : <>
      <dl className="grid gap-4 border-y py-4 sm:grid-cols-3">
        {metrics.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd></div>)}
      </dl>
      <p className="text-sm text-muted-foreground">Confirmed registrations started as {cohort.originalBuyers.toLocaleString()} buyers and {cohort.originalSellers.toLocaleString()} sellers. Unknown completion includes legacy profiles or unresolved account setup; it does not mean registration failed.</p>
    </>}
    <p className="text-xs text-muted-foreground">Registration is separate from purchasing approval, selling approval, and payout readiness. Deleted profiles and current admin accounts are excluded.</p>
  </section>;
}
