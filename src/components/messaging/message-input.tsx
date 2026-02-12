"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function MessageInput({
  onSendMessage,
  disabled = false,
  placeholder = "Type your message...",
  className,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(trimmedMessage);
      setMessage("");
    } catch (error) {
      // Error handling is done by the parent component
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (Shift+Enter for newline)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = message.trim().length > 0 && !isSending && !disabled;

  return (
    <div className={cn("flex gap-2 items-end", className)}>
      <Textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isSending}
        maxLength={2000}
        rows={1}
        className="min-h-[40px] max-h-[200px] resize-none"
        aria-label="Message input"
      />
      <Button
        onClick={handleSend}
        disabled={!canSend}
        size="icon"
        className="h-10 w-10 shrink-0"
        aria-label="Send message"
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
