import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { createClient } from "@/lib/supabase/server";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";
import { canCreateListings, canPurchase } from "@/lib/auth/roles";
import { db } from "@/server/db";
import { listings, orders, users } from "@/server/db/schema";
import { and, eq, or } from "drizzle-orm";
import { inspectEvidenceUpload } from "@/server/security/evidence-files";
import { persistTrustedUpload } from "@/server/services/trusted-upload";
import { z } from "zod";

const f = createUploadthing();

async function requireAdminUploadAssurance(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  let currentLevel: string | null | undefined;
  try {
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    currentLevel = assurance.data?.currentLevel;
  } catch {
    throw new UploadThingError({
      code: "FORBIDDEN",
      message: "We could not validate your security session. Please try again.",
    });
  }
  if (currentLevel !== "aal2") {
    throw new UploadThingError({ code: "FORBIDDEN", message: MFA_REQUIRED_MESSAGE });
  }
}

async function requireUploadAccount(
  allowedRole: "buyer" | "seller",
): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    throw new UploadThingError({
      code: "FORBIDDEN",
      message: "You must be logged in to upload images",
    });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.authId, authUser.id),
    columns: {
      id: true,
      role: true,
      active: true,
      verificationStatus: true,
    },
  });

  if (!dbUser || !dbUser.active) {
    throw new UploadThingError({
      code: "FORBIDDEN",
      message: "This account cannot upload images",
    });
  }

  const allowed = allowedRole === "buyer"
    ? canPurchase(dbUser.role)
    : canCreateListings(dbUser.role);
  if (!allowed) {
    throw new UploadThingError({
      code: "FORBIDDEN",
      message: `Only ${allowedRole} accounts can use this uploader`,
    });
  }

  if (dbUser.role !== "admin" && dbUser.verificationStatus !== "verified") {
    throw new UploadThingError({
      code: "FORBIDDEN",
      message: "Business verification is required before uploading images",
    });
  }

  if (dbUser.role === "admin") await requireAdminUploadAssurance(supabase);
  return { userId: dbUser.id };
}

async function requireOrderParticipantUploadAccount(): Promise<{
  userId: string;
  role: "buyer" | "seller" | "admin";
}> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    throw new UploadThingError({
      code: "FORBIDDEN",
      message: "You must be logged in to upload claim evidence",
    });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.authId, authUser.id),
    columns: {
      id: true,
      role: true,
      active: true,
      verificationStatus: true,
    },
  });
  if (
    !dbUser ||
    !dbUser.active ||
    (dbUser.role !== "admin" && dbUser.verificationStatus !== "verified")
  ) {
    throw new UploadThingError({
      code: "FORBIDDEN",
      message: "This account cannot upload claim evidence",
    });
  }
  if (dbUser.role === "admin") await requireAdminUploadAssurance(supabase);
  return { userId: dbUser.id, role: dbUser.role };
}

async function validateUploadThingCallbackFile(params: {
  file: {
    key: string;
    type: string;
    url: string;
  };
  allowPdf: boolean;
}): Promise<string> {
  try {
    const { mimeType } = await inspectEvidenceUpload({
      fileKey: params.file.key,
      fileUrl: params.file.url,
      claimedMimeType: params.file.type,
    });
    if (!params.allowPdf && mimeType === "application/pdf") {
      throw new Error("Uploads must be supported raster images");
    }
    return mimeType;
  } catch (error) {
    // A signed callback can be a retry for a retained object. Inspection failure
    // does not authorize physical deletion or establish that the file is unused.
    console.warn("Upload content validation failed", { key: params.file.key });
    throw new UploadThingError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? error.message
          : "Upload content could not be validated",
    });
  }
}

export async function validateListingOrBuyerUploadThingFile(file: {
  key: string;
  type: string;
  url: string;
}) {
  return validateUploadThingCallbackFile({ file, allowPdf: false });
}

export async function validateDisputeUploadThingFile(file: {
  key: string;
  type: string;
  url: string;
}) {
  return validateUploadThingCallbackFile({ file, allowPdf: true });
}

/**
 * UploadThing file router for PlankMarket
 * Handles image uploads for listing photos
 */
export const ourFileRouter = {
  listingImageUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 20,
    },
  })
    .input(z.object({ listingId: z.string().uuid().optional() }))
    .middleware(async ({ input }) => {
      const account = await requireUploadAccount("seller");
      if (input.listingId) {
        const listing = await db.query.listings.findFirst({
          where: and(
            eq(listings.id, input.listingId),
            eq(listings.sellerId, account.userId),
          ),
          columns: { id: true },
        });
        if (!listing) {
          throw new UploadThingError({
            code: "FORBIDDEN",
            message: "You can only upload to your own listing",
          });
        }
      }
      return { ...account, listingId: input.listingId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const mimeType = await validateListingOrBuyerUploadThingFile(file);
      const record = await persistTrustedUpload({
        userId: metadata.userId,
        file,
        listingId: metadata.listingId,
        mimeTypeOverride: mimeType,
      });
      return {
        id: record.id,
        url: record.url,
        fileName: record.fileName,
        sortOrder: record.sortOrder,
      };
    }),
  buyerRequestImageUploader: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 5,
    },
  })
    .middleware(async () => {
      return requireUploadAccount("buyer");
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const mimeType = await validateListingOrBuyerUploadThingFile(file);
      const record = await persistTrustedUpload({
        userId: metadata.userId,
        file,
        mimeTypeOverride: mimeType,
      });
      return {
        id: record.id,
        url: record.url,
        fileName: record.fileName,
        sortOrder: record.sortOrder,
      };
    }),
  disputeEvidenceUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 10,
    },
    pdf: {
      maxFileSize: "8MB",
      maxFileCount: 5,
    },
  })
    .input(z.object({ orderId: z.string().uuid() }))
    .middleware(async ({ input }) => {
      const account = await requireOrderParticipantUploadAccount();
      const order = await db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.orderId),
          account.role === "admin"
            ? undefined
            : or(
                eq(orders.buyerId, account.userId),
                eq(orders.sellerId, account.userId),
              ),
        ),
        columns: { id: true },
      });
      if (!order) {
        throw new UploadThingError({
          code: "FORBIDDEN",
          message: "You can only upload evidence for your own order",
        });
      }
      return { ...account, orderId: order.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const mimeType = await validateDisputeUploadThingFile(file);
      const record = await persistTrustedUpload({
        userId: metadata.userId,
        file,
        mimeTypeOverride: mimeType,
      });
      return {
        id: record.id,
        url: record.url,
        fileName: record.fileName,
        mimeType: record.mimeType,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
