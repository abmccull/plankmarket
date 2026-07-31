import { inngest } from "@/lib/inngest/client";
import { processBusinessVerification } from "@/server/services/business-verification";

export const businessVerification = inngest.createFunction(
  {
    id: "business-verification-review",
    retries: 5,
  },
  { event: "verification/submitted" },
  async ({ event, step }) => {
    const userId = event.data.userId;
    const submissionId = event.data.submissionId;

    if (typeof userId !== "string" || typeof submissionId !== "string") {
      throw new Error("Invalid verification event payload");
    }

    return step.run("analyze-submission", () =>
      processBusinessVerification({ userId, submissionId }),
    );
  },
);
