import Link from "next/link";
import { VerificationForm } from "@/components/verification/verification-form";

export default async function SellerVerificationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const fromListingDraft = (await searchParams).from === "listing-draft";
  return <>
    <VerificationForm />
    {fromListingDraft && <div className="mt-6 border-t pt-4">
      <Link href="/seller/listings/new" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">Return to your listing draft</Link>
      <p className="mt-1 text-sm text-muted-foreground">Your saved account draft is available on your other devices. Approval does not publish it automatically.</p>
    </div>}
  </>;
}
