"use client";

import { trpc } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Truck, FileText, MapPin, Clock, ExternalLink } from "lucide-react";

interface TrackingTimelineProps {
  orderId: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending Pickup",
    variant: "warning" as const,
    color: "bg-yellow-500",
  },
  dispatched: {
    label: "Dispatched",
    variant: "default" as const,
    color: "bg-blue-500",
  },
  in_transit: {
    label: "In Transit",
    variant: "default" as const,
    color: "bg-blue-500",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    variant: "default" as const,
    color: "bg-blue-500",
  },
  delivered: {
    label: "Delivered",
    variant: "success" as const,
    color: "bg-green-500",
  },
  exception: {
    label: "Exception",
    variant: "destructive" as const,
    color: "bg-red-500",
  },
  cancelled: {
    label: "Cancelled",
    variant: "secondary" as const,
    color: "bg-gray-500",
  },
} as const;

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TrackingTimeline({ orderId }: TrackingTimelineProps) {
  const { data: shipment, isLoading } = trpc.shipping.getTracking.useQuery(
    { orderId },
    {
      refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
    }
  );

  // Don't render anything if there's no shipment data
  if (!shipment && !isLoading) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" aria-hidden="true" />
            Shipment Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading tracking information...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!shipment) {
    return null;
  }

  const statusConfig = STATUS_CONFIG[shipment.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const events = shipment.trackingEvents ?? [];
  const sortedEvents = [...events].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" aria-hidden="true" />
          Shipment Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Status:
            </span>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>

          {shipment.carrierName && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-muted-foreground">
                Carrier:
              </span>
              <span>{shipment.carrierName}</span>
            </div>
          )}

          {shipment.proNumber && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-muted-foreground">
                PRO Number:
              </span>
              <span className="font-mono">{shipment.proNumber}</span>
            </div>
          )}
        </div>

        {/* Document Links Section */}
        {(shipment.bolUrl || shipment.deliveryReceiptUrl) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Documents</h3>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                {shipment.bolUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    asChild
                  >
                    <a
                      href={shipment.bolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      Bill of Lading
                      <ExternalLink
                        className="ml-2 h-3 w-3"
                        aria-hidden="true"
                      />
                    </a>
                  </Button>
                )}
                {shipment.deliveryReceiptUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    asChild
                  >
                    <a
                      href={shipment.deliveryReceiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      Delivery Receipt
                      <ExternalLink
                        className="ml-2 h-3 w-3"
                        aria-hidden="true"
                      />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Timeline Section */}
        {sortedEvents.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Tracking History</h3>
              <div className="relative space-y-4">
                {/* Vertical timeline line */}
                <div
                  className="absolute left-[7px] top-2 h-[calc(100%-2rem)] w-px bg-border"
                  aria-hidden="true"
                />

                {sortedEvents.map((event, index) => {
                  const isLatest = index === 0;
                  const eventStatus = STATUS_CONFIG[event.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;

                  return (
                    <div key={`${event.timestamp}-${index}`} className="relative pl-8">
                      {/* Timeline dot */}
                      <div
                        className={`absolute left-0 top-1 ${
                          isLatest ? "h-4 w-4" : "h-3 w-3"
                        } rounded-full border-2 border-background ${
                          isLatest ? eventStatus.color : "bg-muted"
                        }`}
                        aria-hidden="true"
                      />

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              isLatest ? eventStatus.variant : "secondary"
                            }
                            className="text-xs"
                          >
                            {eventStatus.label}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            <time dateTime={event.timestamp}>
                              {formatTimestamp(event.timestamp)}
                            </time>
                          </div>
                        </div>

                        {event.location && (
                          <div className="flex items-start gap-1 text-sm">
                            <MapPin
                              className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="text-muted-foreground">
                              {event.location}
                            </span>
                          </div>
                        )}

                        {event.description && (
                          <p className="text-sm">{event.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
