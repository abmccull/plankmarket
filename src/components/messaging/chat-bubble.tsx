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
        "flex gap-2 mb-4",
        isCurrentUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      {showSenderInfo && (
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-semibold">
            {senderName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          "flex flex-col max-w-[70%]",
          isCurrentUser ? "items-end" : "items-start"
        )}
      >
        {showSenderInfo && (
          <span className="text-xs text-muted-foreground mb-1 px-3">
            {senderName}
          </span>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm break-words",
            isCurrentUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          )}
        >
          <p className="whitespace-pre-wrap">{message}</p>
        </div>
        <span className="text-xs text-muted-foreground mt-1 px-3">
          {formatRelativeTime(timestamp)}
        </span>
      </div>
    </div>
  );
}
