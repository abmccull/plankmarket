"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SellerPaymentNotReadyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  sellerName: string;
  listingId: string;
}

export function SellerPaymentNotReadyDialog({
  open,
  onOpenChange,
  sellerId,
  sellerName,
  listingId,
}: SellerPaymentNotReadyDialogProps) {
  const router = useRouter();
  const [isContactingLoading, setIsContactingLoading] = useState(false);
  const [isWatchingLoading, setIsWatchingLoading] = useState(false);

  const utils = trpc.useUtils();
  const nudgeSeller = trpc.payment.nudgeSellerToOnboard.useMutation();
  const addToWatchlist = trpc.watchlist.add.useMutation();
  const getOrCreateConversation = trpc.message.getOrCreateConversation.useMutation();

  const handleContactSeller = async () => {
    setIsContactingLoading(true);
    try {
      // Create or get conversation
      const conversation = await getOrCreateConversation.mutateAsync({
        listingId,
      });

      // Nudge seller to set up payments
      await nudgeSeller.mutateAsync({ sellerId, listingId });

      toast.success(`Opening conversation with ${sellerName}`);

      // Navigate to the messages page with conversation
      if (conversation?.id) {
        router.push(`/messages?conversation=${conversation.id}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to contact seller";
      toast.error(message);
    } finally {
      setIsContactingLoading(false);
    }
  };

  const handleWatchListing = async () => {
    setIsWatchingLoading(true);
    try {
      await addToWatchlist.mutateAsync({ listingId });

      // Nudge seller to set up payments
      await nudgeSeller.mutateAsync({ sellerId, listingId });

      toast.success("Added to watchlist. We've notified the seller!");
      utils.watchlist.isWatchlisted.invalidate({ listingId });
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add to watchlist";
      toast.error(message);
    } finally {
      setIsWatchingLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment Setup Needed</DialogTitle>
          <DialogDescription>
            {sellerName} hasn&apos;t finished setting up payment processing yet. We&apos;ve
            sent them a notification to complete their setup.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            In the meantime, you can contact the seller directly to discuss this listing,
            or add it to your watchlist to get notified when it becomes available for purchase.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            variant="default"
            className="w-full"
            onClick={handleContactSeller}
            disabled={isContactingLoading || isWatchingLoading}
          >
            {isContactingLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Contact Seller
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleWatchListing}
            disabled={isContactingLoading || isWatchingLoading}
          >
            {isWatchingLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Heart className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Watch This Listing
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={isContactingLoading || isWatchingLoading}
          >
            Maybe Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
