"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useFeatureFlag } from "@/lib/experiments/use-feature-flag";
import { FEATURE_FLAGS } from "@/lib/experiments/feature-flags";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "general", label: "General Feedback" },
];

export function FeedbackWidget() {
  const { enabled } = useFeatureFlag(FEATURE_FLAGS.SHOW_FEEDBACK_WIDGET);
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<string>("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const pathname = usePathname();

  const submitFeedbackMutation = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      toast.success("Thank you for your feedback!");
      setIsOpen(false);
      setType("");
      setMessage("");
      setRating(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit feedback");
    },
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!enabled) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!type || !message.trim()) {
      toast.error("Please select a type and enter your feedback");
      return;
    }

    submitFeedbackMutation.mutate({
      type: type as "bug" | "feature" | "general",
      message: message.trim(),
      page: pathname,
      rating: rating || undefined,
    });
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full shadow-lg"
        size="lg"
        aria-label="Send feedback"
      >
        <MessageSquare className="h-5 w-5 mr-2" />
        Feedback
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Send Feedback</DialogTitle>
              <DialogDescription>
                Help us improve PlankMarket by sharing your thoughts
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="feedback-page">Current Page</Label>
                <input
                  id="feedback-page"
                  type="text"
                  value={pathname}
                  readOnly
                  className="w-full px-3 py-2 text-sm bg-muted rounded-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-type">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="feedback-type">
                    <SelectValue placeholder="Select feedback type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_TYPES.map((feedbackType) => (
                      <SelectItem
                        key={feedbackType.value}
                        value={feedbackType.value}
                      >
                        {feedbackType.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-message">Message</Label>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what's on your mind..."
                  rows={5}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Rating (optional)</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={cn(
                        "p-1 rounded transition-colors hover:bg-accent",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                      aria-label={`Rate ${star} out of 5 stars`}
                    >
                      <Star
                        className={cn(
                          "h-6 w-6 transition-colors",
                          rating && star <= rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground"
                        )}
                      />
                    </button>
                  ))}
                  {rating !== null && (
                    <button
                      type="button"
                      onClick={() => setRating(null)}
                      className="ml-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={submitFeedbackMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitFeedbackMutation.isPending}
              >
                {submitFeedbackMutation.isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
