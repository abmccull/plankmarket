import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ProBadge } from "@/components/pro-badge";
import { ProSuccessActions } from "@/components/subscription/pro-success-actions";

const UNLOCKED_FEATURES = [
  "Unlimited active listings",
  "Unlimited saved searches",
  "AI agent workflows",
  "Market intelligence",
  "Seller CRM",
  "Bulk CSV import",
  "$15/month promotion credit",
  "Priority verification (24hr)",
  "Pro badge on profile",
] as const;

function CheckCircleIcon() {
  return (
    <svg
      className="h-16 w-16 text-emerald-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default async function ProSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;

  // Redirect away if no valid session_id — prevents direct URL access
  if (!sessionId) {
    redirect("/pro");
  }
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
          <CheckCircleIcon />

          <div className="space-y-2">
            <h1 className="text-2xl font-bold">
              Welcome to PlankMarket Pro! <ProBadge className="ml-1 align-middle" />
            </h1>
            <p className="text-muted-foreground">
              Your subscription is active. Here&apos;s what you&apos;ve unlocked:
            </p>
          </div>

          <ul className="w-full max-w-sm space-y-2 text-left" role="list">
            {UNLOCKED_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm">
                <svg
                  className="h-4 w-4 shrink-0 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <ProSuccessActions />
        </CardContent>
      </Card>
    </div>
  );
}
