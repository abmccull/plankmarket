"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Building2,
  Shield,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface VerificationUser {
  id: string;
  name: string;
  email: string;
  role: "buyer" | "seller" | "admin";
  businessName: string | null;
  businessWebsite: string | null;
  businessAddress: string | null;
  businessCity: string | null;
  businessState: string | null;
  businessZip: string | null;
  einTaxId: string | null;
  verificationDocUrl: string | null;
  verificationRequestedAt: Date | string | null;
  verificationStatus: string;
  aiVerificationScore: number | null;
  aiVerificationNotes: string | null;
}

interface AIVerificationCheck {
  check: string;
  passed: boolean;
  notes: string;
}

interface AIVerificationData {
  score: number;
  checks: AIVerificationCheck[];
  recommendation: string;
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
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [expandedAI, setExpandedAI] = useState<Record<string, boolean>>({});

  const handleVerificationAction = async (
    userId: string,
    action: "approve" | "reject"
  ) => {
    setConfirmDialog({ open: true, userId, action });
    if (action === "approve") {
      setRejectionNotes(""); // Clear notes for approval
    }
  };

  const confirmAction = async () => {
    if (!confirmDialog.userId || !confirmDialog.action) return;

    if (confirmDialog.action === "reject" && !rejectionNotes.trim()) {
      toast.error("Please provide rejection notes");
      return;
    }

    try {
      await updateVerification.mutateAsync({
        userId: confirmDialog.userId,
        status: confirmDialog.action === "approve" ? "verified" : "rejected",
        notes: confirmDialog.action === "reject" ? rejectionNotes : undefined,
      });
      toast.success(
        `Verification ${confirmDialog.action === "approve" ? "approved" : "rejected"}`
      );
      refetch();
      setConfirmDialog({ open: false, userId: null, action: null });
      setRejectionNotes("");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update verification";
      toast.error(message);
    }
  };

  const maskEIN = (ein: string | null) => {
    if (!ein) return "N/A";
    const digits = ein.replace(/\D/g, "");
    if (digits.length < 4) return "***";
    return `**-***${digits.slice(-4)}`;
  };

  const parseAIVerification = (
    aiNotes: string | null
  ): AIVerificationData | null => {
    if (!aiNotes) return null;
    try {
      return JSON.parse(aiNotes) as AIVerificationData;
    } catch {
      return null;
    }
  };

  const getAIScoreBadgeColor = (score: number | null) => {
    if (score === null) return "secondary";
    if (score >= 70) return "default"; // green
    if (score >= 50) return "outline"; // yellow
    return "destructive"; // red
  };

  const toggleAIExpansion = (userId: string) => {
    setExpandedAI((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Verification Queue</h1>
        <p className="text-muted-foreground mt-1">
          Review business verification requests flagged for manual review
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : verifications && verifications.length > 0 ? (
        <div className="space-y-4">
          {verifications.map((user: VerificationUser) => {
            const aiData = parseAIVerification(user.aiVerificationNotes);
            const isAIExpanded = expandedAI[user.id] || false;

            return (
              <Card key={user.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">
                          {user.businessName || user.name}
                        </CardTitle>
                        <Badge variant="secondary">{user.role}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {user.name} ({user.email})
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                      {user.aiVerificationScore !== null && (
                        <Badge
                          variant={getAIScoreBadgeColor(user.aiVerificationScore)}
                          className="flex items-center gap-1"
                        >
                          <Shield className="h-3 w-3" />
                          AI Score: {user.aiVerificationScore}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Business Details Section */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Business Details
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">EIN:</span>
                        <p className="font-medium">{maskEIN(user.einTaxId)}</p>
                      </div>
                      {user.businessWebsite && (
                        <div>
                          <span className="text-muted-foreground">Website:</span>
                          <a
                            href={user.businessWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline font-medium"
                          >
                            <Globe className="h-3 w-3" />
                            {user.businessWebsite.replace(/^https?:\/\//, "")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                      {user.businessAddress && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Address:</span>
                          <p className="font-medium">
                            {user.businessAddress}
                            {user.businessCity && `, ${user.businessCity}`}
                            {user.businessState && `, ${user.businessState}`}
                            {user.businessZip && ` ${user.businessZip}`}
                          </p>
                        </div>
                      )}
                      {user.verificationRequestedAt && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">
                            Submission Date:
                          </span>
                          <p className="font-medium">
                            {formatDate(user.verificationRequestedAt)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* License Document Section */}
                  {user.verificationDocUrl && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        License Document
                      </h4>
                      <a
                        href={user.verificationDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <FileText className="h-3 w-3" />
                        View Document
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {/* AI Analysis Section */}
                  {aiData && (
                    <div>
                      <button
                        onClick={() => toggleAIExpansion(user.id)}
                        className="flex items-center justify-between w-full text-sm font-medium mb-2 hover:text-primary"
                        aria-expanded={isAIExpanded}
                      >
                        <span className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          AI Analysis
                        </span>
                        {isAIExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                      {isAIExpanded && (
                        <div className="space-y-2 pl-6">
                          <p className="text-sm text-muted-foreground">
                            <strong>Recommendation:</strong> {aiData.recommendation}
                          </p>
                          <div className="space-y-2">
                            {aiData.checks.map((check, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2 text-sm"
                              >
                                {check.passed ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                                )}
                                <div>
                                  <span className="font-medium">{check.check}</span>
                                  <p className="text-muted-foreground">
                                    {check.notes}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleVerificationAction(user.id, "approve")}
                      className="flex-1 bg-green-600 hover:bg-green-700"
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
            );
          })}
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
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({ open: false, userId: null, action: null });
            setRejectionNotes("");
          }
        }}
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
                ? "This will mark the user as verified and allow them full access to PlankMarket."
                : "This will reject the verification request. The user will be notified with your notes."}
            </DialogDescription>
          </DialogHeader>
          {confirmDialog.action === "reject" && (
            <div className="py-4">
              <label
                htmlFor="rejection-notes"
                className="text-sm font-medium mb-2 block"
              >
                Rejection Notes (Required)
              </label>
              <Textarea
                id="rejection-notes"
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Explain why the verification is being rejected..."
                rows={4}
                aria-required="true"
                aria-invalid={!rejectionNotes.trim()}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialog({ open: false, userId: null, action: null });
                setRejectionNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmDialog.action === "approve" ? "default" : "destructive"
              }
              onClick={confirmAction}
              disabled={
                updateVerification.isPending ||
                (confirmDialog.action === "reject" && !rejectionNotes.trim())
              }
            >
              {updateVerification.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : confirmDialog.action === "approve" ? (
                "Approve"
              ) : (
                "Reject"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
