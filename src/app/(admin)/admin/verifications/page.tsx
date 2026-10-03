"use client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { verificationDocumentHref } from "@/lib/verification-documents";

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
import { QueryErrorState } from "@/components/ui/state-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminActivationQueue } from "@/components/seller-activation/admin-activation-queue";

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
  verificationSubmissionId: string | null;
  verificationStatus: string;
  aiVerificationScore: number | null;
  aiVerificationNotes: string | null;
}

interface AIVerificationData {
  score: number;
  approved: boolean;
  reasoning: string;
  checks: Record<
    string,
    { pass: boolean; note: string } | { found: boolean; note: string }
  >;
  automation?: {
    decision: "auto_approve" | "manual_review";
    reasons: string[];
    policy: string;
  };
}

const reviewReasonLabels: Record<string, string> = {
  automation_disabled: "Automatic approval is not enabled",
  unsupported_account: "Account role requires review",
  document_not_inspected: "Document could not be inspected",
  document_not_eligible: "Document type needs review",
  document_unreadable_or_suspicious:
    "Document is unclear or has integrity concerns",
  business_name_mismatch: "Document business name needs confirmation",
  ein_mismatch: "Document tax ID does not clearly match",
  state_mismatch: "Document state does not clearly match",
  issuer_missing: "Issuing authority is not clear",
  document_expired_or_undated: "Document date needs confirmation",
  email_not_confirmed: "Account email is not confirmed",
  business_domain_mismatch: "Email and business website domains differ",
  advisory_checks_failed: "Automated checks found insufficient evidence",
  jev_unavailable_or_uncertain: "Jev could not clear the consistency checks",
};

