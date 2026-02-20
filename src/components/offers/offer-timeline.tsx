"use client";

import { formatRelativeTime, formatCurrency, formatSqFt } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  FileText,
  ArrowLeftRight,
  Check,
  X,
  LogOut,
  Clock,
} from "lucide-react";
import { getAnonymousDisplayName } from "@/lib/identity/display-name";

type OfferEvent = {
  id: string;
  eventType: "initial_offer" | "counter" | "accept" | "reject" | "withdraw" | "expire";
  actor: {
    id: string;
    name: string;
    role: string;
    businessCity: string | null;
    businessState: string | null;
  };
  pricePerSqFt?: number | null;
  quantitySqFt?: number | null;
  totalPrice?: number | null;
  message?: string | null;
  createdAt: Date;
};

interface OfferTimelineProps {
  events: OfferEvent[];
  currentUserId: string;
}

const eventConfig = {
  initial_offer: {
    icon: FileText,
    label: "Initial Offer",
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  counter: {
    icon: ArrowLeftRight,
    label: "Counter Offer",
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  accept: {
    icon: Check,
    label: "Accepted",
    color: "text-green-600 bg-green-50 border-green-200",
  },
  reject: {
    icon: X,
    label: "Rejected",
    color: "text-red-600 bg-red-50 border-red-200",
  },
  withdraw: {
    icon: LogOut,
    label: "Withdrawn",
    color: "text-gray-600 bg-gray-50 border-gray-200",
  },
  expire: {
    icon: Clock,
    label: "Expired",
    color: "text-gray-600 bg-gray-50 border-gray-200",
  },
};

export function OfferTimeline({ events, currentUserId }: OfferTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No events yet
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      {events.map((event, index) => {
        const config = eventConfig[event.eventType];
        const Icon = config.icon;
        const isCurrentUser = event.actor.id === currentUserId;
        const actorName = getAnonymousDisplayName({ role: event.actor.role, businessState: event.actor.businessState, name: event.actor.name, businessCity: event.actor.businessCity });

        return (
          <div key={event.id} className="relative flex gap-4">
            {/* Timeline line */}
            {index < events.length - 1 && (
              <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-border" />
            )}

            {/* Icon */}
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                config.color
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-6">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="font-semibold text-sm">
                    {config.label}
                    {isCurrentUser && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {actorName}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(event.createdAt)}
                </span>
              </div>

              {/* Price details */}
              {event.pricePerSqFt && (
                <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Price per sq ft</span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(event.pricePerSqFt)}/sq ft
                    </span>
                  </div>
                  {event.quantitySqFt && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground">Quantity</span>
                      <span className="font-medium tabular-nums">
                        {formatSqFt(event.quantitySqFt)}
                      </span>
                    </div>
                  )}
                  {event.totalPrice && (
                    <div className="flex items-center justify-between mt-1 pt-1 border-t">
                      <span className="font-medium">Total</span>
                      <span className="font-bold tabular-nums">
                        {formatCurrency(event.totalPrice)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Message */}
              {event.message && (
                <div className="mt-2 rounded-md border bg-background p-3 text-sm">
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {event.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
