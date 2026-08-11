export function shouldAutoRedirectFromMfa(params: {
  currentLevel: "aal1" | "aal2" | null | undefined;
  recentVerificationSatisfied: boolean | null | undefined;
  next: string | null;
  intent: string | null;
}) {
  return (
    params.currentLevel === "aal2" &&
    params.recentVerificationSatisfied === true &&
    params.next !== null &&
    params.intent !== "manage"
  );
}
