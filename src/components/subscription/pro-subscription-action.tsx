"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BillingInterval } from "@/lib/pro-pricing";
import { trpc } from "@/lib/trpc/client";
import { getErrorMessage } from "@/lib/utils";

interface ProSubscriptionActionProps {
  interval?: BillingInterval;
  mode: "manage" | "subscribe";
}

export function ProSubscriptionAction({
  interval = "annual",
  mode,
}: ProSubscriptionActionProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const createCheckout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      setIsRedirecting(false);
      toast.error(getErrorMessage(error));
    },
  });

  const createPortal = trpc.subscription.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      setIsRedirecting(false);
      toast.error(getErrorMessage(error));
    },
  });

  const handleClick = () => {
    setIsRedirecting(true);

    if (mode === "manage") {
      createPortal.mutate();
      return;
    }

    createCheckout.mutate({ interval });
  };

  if (mode === "manage") {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={isRedirecting}
      >
        {isRedirecting ? (
          <>
            <Loader2
              className="mr-2 h-4 w-4 animate-spin"
              aria-hidden="true"
            />
            Redirecting...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
            Manage Subscription
            <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      className="mt-4 w-full"
      variant="gold"
      size="lg"
      onClick={handleClick}
      disabled={isRedirecting}
    >
      {isRedirecting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Redirecting to checkout...
        </>
      ) : (
        `Subscribe${interval === "annual" ? " & Save $99" : ""}`
      )}
    </Button>
  );
}
