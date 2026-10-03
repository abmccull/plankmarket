"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { ConversationListItem } from "@/components/messaging/conversation-list-item";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { MessageSquare } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function MessagesPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, isFetching, refetch } =
    trpc.message.getMyConversations.useQuery({
      page,
      limit: 50,
    });

  const conversations = data?.conversations ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-muted-foreground mt-1">
          View and manage your conversations
        </p>
      </div>

      {isLoading ? (
        <StatePanelLoading label="Loading your conversations" rows={4} />
      ) : isError || !data ? (
        <QueryErrorState
          title="We couldn't load your messages"
          description="Your conversations have not been changed. Check your connection and try again."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
          secondaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      ) : conversations.length === 0 ? (
        <StatePanel
          icon={MessageSquare}
          title="No conversations yet"
          description="Questions about a lot, freight, or availability? Open a listing and contact the seller to keep the details in one place."
          primaryAction={{ label: "Browse listings", href: "/listings" }}
        />
      ) : (
        <>
          <nav className="space-y-2" aria-label="Marketplace conversations">
            {conversations.map((conversation) => {
              // Determine the other party (not the current user)
              const isBuyer = conversation.buyerId === user?.id;
              const otherParty = isBuyer
                ? conversation.seller
                : conversation.buyer;
              const otherPartyName =
                otherParty?.displayName ?? "Marketplace member";

              // Get last message
              const lastMessage = conversation.messages?.[0];

              // Determine if there are unread messages
              const lastReadAt = isBuyer
                ? conversation.buyerLastReadAt
                : conversation.sellerLastReadAt;

              const hasUnread =
                lastMessage &&
                lastMessage.senderId !== user?.id &&
                (!lastReadAt ||
                  new Date(lastMessage.createdAt) > new Date(lastReadAt));

              return (
                <ConversationListItem
                  key={conversation.id}
                  conversationId={conversation.id}
                  listingTitle={conversation.listing.title}
                  listingThumbnail={conversation.listing.media?.[0]?.url}
                  otherPartyName={otherPartyName}
                  lastMessageBody={lastMessage?.body}
                  lastMessageAt={
                    conversation.lastMessageAt || conversation.createdAt
                  }
                  hasUnread={!!hasUnread}
                />
              );
            })}
          </nav>
          {data.totalPages > 1 && (
            <nav
              aria-label="Conversation pages"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  aria-label="Previous conversations"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  aria-label="Next conversations"
                  disabled={page >= data.totalPages || isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