export default function AdminVerificationsPage() {
  const actor = useAuthStore((state) => state.user);
  if (actor?.role !== "admin")
    return <p role="status">Checking administrator access…</p>;
  return <Suspense fallback={<p role="status">Loading verification workspace…</p>}><VerificationTabs actorId={actor.id} /></Suspense>;
}
function VerificationTabs({ actorId }: { actorId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "seller-applications" ? "seller-applications" : "business";
  return <div className="space-y-5"><h1 className="text-3xl font-bold">Verifications</h1><Tabs value={tab} onValueChange={value => {
    const next = new URLSearchParams(params.toString());
    if (value === "seller-applications") next.set("tab", value); else next.delete("tab");
    router.push("/admin/verifications" + (next.size ? "?" + next.toString() : ""));
  }}><TabsList className="h-auto min-h-11 max-w-full"><TabsTrigger value="business" className="min-h-10 whitespace-normal">Business verification</TabsTrigger><TabsTrigger value="seller-applications" className="min-h-10 whitespace-normal">Seller applications</TabsTrigger></TabsList><TabsContent value="business"><VerificationQueue key={actorId} actorId={actorId} /></TabsContent><TabsContent value="seller-applications"><AdminActivationQueue /></TabsContent></Tabs></div>;
}
function VerificationQueue({ actorId }: { actorId: string }) {
  const mounted = useRef(false);
  const working = useRef(false);
  const selection = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<Record<string, boolean>>({});
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current &&
    useAuthStore.getState().user?.id === actorId &&
    useAuthStore.getState().user?.role === "admin";

  const utils = trpc.useUtils();
  const queue = trpc.admin.getPendingVerifications.useQuery();
  const { data: verifications, isLoading } = queue;
  const queueUnavailable = queue.isError || readFailed;
  const updateVerification = trpc.admin.updateVerification.useMutation({
    retry: false,
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    userId: string | null;
    submissionId: string | null;
    action: "approve" | "reject" | null;
  }>({ open: false, userId: null, submissionId: null, action: null });
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [expandedAI, setExpandedAI] = useState<Record<string, boolean>>({});

  const handleVerificationAction = async (
    userId: string,
    submissionId: string | null,
    action: "approve" | "reject",
  ) => {
    if (busy || queueUnavailable || !current()) return;
    setProblem(null);
    selection.current = userId;
    setNotice(null);
    setConfirmDialog({ open: true, userId, submissionId, action });
    setRejectionNotes("");
  };

  const refreshQueue = async () => {
    try {
      const result = await queue.refetch({ throwOnError: true });
      if (!current()) return;
      setReadFailed(false);
      return result.data;
    } catch {
      if (current()) setReadFailed(true);
    }
  };
  const reviewLatest = async () => {
    const target = confirmDialog.userId;
    const rows = await refreshQueue();
    if (!current() || !target || selection.current !== target || !rows) return;
    const row = rows.find((item) => item.id === target);
    setUncertain((previous) => {
      const next = { ...previous };
      delete next[target];
      return next;
    });
    setProblem(null);
    if (!row) {
      selection.current = null;
      setRejectionNotes("");
      setConfirmDialog({
        open: false,
        userId: null,
        submissionId: null,
        action: null,
      });
    } else if (row.verificationSubmissionId !== confirmDialog.submissionId) {
      selection.current = null;
      setRejectionNotes("");
      setConfirmDialog({
        open: false,
        userId: null,
        submissionId: null,
        action: null,
      });
      setProblem(
        "This verification submission changed. Review the current submission before deciding.",
      );
    }
  };
  const confirmAction = async () => {
    const target = { ...confirmDialog };
    if (
      !target.userId ||
      !target.action ||
      !verifications?.some(
        (row) =>
          row.id === target.userId &&
          row.verificationSubmissionId === target.submissionId,
      ) ||
      working.current ||
      queueUnavailable ||
      queue.isFetching ||
      !current() ||
      uncertain[target.userId]
    )
      return;
    if (target.action === "reject" && !rejectionNotes.trim()) {
      setProblem("Please provide rejection notes");
      return;
    }
    const notes = rejectionNotes;
    working.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await utils.admin.getPendingVerifications.cancel();
      if (!current()) return;
      try {
        await updateVerification.mutateAsync({
          userId: target.userId,
          submissionId: target.submissionId,
          status: target.action === "approve" ? "verified" : "rejected",
          notes: target.action === "reject" ? notes : undefined,
        });
      } catch (error) {
        if (!current()) return;
        const code = (error as { data?: { code?: string } }).data?.code;
        const known = [
          "BAD_REQUEST",
          "FORBIDDEN",
          "UNAUTHORIZED",
          "NOT_FOUND",
          "CONFLICT",
        ].includes(code ?? "");
        setProblem(
          known
            ? error instanceof Error
              ? error.message
              : "Verification decision was rejected."
            : "Verification result unconfirmed. Review the latest verification before another attempt.",
        );
        if (!known)
          setUncertain((previous) => ({ ...previous, [target.userId!]: true }));
        return;
      }
      if (!current()) return;
      setNotice(
        target.action === "approve"
          ? "Verification approved."
          : "Verification rejected.",
      );
      setConfirmDialog({
        open: false,
        userId: null,
        submissionId: null,
        action: null,
      });
      setRejectionNotes("");
      await utils.admin.getPendingVerifications.invalidate(undefined, {
        refetchType: "none",
      });
      if (!current()) return;
      await refreshQueue();
    } catch {
      if (current()) setReadFailed(true);
    } finally {
      if (current()) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const selectedUser = verifications?.find(
    (item) => item.id === confirmDialog.userId,
  );

  const maskEIN = (ein: string | null) => {
    if (!ein) return "N/A";
    const digits = ein.replace(/\D/g, "");
    if (digits.length < 4) return "***";
    return `**-***${digits.slice(-4)}`;
  };

  const parseAIVerification = (
    aiNotes: string | null,
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
        <h2 className="text-xl font-semibold">Verification Queue</h2>
        <p className="text-muted-foreground mt-1">
          Review business verification requests flagged for manual review
        </p>
      </div>

      {notice ? <p role="status">{notice}</p> : null}
      {!confirmDialog.open && problem ? (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      ) : null}
      <Button
        variant="outline"
        className="h-auto min-h-11 max-w-full whitespace-normal py-2"
        disabled={busy || queue.isFetching}
        onClick={() => void refreshQueue()}
      >
        Refresh queue
      </Button>
      {queueUnavailable ? (
        <QueryErrorState
          title="Verifications unavailable"
          description="The verification queue could not be loaded. Retry this read without repeating an accepted decision."
          onRetry={() => void refreshQueue()}
          isRetrying={queue.isFetching}
        />
      ) : isLoading ? (
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
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1"
                      >
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                      {user.aiVerificationScore !== null && (
                        <Badge
                          variant={getAIScoreBadgeColor(
                            user.aiVerificationScore,
                          )}
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
                          <span className="text-muted-foreground">
                            Website:
                          </span>
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
                          <span className="text-muted-foreground">
                            Address:
                          </span>
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
                        href={verificationDocumentHref(user.verificationDocUrl)}
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
                            <strong>Advisory recommendation:</strong>{" "}
                            {aiData.approved
                              ? "Consider approval after reviewing the evidence"
                              : "Manual review required"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {aiData.reasoning}
                          </p>
                          {aiData.automation?.decision === "manual_review" && (
                            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                              <p className="font-medium">
                                Manual review reasons
                              </p>
                              <ul className="mt-1 list-disc pl-5">
                                {aiData.automation.reasons.map((reason) => (
                                  <li key={reason}>
                                    {reviewReasonLabels[reason] ?? reason}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="space-y-2">
                            {Object.entries(aiData.checks).map(
                              ([checkName, check]) => {
                                const passed =
                                  "pass" in check ? check.pass : !check.found;
                                return (
                                  <div
                                    key={checkName}
                                    className="flex items-start gap-2 text-sm"
                                  >
                                    {passed ? (
                                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                                    )}
                                    <div>
                                      <span className="font-medium">
                                        {checkName.replace(/([A-Z])/g, " $1")}
                                      </span>
                                      <p className="text-muted-foreground">
                                        {check.note}
                                      </p>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() =>
                        handleVerificationAction(
                          user.id,
                          user.verificationSubmissionId,
                          "approve",
                        )
                      }
                      disabled={busy || queue.isFetching}
                      className="flex-1 h-auto min-h-11 max-w-full whitespace-normal py-2 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        handleVerificationAction(
                          user.id,
                          user.verificationSubmissionId,
                          "reject",
                        )
                      }
                      disabled={busy || queue.isFetching}
                      className="flex-1 h-auto min-h-11 max-w-full whitespace-normal py-2"
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
          if (!open && !busy) {
            selection.current = null;
            setConfirmDialog({
              open: false,
              userId: null,
              submissionId: null,
              action: null,
            });
            setRejectionNotes("");
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === "approve"
                ? "Approve Verification"
                : "Reject Verification"}
            </DialogTitle>
            <DialogDescription>
              <span className="mb-2 block break-words font-medium">
                {selectedUser?.businessName || selectedUser?.name} ·{" "}
                {selectedUser?.email}
              </span>
              {confirmDialog.action === "approve"
                ? "This will mark the user as verified and allow them full access to PlankMarket."
                : "This will reject the verification request. The user will be notified with your notes."}
            </DialogDescription>
          </DialogHeader>
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          {queueUnavailable || uncertain[confirmDialog.userId ?? ""] ? (
            <Button
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal py-2"
              disabled={busy || queue.isFetching}
              onClick={() => void reviewLatest()}
            >
              Review latest verification
            </Button>
          ) : null}
          {confirmDialog.action === "reject" && (
            <div className="py-4">
              <label
                htmlFor="rejection-notes"
                className="text-sm font-medium mb-2 block"
              >
                Correction request (required)
              </label>
              <Textarea
                id="rejection-notes"
                disabled={
                  busy ||
                  queueUnavailable ||
                  !!uncertain[confirmDialog.userId ?? ""]
                }
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Name the field or document, explain what is missing or incorrect, and state what the applicant should submit instead."
                maxLength={2000}
                aria-describedby="verification-correction-guidance"
                rows={4}
                aria-required="true"
                aria-invalid={!rejectionNotes.trim()}
              />
              <p id="verification-correction-guidance" className="mt-2 text-sm text-muted-foreground">The applicant sees this message. Give an actionable correction and avoid including sensitive identifiers.</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal py-2"
              disabled={busy}
              onClick={() => {
                selection.current = null;
                setConfirmDialog({
                  open: false,
                  userId: null,
                  submissionId: null,
                  action: null,
                });
                setRejectionNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmDialog.action === "approve" ? "default" : "destructive"
              }
              className="h-auto min-h-11 max-w-full whitespace-normal py-2"
              onClick={confirmAction}
              disabled={
                busy ||
                queueUnavailable ||
                queue.isFetching ||
                !!uncertain[confirmDialog.userId ?? ""] ||
                !selectedUser ||
                selectedUser.verificationSubmissionId !==
                  confirmDialog.submissionId ||
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
