import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

interface ChatBubbleProps {
  message: string;
  senderName: string;
  senderAvatar?: string | null;
  timestamp: Date | string;
  isCurrentUser: boolean;
  showSenderInfo?: boolean;
}

export function ChatBubble({
  message,
  senderName,
  timestamp,
  isCurrentUser,
  showSenderInfo = true,
}: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-[min(0.5rem,8px)] mb-4",
        isCurrentUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      {showSenderInfo && (
        <div className="flex-shrink-0">
          <div className="h-[32px] w-[32px] rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-semibold">
            {senderName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          "flex min-w-0 flex-col max-w-full sm:max-w-[70%]",
          isCurrentUser ? "items-end" : "items-start",
        )}
      >
        {showSenderInfo && (
          <span className="text-xs text-muted-foreground mb-1 px-[min(0.75rem,12px)]">
            {senderName}
          </span>
        )}
        <div
          className={cn(
            "max-w-full rounded-2xl px-[min(1rem,16px)] py-2.5 text-sm [overflow-wrap:anywhere]",
            isCurrentUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm",
          )}
        >
          <p className="whitespace-pre-wrap">{message}</p>
        </div>
        <span className="text-xs text-muted-foreground mt-1 px-[min(0.75rem,12px)]">
          {formatRelativeTime(timestamp)}
        </span>
      </div>
    </div>
  );
}
