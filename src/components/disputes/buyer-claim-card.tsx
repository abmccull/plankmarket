"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileCheck2, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useUploadThing } from "@/lib/uploadthing";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const REASON_OPTIONS = [
  ["freight_damage", "Freight damage"],
  ["quantity_shortage", "Quantity shortage"],
  ["wrong_item", "Wrong material received"],
  ["quality_mismatch", "Quality does not match the listing"],
  ["condition_mismatch", "Condition does not match the listing"],
  ["missing_documentation", "Missing documentation"],
  ["other", "Other order issue"],
] as const;

type ReasonCode = (typeof REASON_OPTIONS)[number][0];

function claimStatusLabel(status: string) {
  return (
    {
      open: "Submitted",
      under_review: "Under review",
      resolved_buyer: "Resolved for buyer",
      resolved_seller: "Resolved for seller",
      closed: "Closed",
    }[status] ?? status
  );
}
function validateFiles(files: File[], maximum: number) {
  if (files.length > maximum) {
    return `You can attach up to ${maximum} files.`;
  }
  const invalid = files.find(
    (file) =>
      file.size > 8 * 1024 * 1024 ||
      (!file.type.startsWith("image/") &&
        file.type !== "application/pdf"),
  );
  if (invalid) {
    return `${invalid.name} is unsupported or larger than 8 MB.`;
  }
  return null;
}

