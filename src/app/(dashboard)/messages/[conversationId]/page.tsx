"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ChatBubble } from "@/components/messaging/chat-bubble";
import { MessageInput } from "@/components/messaging/message-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Shield, MessageSquare } from "lucide-react";
import {
  QueryErrorState,
  StatePanel,
  StatePanelLoading,
} from "@/components/ui/state-panel";
import { useAuthStore } from "@/lib/stores/auth-store";
import { BuyerCrmPanel } from "@/components/crm/buyer-crm-panel";

function mergeMessages<
  T extends { id: string; createdAt: Date | string; historySortKey?: string },
>(...groups: T[][]): T[] {
  return [
    ...new Map(groups.flat().map((message) => [message.id, message])).values(),
  ].sort(
    (a, b) =>
      (a.historySortKey ?? new Date(a.createdAt).toISOString()).localeCompare(
        b.historySortKey ?? new Date(b.createdAt).toISOString(),
      ) || a.id.localeCompare(b.id),
  );
}

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const { user } = useAuthStore();
  return (
    <ConversationThread
      key={`${user?.id ?? "anonymous"}:${params.conversationId}`}
      conversationId={params.conversationId}
    />
  );
}

function ConversationThread({ conversationId }: { conversationId: string }) {
  const { user } = useAuthStore();
  const historyRef = useRef<HTMLDivElement>(null);
  const initialScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [historyExhausted, setHistoryExhausted] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [gapCursors, setGapCursors] = useState<string[]>([]);
  const latestWindowRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingReadMessageIdRef = useRef<{
    conversationId: string;
    messageId: string;
  } | null>(null);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [optimisticLastReadAt, setOptimisticLastReadAt] = useState<{
    conversationId: string;
    readAt: string;
  } | null>(null);

  // Get conversation details (includes listing, buyer, seller info)
  const {
    data: conversationData,
    isLoading: isLoadingConversation,
    isError: isConversationError,
    isFetching: isFetchingConversation,
    refetch: refetchConversation,
  } = trpc.message.getConversation.useQuery(
    { conversationId },
    {
      enabled: !!conversationId,
    },
  );

  // Get messages with visible-tab polling only.
  const {
    data: messages,
    isLoading: isLoadingMessages,
    isError: isMessagesError,
    isFetching: isFetchingMessages,
    refetch: refetchMessages,
  } = trpc.message.getMessages.useQuery(
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

  const [historyMessages, setHistoryMessages] = useState<
    NonNullable<typeof messages>
  >([]);
  const allMessages = useMemo(
    () => mergeMessages(historyMessages, messages ?? []),
    [historyMessages, messages],
  );
  useEffect(() => {
    if (!messages) return;
    const previous = latestWindowRef.current;
    if (
      messages.length === 100 &&
      previous.size > 0 &&
      !messages.some((message) => previous.has(message.id))
    ) {
      const cursor = messages[0].id;
      setGapCursors((current) => [
        cursor,
        ...current.filter((id) => id !== cursor),
      ]);
    }
    latestWindowRef.current = new Set(messages.map((message) => message.id));
    setHistoryMessages((previous) => mergeMessages(previous, messages));
  }, [messages]);

  // Mark as read mutation
  const utils = trpc.useUtils();
  const { mutate: markAsRead } = trpc.message.markAsRead.useMutation({
    onSuccess: (result, variables) => {
      if (result.lastReadAt) {
        setOptimisticLastReadAt({
          conversationId: variables.conversationId,
          readAt: new Date(result.lastReadAt).toISOString(),
        });
      }
      utils.message.getConversation.invalidate({
        conversationId: variables.conversationId,
      });
      utils.message.getMyConversations.invalidate();
      utils.message.getUnreadCount.invalidate();
    },
    onError: () => {
      pendingReadMessageIdRef.current = null;
    },
  });

  // Send message mutation
  const { mutateAsync: sendMessage } = trpc.message.sendMessage.useMutation({
    onSuccess: (_result, variables) => {
      // Invalidate messages to refetch
      utils.message.getMessages.invalidate({
        conversationId: variables.conversationId,
      });
      utils.message.getConversation.invalidate({
        conversationId: variables.conversationId,
      });
      utils.message.getMyConversations.invalidate();
      utils.message.getUnreadCount.invalidate();
    },
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState !== "hidden");
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
    ? [...messages].reverse().find((message) => {
        if (message.senderId === user?.id) {
          return false;
        }

        if (!effectiveLastReadAt) {
          return true;
        }

        return (
          new Date(message.createdAt).getTime() >=
          new Date(effectiveLastReadAt).getTime()
        );
      })
    : null;

  // Acknowledge only the newest unseen inbound message while the thread is visible.
  useEffect(() => {
    if (
      !conversationId ||
      !isTabVisible ||
      isConversationError ||
      isMessagesError ||
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
    isConversationError,
    isMessagesError,
    latestUnreadIncomingMessage,
    markAsRead,
  ]);

  // Scroll only the history region; never drag the whole document or a reader
  // away from older messages when polling returns a new reply.
  useEffect(() => {
    const container = historyRef.current;
    if (!container || allMessages.length === 0 || loadingOlderRef.current)
      return;
    if (!initialScrollRef.current || nearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollRef.current = true;
    }
  }, [allMessages]);

  const loadOlder = async () => {
    const gapCursor = gapCursors[0];
    const cursor = gapCursor ?? allMessages[0]?.id;
    const container = historyRef.current;
    if (!cursor || loadingOlderRef.current || !container) return;
    loadingOlderRef.current = true;
    setIsLoadingOlder(true);
    setOlderError(false);
    const beforeHeight = container.scrollHeight;
    const beforeTop = container.scrollTop;
    const regionTop = container.getBoundingClientRect().top;
    const anchor = [
      ...container.querySelectorAll<HTMLElement>("[data-message-id]"),
    ].find((node) => node.getBoundingClientRect().bottom > regionTop);
    const anchorId = anchor?.dataset.messageId;
    const anchorOffset = anchor
      ? anchor.getBoundingClientRect().top - regionTop
      : null;
    try {
      const older = await utils.message.getMessages.fetch({
        conversationId,
        limit: 100,
        cursor,
      });
      setHistoryMessages((previous) => mergeMessages(previous, older));
      if (gapCursor) {
        const knownIds = new Set(allMessages.map((message) => message.id));
        const reconnected =
          older.length < 100 ||
          older.some((message) => knownIds.has(message.id));
        setGapCursors((current) =>
          reconnected
            ? current.filter((id) => id !== gapCursor)
            : current.map((id) => (id === gapCursor ? older[0].id : id)),
        );
      } else setHistoryExhausted(older.length < 100);
      requestAnimationFrame(() => {
        if (historyRef.current === container) {
          const restoredAnchor = anchorId
            ? [
                ...container.querySelectorAll<HTMLElement>("[data-message-id]"),
              ].find((node) => node.dataset.messageId === anchorId)
            : null;
          if (restoredAnchor && anchorOffset !== null) {
            container.scrollTop +=
              restoredAnchor.getBoundingClientRect().top -
              container.getBoundingClientRect().top -
              anchorOffset;
          } else if (!gapCursor) {
            container.scrollTop =
              beforeTop + container.scrollHeight - beforeHeight;
          }
        }
        loadingOlderRef.current = false;
      });
    } catch {
      setOlderError(true);
      loadingOlderRef.current = false;
    } finally {
      setIsLoadingOlder(false);
    }
  };
  const refreshLatest = async () => {
    const result = await refetchMessages();
    if (result.error) throw result.error;
  };

  const handleSendMessage = async (body: string) => {
    await sendMessage({
      conversationId,
      body,
    });
  };

  if (isLoadingConversation && !conversationData)
    return <StatePanelLoading label="Loading conversation" rows={2} />;
  if (isConversationError && !conversationData)
    return (
      <QueryErrorState
        title="We couldn't load this conversation"
        description="The conversation could not be checked. Try again; this does not mean it was deleted."
        onRetry={() => void refetchConversation()}
        isRetrying={isFetchingConversation}
        secondaryAction={{ label: "Back to messages", href: "/messages" }}
      />
    );
  if (!conversationData)
    return (
      <StatePanel
        icon={MessageSquare}
        title="Conversation unavailable"
        description="This conversation is unavailable to this account. Return to your messages to continue."
        primaryAction={{ label: "Back to messages", href: "/messages" }}
      />
    );

  // Determine the other party
  const otherParty = isBuyer ? conversationData.seller : conversationData.buyer;
  const otherPartyName = otherParty?.displayName ?? "Unknown";

  return (
    <div className="flex min-w-0 flex-col">
      {/* Header */}
      <Card elevation="flat" className="mb-4 border p-[min(1rem,16px)]">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="grid min-w-0 flex-1 basis-64 grid-cols-[44px_minmax(0,1fr)] items-center gap-[min(0.75rem,12px)]">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-[44px] w-[44px] shrink-0"
            >
              <Link href="/messages" aria-label="Back to messages">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-lg break-words">
                {conversationData.listing.title}
              </h1>
              <p className="text-sm text-muted-foreground break-words">
                {otherPartyName}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link href={`/listings/${conversationData.listing.id}`}>
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              View Listing
            </Link>
          </Button>
        </div>
      </Card>

      {/* Buyer CRM (seller only) */}
      {!isBuyer && conversationData.buyerId && (
        <BuyerCrmPanel buyerId={conversationData.buyerId} compact />
      )}

      {isConversationError && (
        <QueryErrorState
          title="We couldn't load this conversation"
          description="The conversation could not be refreshed. Your draft is still here; retry before sending."
          onRetry={() => void refetchConversation()}
          isRetrying={isFetchingConversation}
        />
      )}
      {/* Messages container */}
      <Card
        elevation="flat"
        className="min-w-0 flex flex-col border overflow-hidden"
      >
        {(gapCursors.length > 0 ||
          (!historyExhausted && messages?.length === 100) ||
          olderError) && (
          <div className="px-[min(1rem,16px)] pt-4">
            {gapCursors.length > 0 && (
              <p role="status" className="py-2 text-sm">
                Some messages between loaded sections are missing. Load missing
                messages to fill the gap.
              </p>
            )}
            {!isMessagesError &&
              (gapCursors.length > 0 ||
                (!historyExhausted && messages?.length === 100)) && (
                <Button
                  type="button"
                  variant="outline"
                  className="mb-3 h-auto min-h-11 max-w-full whitespace-normal px-3"
                  disabled={isLoadingOlder}
                  onClick={() => void loadOlder()}
                >
                  {isLoadingOlder
                    ? "Loading older messages..."
                    : gapCursors.length > 0
                      ? "Load missing messages"
                      : "Load older messages"}
                </Button>
              )}
            {olderError && (
              <p role="alert" className="py-2 text-sm text-destructive">
                More messages could not be loaded. Use the history loading
                action to try again.
              </p>
            )}
          </div>
        )}
        {/* Messages list */}
        <div
          ref={historyRef}
          role="region"
          aria-label="Conversation history"
          tabIndex={0}
          className="min-h-[12rem] max-h-[55dvh] min-w-0 overflow-y-auto p-[min(1rem,16px)] space-y-1"
          onScroll={(event) => {
            const node = event.currentTarget;
            nearBottomRef.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 100;
            setShowJumpToLatest(!nearBottomRef.current);
          }}
        >
          {isMessagesError && (
            <QueryErrorState
              title="We couldn't load the message history"
              description="Previously loaded messages may appear below. Your draft is kept here; refresh before sending."
              onRetry={() => void refetchMessages()}
              isRetrying={isFetchingMessages}
            />
          )}
          {isLoadingMessages && (
            <StatePanelLoading label="Loading message history" rows={2} />
          )}
          {/* Platform transaction workflow message */}
          <div className="flex items-center gap-[min(0.5rem,8px)] py-2 mb-2">
            <div className="hidden sm:block flex-1 border-t border-muted" />
            <span className="min-w-0 text-center text-xs text-muted-foreground">
              <Shield className="inline-block h-[12px] w-[12px] mr-[6px]" aria-hidden="true" />
              Stripe payment &middot; tracked shipping &middot; dispute
              reporting
            </span>
            <div className="hidden sm:block flex-1 border-t border-muted" />
          </div>

          {!isLoadingMessages &&
          !isMessagesError &&
          allMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {allMessages.map((message, index) => {
                const isCurrentUser = message.senderId === user?.id;
                const prevMessage = index > 0 ? allMessages[index - 1] : null;
                const showSenderInfo =
                  !prevMessage || prevMessage.senderId !== message.senderId;

                return (
                  <div key={message.id} data-message-id={message.id}>
                    <ChatBubble
                      message={message.body}
                      senderName={message.sender.displayName}
                      timestamp={message.createdAt}
                      isCurrentUser={isCurrentUser}
                      showSenderInfo={showSenderInfo}
                    />
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {showJumpToLatest && (
          <Button
            type="button"
            variant="outline"
            className="m-2 h-auto min-h-11 whitespace-normal"
            onClick={() => {
              const node = historyRef.current;
              if (node) node.scrollTop = node.scrollHeight;
            }}
          >
            Jump to latest
          </Button>
        )}
        {/* Message input */}
        <div className="border-t p-[min(1rem,16px)] bg-background">
          <MessageInput
            onSendMessage={handleSendMessage}
            onRefreshMessages={refreshLatest}
            disabled={
              isConversationError || isMessagesError || isLoadingMessages
            }
            placeholder={`Message ${otherPartyName}...`}
          />
          <p className="text-xs text-muted-foreground text-center mt-2">
            Keep transactions on PlankMarket for Stripe-processed payments,
            tracked shipping, and in-platform dispute reporting.
          </p>
        </div>
      </Card>
    </div>
  );
}
