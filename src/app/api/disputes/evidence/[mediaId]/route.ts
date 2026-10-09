import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { MFA_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";
import { db } from "@/server/db";
import { disputeEvidence, users } from "@/server/db/schema";
import { normalizeEvidenceMimeType, sanitizeDownloadFileName, shouldForceAttachmentForEvidence } from "@/server/security/evidence-files";
import { isTrustedUploadThingFileUrl } from "@/server/security/uploadthing";
import { authorizeListingPhotoRead } from "@/server/services/listing-photo-read";
import { privateListingPhotoStorage, validateListingPhotoBytes } from "@/server/services/listing-photo-storage";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", Vary: "Cookie, Authorization" };
const errorResponse = (error: string, status: number) => Response.json({ error }, { status, headers: privateHeaders });
async function getViewer() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const viewer = await db.query.users.findFirst({ where: eq(users.authId, authUser.id), columns: { id: true, role: true, active: true } });
  return { viewer, supabase };
}
export async function GET(_request: Request, context: { params: Promise<{ mediaId: string }> }) {
  try { return await readEvidence(context); }
  catch { return errorResponse("Evidence file could not be fetched", 503); }
}
async function readEvidence(context: { params: Promise<{ mediaId: string }> }) {
  const session = await getViewer(), viewer = session?.viewer;
  if (!session || !viewer?.active) return errorResponse("Unauthorized", 401);
  if (viewer.role === "admin") {
    try {
      const assurance = await session.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (assurance.data?.currentLevel !== "aal2") return errorResponse(MFA_REQUIRED_MESSAGE, 403);
    } catch { return errorResponse("We could not validate your security session. Please try again.", 503); }
  }
  const { mediaId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId)) return errorResponse("Not found", 404);
  const record = await db.query.disputeEvidence.findFirst({
    where: eq(disputeEvidence.mediaId, mediaId), columns: { id: true },
    with: {
      media: { columns: { id: true, url: true, key: true, fileName: true, fileSize: true, mimeType: true, storageProvider: true } },
      dispute: { columns: { id: true }, with: { order: { columns: { buyerId: true, sellerId: true } } } },
    },
  });
  if (!record?.media || !record.dispute.order) return errorResponse("Not found", 404);
  if (viewer.role !== "admin" && record.dispute.order.buyerId !== viewer.id && record.dispute.order.sellerId !== viewer.id) return errorResponse("Forbidden", 403);
  const mimeType = normalizeEvidenceMimeType(record.media.mimeType);
  if (!mimeType) return errorResponse("Unsupported media type", 415);
  const fileName = sanitizeDownloadFileName(record.media.fileName, mimeType).replace(/"/g, "");
  const headers = new Headers({ ...privateHeaders,
    "Content-Disposition": `${shouldForceAttachmentForEvidence(mimeType) ? "attachment" : "inline"}; filename="${fileName}"`,
    "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Type": mimeType,
  });
  // Keep the existing dispute/order participant decision above. Persisted provider
  // selects this narrow branch; a relative URL or missing UT key never selects it.
  if (record.media.storageProvider === "supabase_listing") {
    const actor = { id: viewer.id, assuranceLevel: viewer.role === "admin" ? "aal2" as const : "aal1" as const };
    const photo = await authorizeListingPhotoRead(db, mediaId, actor);
    if (!photo) return errorResponse("Not found", 404);
    try {
      const storage = await privateListingPhotoStorage({ deadlineAt: Date.now() + 8_000, database: db });
      const loaded = await storage.download(photo.frozenPath);
      if (loaded.error && [loaded.error.status, loaded.error.statusCode].some(status => String(status) === "404")) return errorResponse("Not found", 404);
      if (loaded.error || !loaded.data) throw new Error("Private evidence bytes unavailable");
      const body = await loaded.data.arrayBuffer();
      validateListingPhotoBytes(new Uint8Array(body), photo.fileSize, photo.mimeType);
      if (!await authorizeListingPhotoRead(db, mediaId, actor)) return errorResponse("Not found", 404);
      headers.set("Content-Length", String(body.byteLength));
      return new Response(body, { status: 200, headers });
    } catch { return errorResponse("Evidence file could not be fetched", 503); }
  }
  // Existing UploadThing validation/fetch semantics remain the default provider.
  if (!record.media.key || !isTrustedUploadThingFileUrl(record.media.url, record.media.key)) return errorResponse("Evidence file is unavailable", 502);
  let upstream: Response;
  try { upstream = await fetch(record.media.url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) }); }
  catch { return errorResponse("Evidence file could not be fetched", 502); }
  if (!upstream.ok || !upstream.body) return errorResponse("Evidence file could not be fetched", 502);
  const length = upstream.headers.get("content-length"); if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
