import { CreditCard, MessageSquare, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SellerPaymentSetupStatus = "connected" | "incomplete";

/** Recorded setup only: live payment availability is checked during checkout. */
export function SellerPaymentSetup({
  status,
  className,
}: {
  status?: SellerPaymentSetupStatus | null;
  className?: string;
}) {
  const connected = status === "connected";
  const incomplete = status === "incomplete";
  const Icon = connected ? CreditCard : incomplete ? MessageSquare : CircleHelp;

  return (
    <div className={cn("space-y-0.5 whitespace-normal text-sm", className)}>
      <p className="flex items-start gap-1.5 font-medium leading-snug">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{connected ? "Seller payments connected" : incomplete ? "Inquiries only" : "Payment setup unconfirmed"}</span>
      </p>
      <p className="text-xs leading-relaxed opacity-80">
        {connected
          ? "Payment availability checked again at checkout."
          : incomplete
            ? "Seller payment setup needs attention."
            : "Open the listing for current purchase options."}
      </p>
    </div>
  );
}
