"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ChatBubble } from "@/components/messaging/chat-bubble";
import { MessageInput } from "@/components/messaging/message-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, ExternalLink, Shield } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { BuyerCrmPanel } from "@/components/crm/buyer-crm-panel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const conversationId = params.conversationId as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingReadMessageIdRef = useRef<{
    conversationId: string;
    messageId: string;
  } | null>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [optimisticLastReadAt, setOptimisticLastReadAt] = useState<{
    conversationId: string;
    readAt: string;
  } | null>(null);

  // Get conversation details (includes listing, buyer, seller info)
  const { data: conversationData, isLoading: isLoadingConversation } =
    trpc.message.getConversation.useQuery(
      { conversationId },
      {
        enabled: !!conversationId,
      },
    );

  // Get messages with visible-tab polling only.
  const { data: messages, isLoading: isLoadingMessages } =
    trpc.message.getMessages.useQuery(
      {
        conversationId,
        limit: 100,
      },
      {
        enabled: !!conversationId,
        refetchInterval: isTabVisible ? 10000 : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
      },
    );

  // Mark as read mutation
  const utils = trpc.useUtils();
  const { mutate: markAsRead } = trpc.message.markAsRead.useMutation({
    onSuccess: (result) => {
      if (result.lastReadAt) {
        setOptimisticLastReadAt({
          conversationId,
          readAt: new Date(result.lastReadAt).toISOString(),
        });
      }
      utils.message.getConversation.invalidate({ conversationId });
      utils.message.getMyConversations.invalidate();
      utils.message.getUnreadCount.invalidate();
    },
    onError: () => {
      pendingReadMessageIdRef.current = null;
    },
  });

  // Send message mutation
  const { mutateAsync: sendMessage } = trpc.message.sendMessage.useMutation({
    onSuccess: () => {
      // Invalidate messages to refetch
      utils.message.getMessages.invalidate({ conversationId });
      utils.message.getConversation.invalidate({ conversationId });
      utils.message.getMyConversations.invalidate();
      utils.message.getUnreadCount.invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to send message"));
    },
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState !== "hidden");
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  const isBuyer = conversationData?.buyerId === user?.id;
  const serverLastReadAt = conversationData
    ? isBuyer
      ? conversationData.buyerLastReadAt
      : conversationData.sellerLastReadAt
    : null;
  const effectiveLastReadAt =
    optimisticLastReadAt?.conversationId === conversationId
      ? optimisticLastReadAt.readAt
      : (serverLastReadAt ?? null);
  const latestUnreadIncomingMessage = messages
    ? [...messages]
        .reverse()
        .find((message) => {
          if (message.senderId === user?.id) {
            return false;
          }

          if (!effectiveLastReadAt) {
            return true;
          }

          return (
            new Date(message.createdAt).getTime() >
            new Date(effectiveLastReadAt).getTime()
          );
        })
    : null;

  // Acknowledge only the newest unseen inbound message while the thread is visible.
  useEffect(() => {
    if (
      !conversationId ||
      !isTabVisible ||
      !latestUnreadIncomingMessage ||
      !conversationData ||
      (pendingReadMessageIdRef.current?.conversationId === conversationId &&
        pendingReadMessageIdRef.current.messageId ===
          latestUnreadIncomingMessage.id)
    ) {
      return;
    }

    pendingReadMessageIdRef.current = {
      conversationId,
      messageId: latestUnreadIncomingMessage.id,
    };
    markAsRead({
      conversationId,
      latestMessageId: latestUnreadIncomingMessage.id,
    });
  }, [
    conversationData,
    conversationId,
    isTabVisible,
    latestUnreadIncomingMessage,
    markAsRead,
  ]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages && messages.length > 0) {
      if (!hasScrolledToBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        // Use a separate effect to update the state
        Promise.resolve().then(() => setHasScrolledToBottom(true));
      } else {
        // Only auto-scroll if user is near bottom
        const container = messagesEndRef.current?.parentElement;
        if (container) {
          const isNearBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight <
            100;
          if (isNearBottom) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }
        }
      }
    }
  }, [messages, hasScrolledToBottom]);

  const handleSendMessage = async (body: string) => {
    await sendMessage({
      conversationId,
      body,
    });
  };

  if (isLoadingConversation || isLoadingMessages) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversationData) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold">Conversation not found</h3>
        <p className="text-muted-foreground mt-1">
          This conversation may have been deleted.
        </p>
        <Button onClick={() => router.push("/messages")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Messages
        </Button>
      </div>
    );
  }

  // Determine the other party
  const otherParty = isBuyer
    ? conversationData.seller
    : conversationData.buyer;
  const otherPartyName = otherParty?.displayName ?? "Unknown";

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)]">
      {/* Header */}
      <Card elevation="flat" className="p-4 mb-4 border">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/messages")}
              aria-label="Back to messages"
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-lg truncate">
                {conversationData.listing.title}
              </h2>
              <p className="text-sm text-muted-foreground truncate">{otherPartyName}</p>
            </div>
          </div>
          <Link href={`/listings/${conversationData.listing.id}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Listing
            </Button>
          </Link>
        </div>
      </Card>

      {/* Buyer CRM (seller only) */}
      {!isBuyer && conversationData.buyerId && (
        <BuyerCrmPanel buyerId={conversationData.buyerId} compact />
      )}

      {/* Messages container */}
      <Card elevation="flat" className="flex-1 flex flex-col border overflow-hidden">
        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {/* Platform transaction workflow message */}
          <div className="flex items-center gap-2 py-2 mb-2">
            <div className="flex-1 border-t border-muted" />
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
              <Shield className="h-3 w-3" />
              Stripe payment &middot; tracked shipping &middot; dispute reporting
            </span>
            <div className="flex-1 border-t border-muted" />
          </div>

          {!messages || messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {messages.map((message, index) => {
                const isCurrentUser = message.senderId === user?.id;
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const showSenderInfo =
                  !prevMessage || prevMessage.senderId !== message.senderId;

                return (
                  <ChatBubble
                    key={message.id}
                    message={message.body}
                    senderName={message.sender.displayName}
                    timestamp={message.createdAt}
                    isCurrentUser={isCurrentUser}
                    showSenderInfo={showSenderInfo}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Message input */}
        <div className="border-t p-4 bg-background">
          <MessageInput
            onSendMessage={handleSendMessage}
            placeholder={`Message ${otherPartyName}...`}
          />
          <p className="text-xs text-muted-foreground text-center mt-2">
            Keep transactions on PlankMarket for Stripe-processed payments, tracked shipping, and in-platform dispute reporting.
          </p>
        </div>
      </Card>
    </div>
  );
}
