"use client";

import { useState, useRef, useEffect, useId, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSendMessage: (message: string) => Promise<void>;
  onRefreshMessages?: () => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function MessageInput({
  onSendMessage,
  onRefreshMessages,
  disabled = false,
  placeholder = "Type your message...",
  className,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sendUnconfirmed, setSendUnconfirmed] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [policyRejected, setPolicyRejected] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const restoreFocusRef = useRef(false);
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);
  useEffect(() => {
    if (isSending || !restoreFocusRef.current) return;
    const frame = requestAnimationFrame(() => {
      restoreFocusRef.current = false;
      const active = document.activeElement;
      if (
        active === document.body ||
        active === buttonRef.current ||
        active === textareaRef.current
      )
        textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isSending]);

  const handleSend = async () => {
    const body = message.trim();
    if (
      !body ||
      disabled ||
      sendingRef.current ||
      needsReconciliation ||
      isRefreshing
    )
      return;
    sendingRef.current = true;
    restoreFocusRef.current =
      document.activeElement === textareaRef.current ||
      document.activeElement === buttonRef.current;
    setIsSending(true);
    try {
      await onSendMessage(body);
      if (mountedRef.current) {
        setMessage("");
        setSendUnconfirmed(false);
        setPolicyRejected(false);
        setNeedsReconciliation(false);
      }
    } catch (error) {
      if (mountedRef.current) {
        const known = error as { data?: { code?: string }; message?: string };
        const rejected =
          known?.data?.code === "BAD_REQUEST" &&
          /contact|identifying|email|phone|website|business information/i.test(
            known.message ?? "",
          );
        setPolicyRejected(rejected);
        setSendUnconfirmed(true);
        setNeedsReconciliation(!rejected && Boolean(onRefreshMessages));
        setRefreshFailed(false);
      }
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setIsSending(false);
    }
  };
  const refreshMessages = async () => {
    if (!onRefreshMessages || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshFailed(false);
    try {
      await onRefreshMessages();
      if (mountedRef.current) setNeedsReconciliation(false);
    } catch {
      if (mountedRef.current) setRefreshFailed(true);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };
  const canSend =
    message.trim().length > 0 &&
    !isSending &&
    !disabled &&
    !needsReconciliation &&
    !isRefreshing;
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex min-w-0 items-end gap-[min(0.5rem,8px)]">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isSending}
          maxLength={2000}
          rows={1}
          className="min-h-11 min-w-0 max-h-[200px] resize-none px-[min(0.75rem,12px)]"
          aria-label="Message input"
          aria-describedby={sendUnconfirmed ? `${hintId} ${errorId}` : hintId}
        />
        <Button
          ref={buttonRef}
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          size="icon"
          className="h-[44px] w-[44px] shrink-0"
          aria-label="Send message"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        Enter to send. Shift+Enter for a new line. {message.length}/2000
        characters.
      </p>
      {sendUnconfirmed && (
        <div
          id={errorId}
          role="alert"
          className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm"
        >
          <p className="font-semibold">
            {policyRejected ? "Update your message" : "Message not confirmed"}
          </p>
          <p>
            Your draft is still here.{" "}
            {policyRejected
              ? "Remove contact or identifying business information, then try again. Keep communication on PlankMarket."
              : needsReconciliation
                ? "Refresh the latest messages before trying again."
                : "Check the latest messages. If this message appears there, do not send it again."}
          </p>
          {refreshFailed && (
            <p>
              Latest messages could not be refreshed. Try refreshing again when
              your connection is available.
            </p>
          )}
          {onRefreshMessages && !policyRejected && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshMessages()}
              disabled={isRefreshing || disabled}
              className="h-auto min-h-11 max-w-full whitespace-normal px-3 py-2"
            >
              {isRefreshing
                ? "Refreshing messages..."
                : "Refresh latest messages"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
