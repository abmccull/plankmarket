"use client";

import Link from "next/link";
import { useId } from "react";
import type { ComponentType, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatePanelTone = "empty" | "error" | "info";

interface LinkAction {
  label: string;
  href: string;
  onClick?: never;
  disabled?: never;
}

interface ButtonAction {
  label: string;
  onClick: () => void;
  href?: never;
  disabled?: boolean;
}

export type StatePanelAction = LinkAction | ButtonAction;

export interface StatePanelProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone?: StatePanelTone;
  primaryAction?: StatePanelAction;
  secondaryAction?: StatePanelAction;
  detail?: ReactNode;
  className?: string;
}

const toneStyles: Record<
  StatePanelTone,
  { panel: string; icon: string; iconBackground: string }
> = {
  empty: {
    panel: "border-border bg-card",
    icon: "text-muted-foreground",
    iconBackground: "bg-muted",
  },
  error: {
    panel: "border-destructive/30 bg-destructive/[0.03]",
    icon: "text-destructive",
    iconBackground: "bg-destructive/10",
  },
  info: {
    panel: "border-primary/25 bg-primary/[0.03]",
    icon: "text-primary",
    iconBackground: "bg-primary/10",
  },
};

function StateAction({
  action,
  variant,
}: {
  action: StatePanelAction;
  variant: "default" | "outline";
}) {
  if ("href" in action && action.href) {
    return (
      <Button asChild variant={variant}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.label}
    </Button>
  );
}

export function StatePanel({
  icon: Icon,
  title,
  description,
  tone = "empty",
  primaryAction,
  secondaryAction,
  detail,
  className,
}: StatePanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const styles = toneStyles[tone];

  return (
    <section
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "flex min-h-64 flex-col items-center justify-center rounded-xl border px-5 py-10 text-center shadow-sm",
        styles.panel,
        className,
      )}
    >
      <div className={cn("mb-4 rounded-full p-3", styles.iconBackground)}>
        <Icon className={cn("h-6 w-6", styles.icon)} aria-hidden="true" />
      </div>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p
        id={descriptionId}
        className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground"
      >
        {description}
      </p>
      {detail ? (
        <div className="mt-3 text-sm text-muted-foreground">{detail}</div>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-5 flex w-full flex-col-reverse justify-center gap-2 sm:w-auto sm:flex-row">
          {secondaryAction ? (
            <StateAction action={secondaryAction} variant="outline" />
          ) : null}
          {primaryAction ? (
            <StateAction action={primaryAction} variant="default" />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function QueryErrorState({
  title = "We couldn't load this page",
  description = "Check your connection and try again. Your account data has not been changed.",
  onRetry,
  isRetrying = false,
  secondaryAction,
  className,
}: {
  title?: string;
  description?: string;
  onRetry: () => void;
  isRetrying?: boolean;
  secondaryAction?: StatePanelAction;
  className?: string;
}) {
  return (
    <StatePanel
      icon={AlertCircle}
      title={title}
      description={description}
      tone="error"
      primaryAction={{
        label: isRetrying ? "Trying again..." : "Try again",
        onClick: onRetry,
        disabled: isRetrying,
      }}
      secondaryAction={secondaryAction}
      className={className}
    />
  );
}

export function StatePanelLoading({
  label,
  rows = 3,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn("space-y-3", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-24 items-center gap-4 rounded-xl border bg-card p-4"
          aria-hidden="true"
        >
          <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32 max-w-full" />
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}
