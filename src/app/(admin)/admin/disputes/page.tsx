"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { DataTable, DataTableColumnHeader } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface DisputeRow {
  id: string;
  reason: string;
  status: string;
  createdAt: Date | string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    paymentStatus: string | null;
  };
  initiator: {
    id: string;
    name: string;
    businessName: string | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  under_review: "Under Review",
  resolved_buyer: "Resolved (Buyer)",
  resolved_seller: "Resolved (Seller)",
  closed: "Closed",
};

function DisputeStatusBadge({ status }: { status: string }) {
  const variant =
    status === "open"
      ? "destructive"
      : status === "under_review"
        ? "warning"
        : status === "resolved_buyer" || status === "resolved_seller"
          ? "success"
          : "secondary";

  return <Badge variant={variant as "default" | "destructive" | "secondary" | "outline"}>{STATUS_LABELS[status] || status}</Badge>;
}

export default function AdminDisputesPage() {
  const { data: disputesData, isLoading } = trpc.dispute.getAllDisputes.useQuery({
    page: 1,
    limit: 50,
  });
  const utils = trpc.useUtils();

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<DisputeRow | null>(null);
  const [resolution, setResolution] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [refundAmountCents, setRefundAmountCents] = useState("");

  const resolveMutation = trpc.dispute.resolve.useMutation({
    onSuccess: () => {
      toast.success("Dispute resolved successfully");
      utils.dispute.getAllDisputes.invalidate();
      setResolveDialogOpen(false);
      setResolution("");
      setOutcome("");
      setRefundAmountCents("");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });

  const columns: ColumnDef<DisputeRow>[] = [
    {
      accessorKey: "order.orderNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order #" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.order.orderNumber}
        </span>
      ),
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[200px] block">
          {row.original.reason}
        </span>
      ),
    },
    {
      accessorKey: "initiator",
      header: "Initiated By",
      cell: ({ row }) =>
        row.original.initiator.businessName || row.original.initiator.name,
    },
    {
      accessorKey: "order.totalPrice",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order Amount" />
      ),
      cell: ({ row }) => formatCurrency(row.original.order.totalPrice),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <DisputeStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const isResolved = ["resolved_buyer", "resolved_seller", "closed"].includes(
          row.original.status
        );
        if (isResolved) return null;

        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedDispute(row.original);
              setRefundAmountCents(
                (Math.round(row.original.order.totalPrice * 100)).toString()
              );
              setResolveDialogOpen(true);
            }}
          >
            Resolve
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dispute Management</h1>
        <p className="text-muted-foreground mt-1">
          Review and resolve buyer/seller disputes
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : disputesData?.disputes.length ? (
        <DataTable columns={columns} data={disputesData.disputes} />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No disputes found</p>
        </div>
      )}

      {/* Resolve Dispute Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Resolve dispute for order {selectedDispute?.order.orderNumber}.
              {selectedDispute?.order.paymentStatus === "succeeded" &&
                " Selecting 'Resolved (Buyer)' will trigger a refund."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved_buyer">
                    Resolved - Buyer (refund issued)
                  </SelectItem>
                  <SelectItem value="resolved_seller">
                    Resolved - Seller (no refund)
                  </SelectItem>
                  <SelectItem value="closed">Closed (no action)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {outcome === "resolved_buyer" &&
              selectedDispute?.order.paymentStatus === "succeeded" && (
                <div className="space-y-2">
                  <Label htmlFor="disputeRefundAmount">Refund Amount (cents)</Label>
                  <Input
                    id="disputeRefundAmount"
                    type="number"
                    value={refundAmountCents}
                    onChange={(e) => setRefundAmountCents(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {refundAmountCents
                      ? `$${(parseInt(refundAmountCents) / 100).toFixed(2)}`
                      : "Enter amount in cents"}
                  </p>
                </div>
              )}

            <div className="space-y-2">
              <Label htmlFor="disputeResolution">Resolution Details</Label>
              <Textarea
                id="disputeResolution"
                placeholder="Describe the resolution (min 10 characters)"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResolveDialogOpen(false);
                setResolution("");
                setOutcome("");
                setRefundAmountCents("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !outcome ||
                resolution.length < 10 ||
                resolveMutation.isPending
              }
              onClick={() => {
                if (selectedDispute && outcome) {
                  resolveMutation.mutate({
                    disputeId: selectedDispute.id,
                    resolution,
                    outcome: outcome as "resolved_buyer" | "resolved_seller" | "closed",
                    ...(outcome === "resolved_buyer" && refundAmountCents
                      ? { refundAmountCents: parseInt(refundAmountCents) }
                      : {}),
                  });
                }
              }}
            >
              {resolveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Resolve Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
