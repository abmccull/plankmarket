"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

interface VerificationUser {
  id: string;
  name: string;
  email: string;
  businessName: string | null;
  verificationDocUrl: string | null;
  verificationRequestedAt: Date | string | null;
  verificationStatus: string;
}

export default function AdminVerificationsPage() {
  const { data: verifications, isLoading, refetch } =
    trpc.admin.getPendingVerifications.useQuery();
  const updateVerification = trpc.admin.updateVerification.useMutation();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    userId: string | null;
    action: "approve" | "reject" | null;
  }>({ open: false, userId: null, action: null });

  const handleVerificationAction = async (
    userId: string,
    action: "approve" | "reject"
  ) => {
    setConfirmDialog({ open: true, userId, action });
  };

  const confirmAction = async () => {
    if (!confirmDialog.userId || !confirmDialog.action) return;

    try {
      await updateVerification.mutateAsync({
        userId: confirmDialog.userId,
        status: confirmDialog.action === "approve" ? "verified" : "rejected",
      });
      toast.success(
        `Verification ${confirmDialog.action === "approve" ? "approved" : "rejected"}`
      );
      refetch();
      setConfirmDialog({ open: false, userId: null, action: null });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update verification";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Verification Queue</h1>
        <p className="text-muted-foreground mt-1">
          Review and approve seller verification requests
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : verifications && verifications.length > 0 ? (
        <div className="space-y-4">
          {verifications.map((user: VerificationUser) => (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {user.businessName || user.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {user.name} ({user.email})
                    </p>
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {user.verificationDocUrl && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Submitted Documents
                    </h4>
                    <a
                      href={user.verificationDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      View Document
                    </a>
                  </div>
                )}

                {user.verificationRequestedAt && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Requested on {formatDate(user.verificationRequestedAt)}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleVerificationAction(user.id, "approve")}
                    className="flex-1"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleVerificationAction(user.id, "reject")}
                    className="flex-1"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">All caught up</h3>
            <p className="text-muted-foreground mt-1">
              No pending verification requests
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          !open &&
          setConfirmDialog({ open: false, userId: null, action: null })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === "approve"
                ? "Approve Verification"
                : "Reject Verification"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.action === "approve"
                ? "This will mark the user as verified and allow them to list products."
                : "This will reject the verification request. The user will be notified."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog({ open: false, userId: null, action: null })
              }
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmDialog.action === "approve" ? "default" : "destructive"
              }
              onClick={confirmAction}
            >
              {confirmDialog.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
