"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Upload,
  FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

interface VerificationData {
  status: VerificationStatus;
  submittedAt?: Date;
  reviewedAt?: Date;
  rejectionReason?: string;
  documents?: Array<{
    name: string;
    url: string;
  }>;
}

export default function SellerVerificationPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Mock verification data - in production, fetch from API
  const [verification, setVerification] = useState<VerificationData>({
    status: "unverified",
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      // In production, upload files and submit verification request
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setVerification({
        status: "pending",
        submittedAt: new Date(),
      });

      toast.success("Verification request submitted successfully!");
      setSelectedFiles([]);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to submit verification";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubmit = () => {
    setVerification({
      status: "unverified",
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Seller Verification</h1>
        <p className="text-muted-foreground mt-1">
          Verify your business to build trust with buyers
        </p>
      </div>

      {/* Unverified State */}
      {verification.status === "unverified" && (
        <Card>
          <CardHeader>
            <CardTitle>Get Verified</CardTitle>
            <CardDescription>
              Submit your business documents to become a verified seller
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <h3 className="font-medium text-sm">Why get verified?</h3>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Build trust with potential buyers</li>
                  <li>Increase visibility in search results</li>
                  <li>Display a verified badge on your listings</li>
                  <li>Access to priority support</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  placeholder="Your business legal name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxId">Tax ID / EIN</Label>
                <Input
                  id="taxId"
                  placeholder="XX-XXXXXXX"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAddress">Business Address</Label>
                <Textarea
                  id="businessAddress"
                  placeholder="Street address, city, state, ZIP"
                  rows={3}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documents">Upload Business Documents</Label>
                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="documents"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="documents"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      Click to upload documents
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Business license, articles of incorporation, or resale
                      certificate
                    </p>
                  </label>
                </div>
                {selectedFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1">{file.name}</span>
                        <span className="text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || selectedFiles.length === 0}
              >
                {isSubmitting ? "Submitting..." : "Submit for Verification"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Pending State */}
      {verification.status === "pending" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Verification Under Review</CardTitle>
                <CardDescription>
                  Your verification request is being processed
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="bg-yellow-50 text-yellow-700 border-yellow-200"
              >
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-sm">
                    Verification typically takes 2-3 business days
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We will review your submitted documents and notify you via
                    email once the process is complete.
                  </p>
                </div>
              </div>
            </div>

            {verification.submittedAt && (
              <div className="text-sm">
                <span className="text-muted-foreground">Submitted: </span>
                <span className="font-medium">
                  {verification.submittedAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" disabled>
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verified State */}
      {verification.status === "verified" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your Account is Verified</CardTitle>
                <CardDescription>
                  You are now a verified seller on PlankMarket
                </CardDescription>
              </div>
              <Badge className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4 border border-green-200 dark:border-green-900">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-green-900 dark:text-green-100">
                    Verification Complete
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Your verified badge will now appear on all your listings and
                    profile. Buyers will see you as a trusted seller.
                  </p>
                </div>
              </div>
            </div>

            {verification.reviewedAt && (
              <div className="text-sm">
                <span className="text-muted-foreground">Verified on: </span>
                <span className="font-medium">
                  {verification.reviewedAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rejected State */}
      {verification.status === "rejected" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Verification Not Approved</CardTitle>
                <CardDescription>
                  Your verification request was not approved
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="bg-red-50 text-red-700 border-red-200"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Rejected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-4 border border-red-200 dark:border-red-900">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-red-900 dark:text-red-100">
                    Reason for rejection
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {verification.rejectionReason ||
                      "The submitted documents did not meet our verification requirements. Please ensure all documents are clear, valid, and match your business information."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleResubmit}
                className="flex-1"
              >
                Resubmit Application
              </Button>
              <Button variant="outline" className="flex-1">
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