export function BuyerClaimCard({ orderId }: { orderId: string }) {
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<ReasonCode | "">("");
  const [description, setDescription] = useState("");
  const [damageVisibleAtDelivery, setDamageVisibleAtDelivery] =
    useState(false);
  const [bolDamageNoted, setBolDamageNoted] = useState(false);
  const [bolNotes, setBolNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const claimState = trpc.dispute.getOrderClaimState.useQuery({ orderId });
  const createClaim = trpc.dispute.create.useMutation();
  const deleteUpload = trpc.upload.deleteBuyerMedia.useMutation();
  const { startUpload } = useUploadThing("disputeEvidenceUploader");

  const deadlineText = useMemo(() => {
    const deadline = claimState.data?.reportingDeadlineAt;
    return deadline ? formatDate(deadline) : null;
  }, [claimState.data?.reportingDeadlineAt]);

  async function submitClaim() {
    if (!reasonCode) {
      toast.error("Choose the issue that best describes the claim.");
      return;
    }
    if (description.trim().length < 20) {
      toast.error("Add enough detail for the seller and support team to review.");
      return;
    }
    if (photos.length === 0) {
      toast.error("Attach at least one photo of the issue.");
      return;
    }
    if (
      reasonCode === "freight_damage" &&
      damageVisibleAtDelivery &&
      (!bolDamageNoted || documents.length === 0)
    ) {
      toast.error(
        "Visible freight damage must be noted on the delivery receipt, and a copy must be attached.",
      );
      return;
    }
    const allFiles = [...photos, ...documents];
    const fileError = validateFiles(allFiles, 10);
    if (fileError) {
      toast.error(fileError);
      return;
    }

    setIsSubmitting(true);
    let uploadedMediaIds: string[] = [];
    try {
      const uploaded = await startUpload(allFiles, { orderId });
      if (!uploaded || uploaded.length !== allFiles.length) {
        throw new Error("Not every evidence file was accepted");
      }
      const records = uploaded.map((file) => file.serverData);
      if (records.some((record) => !record?.id)) {
        throw new Error("Evidence metadata was not confirmed");
      }
      uploadedMediaIds = records.map((record) => record!.id);

      await createClaim.mutateAsync({
        orderId,
        reasonCode,
        description: description.trim(),
        damageVisibleAtDelivery:
          reasonCode === "freight_damage"
            ? damageVisibleAtDelivery
            : undefined,
        bolDamageNoted:
          reasonCode === "freight_damage" ? bolDamageNoted : undefined,
        bolNotes: bolNotes.trim() || undefined,
        evidence: records.map((record, index) => ({
          mediaId: record!.id,
          evidenceType:
            index < photos.length
              ? ("photo" as const)
              : reasonCode === "freight_damage"
                ? ("delivery_receipt" as const)
                : ("other" as const),
          description:
            index < photos.length
              ? "Buyer issue photo"
              : "Supporting order document",
        })),
      });
      await utils.dispute.getOrderClaimState.invalidate({ orderId });
      toast.success("Your claim and evidence were submitted.");
      setDialogOpen(false);
    } catch (error) {
      await Promise.allSettled(
        uploadedMediaIds.map((id) => deleteUpload.mutateAsync({ id })),
      );
      toast.error(getErrorMessage(error, "The claim could not be submitted."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (claimState.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking claim eligibility…
        </CardContent>
      </Card>
    );
  }
  if (claimState.isError || !claimState.data) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-6 text-sm text-destructive">
          Claim status is temporarily unavailable. Please refresh before
          reporting an issue.
        </CardContent>
      </Card>
    );
  }

  const state = claimState.data;
  const existing = state.existingDispute;

  return (
    <>
      <Card className={existing ? "border-amber-300/70" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5" />
            Delivery issue or shortage
          </CardTitle>
          <CardDescription>
            Report documented delivery issues from the order record so payment,
            freight, and evidence stay together.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {existing ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    existing.status === "open" ||
                    existing.status === "under_review"
                      ? "warning"
                      : "secondary"
                  }
                >
                  {claimStatusLabel(existing.status)}
                </Badge>
                <span className="text-sm font-medium">{existing.reason}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Submitted {formatDate(existing.createdAt)} with{" "}
                {existing.evidence.length} evidence{" "}
                {existing.evidence.length === 1 ? "item" : "items"}.
              </p>
              {existing.evidence.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {existing.evidence.map((item) => (
                    <a
                      key={item.id}
                      href={item.media.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted"
                    >
                      <Paperclip className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        {item.media.fileName || item.evidenceType}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-md bg-muted/60 p-3 text-sm">
                <p className="font-medium">{state.message}</p>
                {deadlineText && (
                  <p className="mt-1 text-muted-foreground">
                    Reporting deadline: {deadlineText}
                  </p>
                )}
              </div>
              {state.canCreate && state.eligible && (
                <Button onClick={() => setDialogOpen(true)}>
                  Report an order issue
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Report an order issue</DialogTitle>
            <DialogDescription>
              Submit the issue within 48 hours of carrier-confirmed delivery.
              Your description and files become part of the transaction record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="claimReason">Issue type</Label>
              <Select
                value={reasonCode}
                onValueChange={(value) => setReasonCode(value as ReasonCode)}
              >
                <SelectTrigger id="claimReason">
                  <SelectValue placeholder="Choose an issue" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="claimDescription">What happened?</Label>
              <Textarea
                id="claimDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Describe the damage, shortage, packaging, quantity, and when you first noticed it."
              />
              <p className="text-xs text-muted-foreground">
                {description.trim().length}/5000 characters; minimum 20.
              </p>
            </div>

            {reasonCode === "freight_damage" && (
              <div className="space-y-4 rounded-md border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="visibleDamage">
                      Damage was visible at delivery
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Visible damage should be recorded before the carrier
                      leaves.
                    </p>
                  </div>
                  <Switch
                    id="visibleDamage"
                    checked={damageVisibleAtDelivery}
                    onCheckedChange={setDamageVisibleAtDelivery}
                  />
                </div>
                {damageVisibleAtDelivery && (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="bolNoted">
                        Damage was noted on the delivery receipt
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Attach the signed receipt below.
                      </p>
                    </div>
                    <Switch
                      id="bolNoted"
                      checked={bolDamageNoted}
                      onCheckedChange={setBolDamageNoted}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="bolNotes">Delivery receipt notes</Label>
                  <Textarea
                    id="bolNotes"
                    value={bolNotes}
                    onChange={(event) => setBolNotes(event.target.value)}
                    maxLength={2000}
                    placeholder="What did the driver or receiver write on the BOL or delivery receipt?"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="claimPhotos">Issue photos (required)</Label>
              <Input
                id="claimPhotos"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic"
                multiple
                onChange={(event) =>
                  setPhotos(Array.from(event.target.files ?? []))
                }
              />
              <p className="text-xs text-muted-foreground">
                Clear photos of packaging, labels, affected boards or cartons,
                and the full shipment. Up to 8 MB each.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="claimDocuments">
                BOL, delivery receipt, or supporting documents
              </Label>
              <Input
                id="claimDocuments"
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                multiple
                onChange={(event) =>
                  setDocuments(Array.from(event.target.files ?? []))
                }
              />
              <p className="text-xs text-muted-foreground">
                PDF or image. A delivery receipt is required when visible freight
                damage was reported.
              </p>
            </div>

            {(state.carrierDocuments.bolUrl ||
              state.carrierDocuments.deliveryReceiptUrl) && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <FileCheck2 className="h-4 w-4" />
                  Carrier documents already on the order
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {state.carrierDocuments.bolUrl && (
                    <a
                      className="text-primary underline"
                      href={state.carrierDocuments.bolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View BOL
                    </a>
                  )}
                  {state.carrierDocuments.deliveryReceiptUrl && (
                    <a
                      className="text-primary underline"
                      href={state.carrierDocuments.deliveryReceiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View delivery receipt
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitClaim} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit claim and evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
