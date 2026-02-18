"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Shield } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function ModerationPage() {
  const [filter, setFilter] = useState<"unreviewed" | "reviewed" | "all">("unreviewed");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.admin.getContentViolations.useQuery({
    reviewed: filter === "all" ? undefined : filter === "reviewed",
    page,
    limit: 20,
  });

  const reviewMutation = trpc.admin.reviewContentViolation.useMutation({
    onSuccess: () => {
      toast.success("Violation reviewed");
      refetch();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Content Moderation
          </h1>
          <p className="text-muted-foreground mt-1">
            Review flagged content violations
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unreviewed">Unreviewed</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !data?.violations.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No violations found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.violations.map((violation) => (
            <ViolationCard
              key={violation.id}
              violation={violation}
              onReview={(falsePositive, notes) => {
                reviewMutation.mutate({
                  violationId: violation.id,
                  falsePositive,
                  adminNotes: notes,
                });
              }}
              isReviewing={reviewMutation.isPending}
            />
          ))}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-3">
                Page {page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ViolationCard({
  violation,
  onReview,
  isReviewing,
}: {
  violation: {
    id: string;
    contentType: string;
    contentBody: string;
    detections: unknown;
    reviewed: boolean;
    falsePositive: boolean;
    adminNotes: string | null;
    createdAt: Date;
    user: {
      id: string;
      name: string;
      email: string;
      businessName: string | null;
      role: string;
    };
  };
  onReview: (falsePositive: boolean, notes?: string) => void;
  isReviewing: boolean;
}) {
  const [notes, setNotes] = useState("");
  const detections = violation.detections as Array<{ type: string; match: string; level: string }>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">
              {violation.user.businessName || violation.user.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {violation.user.email} &middot; {violation.user.role} &middot;{" "}
              {formatDistanceToNow(new Date(violation.createdAt), { addSuffix: true })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{violation.contentType}</Badge>
            {violation.reviewed ? (
              violation.falsePositive ? (
                <Badge className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  False Positive
                </Badge>
              ) : (
                <Badge className="bg-red-50 text-red-700 border-red-200">
                  <XCircle className="h-3 w-3 mr-1" />
                  Confirmed
                </Badge>
              )
            ) : (
              <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Pending Review
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Flagged content */}
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="whitespace-pre-wrap">{violation.contentBody}</p>
        </div>

        {/* Detections */}
        <div className="flex flex-wrap gap-2">
          {detections.map((d, i) => (
            <Badge key={i} variant="destructive" className="text-xs">
              {d.type}: {d.match}
            </Badge>
          ))}
        </div>

        {/* Admin notes (if reviewed) */}
        {violation.reviewed && violation.adminNotes && (
          <div className="rounded-md border-l-2 border-primary bg-muted/30 p-3 text-sm">
            <p className="text-xs font-medium mb-1">Admin Notes</p>
            <p className="text-muted-foreground">{violation.adminNotes}</p>
          </div>
        )}

        {/* Review actions */}
        {!violation.reviewed && (
          <div className="pt-2 border-t space-y-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Admin notes (optional)"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReview(true, notes || undefined)}
                disabled={isReviewing}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                False Positive
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onReview(false, notes || undefined)}
                disabled={isReviewing}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Confirm Violation
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
