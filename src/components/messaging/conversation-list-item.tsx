import Link from "next/link";
import { ListingImage as Image } from "@/components/listings/listing-image";
import { Card } from "@/components/ui/card";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import { Package } from "lucide-react";

interface ConversationListItemProps {
  conversationId: string;
  listingTitle: string;
  listingThumbnail?: string | null;
  otherPartyName: string;
  lastMessageBody?: string;
  lastMessageAt: Date | string;
  hasUnread: boolean;
  isActive?: boolean;
}

export function ConversationListItem({
  conversationId,
  listingTitle,
  listingThumbnail,
  otherPartyName,
  lastMessageBody,
  lastMessageAt,
  hasUnread,
  isActive = false,
}: ConversationListItemProps) {
  return (
    <Link href={`/messages/${conversationId}`}>
      <Card
        elevation={isActive ? "raised" : "flat"}
        className={cn(
          "p-[min(1rem,16px)] hover:bg-muted/30 transition-all cursor-pointer border",
          isActive && "bg-muted/30 border-primary/50"
        )}
      >
        <div className="flex items-start gap-3">
          {/* Listing thumbnail */}
          <div className="h-[48px] w-[48px] rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {listingThumbnail ? (
              <Image
                src={listingThumbnail}
                alt={listingTitle}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <Package className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          {/* Conversation info */}
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex flex-col items-start justify-between gap-2 sm:flex-row">
              <div className="flex-1 min-w-0">
                <h3
                  className={cn(
                    "text-sm font-medium break-words [overflow-wrap:anywhere]",
                    hasUnread && "font-semibold"
                  )}
                >
                  {listingTitle}
                </h3>
                <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                  {otherPartyName}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(lastMessageAt)}
                </span>
                {hasUnread && (
                  <div className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                )}
              </div>
            </div>
            {lastMessageBody && (
              <p
                className={cn(
                  "text-sm text-muted-foreground break-words [overflow-wrap:anywhere]",
                  hasUnread && "font-medium text-foreground"
                )}
              >
                {truncate(lastMessageBody, 60)}
              </p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
