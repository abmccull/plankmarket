import { redirect } from "next/navigation";
import { ProConfirmation } from "@/components/subscription/pro-confirmation";

export default async function ProSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sessionId =
    typeof params.session_id === "string" ? params.session_id : null;
  if (!sessionId) redirect("/pro");
  // A return parameter is navigation context, never evidence of paid access.
  return (
    <ProConfirmation
      returnPath={`/pro/success?session_id=${encodeURIComponent(sessionId)}`}
    />
  );
}
