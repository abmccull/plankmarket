"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ChatBubble } from "@/components/messaging/chat-bubble";
import { MessageInput } from "@/components/messaging/message-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, ExternalLink } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { toast } from "sonner";

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const conversationId = params.conversationId as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  // Get conversation details (includes listing, buyer, seller info)
  const { data: conversationData, isLoading: isLoadingConversation } =
    trpc.message.getMyConversations.useQuery(
      {
        page: 1,
        limit: 100,
      },
      {
        select: (data) =>
          data.conversations.find((c) => c.id === conversationId),
      }
    );

  // Get messages with polling every 5 seconds
  const { data: messages, isLoading: isLoadingMessages } =
    trpc.message.getMessages.useQuery(
      {
        conversationId,
        limit: 100,
      },
      {
        refetchInterval: 5000, // Poll for new messages every 5 seconds
        enabled: !!conversationId,
      }
    );

  // Mark as read mutation
  const { mutate: markAsRead } = trpc.message.markAsRead.useMutation();

  // Send message mutation
  const utils = trpc.useUtils();
  const { mutateAsync: sendMessage } = trpc.message.sendMessage.useMutation({
    onSuccess: () => {
      // Invalidate messages to refetch
      utils.message.getMessages.invalidate({ conversationId });
      utils.message.getMyConversations.invalidate();
      utils.message.getUnreadCount.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send message");
    },
  });

  // Mark conversation as read when opened
  useEffect(() => {
    if (conversationId) {
      markAsRead({ conversationId });
    }
  }, [conversationId, markAsRead]);

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
  const isBuyer = conversationData.buyerId === user?.id;
  const otherParty = isBuyer
    ? conversationData.seller
    : conversationData.buyer;
  const otherPartyName =
    otherParty?.businessName || otherParty?.name || "Unknown";

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <Card elevation="flat" className="p-4 mb-4 border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/messages")}
              aria-label="Back to messages"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="font-semibold text-lg">
                {conversationData.listing.title}
              </h2>
              <p className="text-sm text-muted-foreground">{otherPartyName}</p>
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

      {/* Messages container */}
      <Card elevation="flat" className="flex-1 flex flex-col border overflow-hidden">
        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
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
                    senderName={message.sender.name}
                    senderAvatar={message.sender.avatarUrl}
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
        </div>
      </Card>
    </div>
  );
}
