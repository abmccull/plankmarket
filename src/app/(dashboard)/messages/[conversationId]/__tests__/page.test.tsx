import type { ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConversationPage from "@/app/(dashboard)/messages/[conversationId]/page";
import { trpc } from "@/lib/trpc/client";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();
const invalidateGetMessages = vi.fn();
const invalidateGetConversation = vi.fn();
const invalidateGetMyConversations = vi.fn();
const invalidateGetUnreadCount = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    message: {
      getConversation: { useQuery: vi.fn() },
      getMessages: { useQuery: vi.fn() },
      markAsRead: { useMutation: vi.fn() },
      sendMessage: { useMutation: vi.fn() },
    },
    useUtils: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/messaging/chat-bubble", () => ({
  ChatBubble: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/components/messaging/message-input", () => ({
  MessageInput: () => <div>Message input</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/crm/buyer-crm-panel", () => ({
  BuyerCrmPanel: () => <div>Buyer CRM</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

function setupQueries(options?: {
  lastReadAt?: Date | null;
  messages?: Array<{
    id: string;
    senderId: string;
    body: string;
    createdAt: Date;
    sender: {
      displayName: string;
    };
  }>;
}) {
  vi.mocked(useParams).mockReturnValue({
    conversationId: "conversation-123",
  } as ReturnType<typeof useParams>);
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(useAuthStore).mockReturnValue({
    user: { id: "buyer-123" },
  } as ReturnType<typeof useAuthStore>);

  vi.mocked(trpc.useUtils).mockReturnValue({
    message: {
      getMessages: { invalidate: invalidateGetMessages },
      getConversation: { invalidate: invalidateGetConversation },
      getMyConversations: { invalidate: invalidateGetMyConversations },
      getUnreadCount: { invalidate: invalidateGetUnreadCount },
    },
  } as unknown as ReturnType<typeof trpc.useUtils>);

  vi.mocked(trpc.message.getConversation.useQuery).mockReturnValue({
    data: {
      id: "conversation-123",
      listingId: "listing-123",
      buyerId: "buyer-123",
      sellerId: "seller-123",
      buyerLastReadAt: options?.lastReadAt ?? null,
      sellerLastReadAt: null,
      createdAt: new Date("2026-07-31T09:00:00.000Z"),
      lastMessageAt: new Date("2026-07-31T09:05:00.000Z"),
      listing: {
        id: "listing-123",
        title: "Premium Oak Flooring",
        media: [],
      },
      buyer: {
        id: "buyer-123",
        displayName: "Buyer",
      },
      seller: {
        id: "seller-123",
        displayName: "Seller",
      },
      messages: [],
    },
    isLoading: false,
  } as unknown as ReturnType<typeof trpc.message.getConversation.useQuery>);

  vi.mocked(trpc.message.getMessages.useQuery).mockReturnValue({
    data: options?.messages ?? [],
    isLoading: false,
  } as unknown as ReturnType<typeof trpc.message.getMessages.useQuery>);

  vi.mocked(trpc.message.markAsRead.useMutation).mockReturnValue({
    mutate: mockMutate,
  } as unknown as ReturnType<typeof trpc.message.markAsRead.useMutation>);

  vi.mocked(trpc.message.sendMessage.useMutation).mockReturnValue({
    mutateAsync: mockMutateAsync,
  } as unknown as ReturnType<typeof trpc.message.sendMessage.useMutation>);
}

describe("ConversationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("acknowledges only the newest unseen inbound message", async () => {
    setupQueries({
      lastReadAt: null,
      messages: [
        {
          id: "message-1",
          senderId: "seller-123",
          body: "Still available?",
          createdAt: new Date("2026-07-31T09:01:00.000Z"),
          sender: { displayName: "Seller" },
        },
        {
          id: "message-2",
          senderId: "buyer-123",
          body: "Yes, I'm interested.",
          createdAt: new Date("2026-07-31T09:02:00.000Z"),
          sender: { displayName: "Buyer" },
        },
      ],
    });

    render(<ConversationPage />);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        conversationId: "conversation-123",
        latestMessageId: "message-1",
      });
    });
  });

  it("does not acknowledge when there are no unseen inbound messages", async () => {
    setupQueries({
      lastReadAt: new Date("2026-07-31T09:10:00.000Z"),
      messages: [
        {
          id: "message-2",
          senderId: "buyer-123",
          body: "Following up",
          createdAt: new Date("2026-07-31T09:02:00.000Z"),
          sender: { displayName: "Buyer" },
        },
      ],
    });

    render(<ConversationPage />);

    await waitFor(() => {
      expect(trpc.message.getMessages.useQuery).toHaveBeenCalled();
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
