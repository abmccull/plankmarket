"use client";

import { trpc } from "@/lib/trpc/client";
import { ConversationListItem } from "@/components/messaging/conversation-list-item";
import { Loader2, MessageSquare } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function MessagesPage() {
  const { user } = useAuthStore();
  const { data, isLoading } = trpc.message.getMyConversations.useQuery({
    page: 1,
    limit: 50,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const conversations = data?.conversations || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-muted-foreground mt-1">
          View and manage your conversations
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No conversations yet</h3>
          <p className="text-muted-foreground mt-1">
            Start a conversation from a listing page by contacting the seller.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conversation) => {
            // Determine the other party (not the current user)
            const isBuyer = conversation.buyerId === user?.id;
            const otherParty = isBuyer ? conversation.seller : conversation.buyer;
            const otherPartyName =
              otherParty?.businessName || otherParty?.name || "Unknown";

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
        </div>
      )}
    </div>
  );
}
