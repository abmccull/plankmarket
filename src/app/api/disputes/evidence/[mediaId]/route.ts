import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { disputeEvidence, users } from "@/server/db/schema";
import {
  normalizeEvidenceMimeType,
  sanitizeDownloadFileName,
  shouldForceAttachmentForEvidence,
} from "@/server/security/evidence-files";
import { isTrustedUploadThingFileUrl } from "@/server/security/uploadthing";

export const dynamic = "force-dynamic";

async function getViewer() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return null;
  }

  return db.query.users.findFirst({
    where: eq(users.authId, authUser.id),
    columns: {
      id: true,
      role: true,
      active: true,
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  const viewer = await getViewer();
  if (!viewer?.active) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { mediaId } = await context.params;
  const evidenceRecord = await db.query.disputeEvidence.findFirst({
    where: eq(disputeEvidence.mediaId, mediaId),
    columns: { id: true },
    with: {
      media: {
        columns: {
          id: true,
          url: true,
          key: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
        },
      },
      dispute: {
        columns: { id: true },
        with: {
          order: {
            columns: {
              buyerId: true,
              sellerId: true,
            },
          },
        },
      },
    },
  });

  if (!evidenceRecord?.media || !evidenceRecord.dispute.order) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (
    viewer.role !== "admin" &&
    evidenceRecord.dispute.order.buyerId !== viewer.id &&
    evidenceRecord.dispute.order.sellerId !== viewer.id
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const mimeType = normalizeEvidenceMimeType(evidenceRecord.media.mimeType);
  if (!mimeType) {
    return Response.json({ error: "Unsupported media type" }, { status: 415 });
  }

  if (
    !evidenceRecord.media.key ||
    !isTrustedUploadThingFileUrl(
      evidenceRecord.media.url,
      evidenceRecord.media.key,
    )
  ) {
    return Response.json({ error: "Evidence file is unavailable" }, { status: 502 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(evidenceRecord.media.url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json(
      { error: "Evidence file could not be fetched" },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "Evidence file could not be fetched" },
      { status: 502 },
    );
  }

  const fileName = sanitizeDownloadFileName(
    evidenceRecord.media.fileName,
    mimeType,
  ).replace(/"/g, "");
  const dispositionType = shouldForceAttachmentForEvidence(mimeType)
    ? "attachment"
    : "inline";
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `${dispositionType}; filename="${fileName}"`,
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": mimeType,
    "X-Content-Type-Options": "nosniff",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
