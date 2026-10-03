import { VerificationForm } from "@/components/verification/verification-form";

export default async function BuyerVerificationPage({ searchParams }: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const { redirect } = await searchParams;
  return <VerificationForm returnPath={typeof redirect === "string" ? redirect : null} />;
}
