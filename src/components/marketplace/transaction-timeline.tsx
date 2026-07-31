import {
  AlertTriangle,
  Check,
  Circle,
  CircleStop,
  Clock3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import {
  getTransactionMilestones,
  type MilestoneState,
  type TransactionAudience,
  type TransactionMilestone,
  type TransactionOrderState,
} from "@/lib/marketplace/transaction-milestones";

const EXPLAINER_MILESTONES: TransactionMilestone[] = [
  {
    id: "payment",
    title: "Stripe processes the platform charge",
    description:
      "The buyer sees inventory, marketplace fees, and the selected freight quote before confirming payment.",
    state: "upcoming",
    date: null,
  },
  {
    id: "freight",
    title: "PlankMarket books the selected freight quote",
    description:
      "The booking uses the checkout quote and the seller's saved pickup details; order status records the carrier workflow.",
    state: "upcoming",
    date: null,
  },
  {
    id: "pickup",
    title: "The carrier confirms pickup",
    description:
      "Tracked pickup evidence starts the configured seller-transfer delay and appears in the order timeline.",
    state: "upcoming",
    date: null,
  },
  {
    id: "transfer",
    title: "PlankMarket initiates a separate seller transfer",
    description:
      "After the configured post-pickup delay, PlankMarket rechecks payment, refund, shipment, and dispute state before initiating a Stripe Connect transfer.",
    state: "upcoming",
    date: null,
  },
  {
    id: "delivery",
    title: "Delivery and issue reporting stay on the order",
    description:
      "The buyer inspects the freight, notes visible damage on the delivery receipt, and reports damage or shortages through PlankMarket with evidence under the reporting terms.",
    state: "upcoming",
    date: null,
  },
];

const stateLabel: Record<MilestoneState, string> = {
  complete: "Complete",
  current: "In progress",
  upcoming: "Next",
  attention: "Needs attention",
  stopped: "Not continuing",
};

const stateStyles: Record<MilestoneState, string> = {
  complete: "border-emerald-500 bg-emerald-500 text-white",
  current: "border-primary bg-primary text-primary-foreground",
  upcoming: "border-border bg-background text-muted-foreground",
  attention: "border-amber-500 bg-amber-500 text-white",
  stopped: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

function MilestoneIcon({ state }: { state: MilestoneState }) {
  if (state === "complete") return <Check className="h-4 w-4" />;
  if (state === "current") return <Clock3 className="h-4 w-4" />;
  if (state === "attention") return <AlertTriangle className="h-4 w-4" />;
  if (state === "stopped") return <CircleStop className="h-4 w-4" />;
  return <Circle className="h-3 w-3" />;
}
function MilestoneList({
  milestones,
  showState,
}: {
  milestones: TransactionMilestone[];
  showState: boolean;
}) {
  return (
    <ol className="space-y-0" aria-label="Transaction milestones">
      {milestones.map((milestone, index) => (
        <li key={milestone.id} className="relative grid grid-cols-[2rem_1fr] gap-3 pb-6 last:pb-0">
          {index < milestones.length - 1 && (
            <div
              className="absolute left-[0.9375rem] top-8 h-[calc(100%-1rem)] w-px bg-border"
              aria-hidden="true"
            />
          )}
          <div
            className={cn(
              "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
              stateStyles[milestone.state],
            )}
            aria-hidden="true"
          >
            <MilestoneIcon state={milestone.state} />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{milestone.title}</h3>
              {showState && (
                <Badge variant="outline" className="text-[11px]">
                  {stateLabel[milestone.state]}
                </Badge>
              )}
              {milestone.date && (
                <time className="text-xs text-muted-foreground">
                  {formatDate(milestone.date)}
                </time>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {milestone.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TransactionTimeline({
  order,
  audience,
}: {
  order: TransactionOrderState;
  audience: TransactionAudience;
}) {
  const milestones = getTransactionMilestones(order, audience);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Transaction milestones</CardTitle>
        <p className="text-sm text-muted-foreground">
          Status comes from the recorded payment, freight, transfer, delivery,
          and dispute fields for this order.
        </p>
      </CardHeader>
      <CardContent>
        <MilestoneList milestones={milestones} showState />
      </CardContent>
    </Card>
  );
}

export function TransactionTimelineExplainer() {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <MilestoneList milestones={EXPLAINER_MILESTONES} showState={false} />
      <p className="mt-6 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        PlankMarket is a marketplace, not a regulated escrow service or
        fiduciary. Payment processing, carrier service, bank availability, and
        dispute outcomes are provided or determined by the applicable third
        parties and transaction terms.
      </p>
    </div>
  );
}
