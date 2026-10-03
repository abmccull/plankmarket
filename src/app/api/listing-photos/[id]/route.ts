// Target: src/app/api/listing-photos/[id]/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { authorizeListingPhotoRead, type ListingPhotoActor } from "@/server/services/listing-photo-read";
import { privateListingPhotoStorage, validateListingPhotoBytes } from "@/server/services/listing-photo-storage";
import { sanitizeDownloadFileName } from "@/server/security/evidence-files";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Vary": "Cookie, Authorization",
};
const unavailable = () => new NextResponse(null, { status: 404, headers: privateHeaders });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return unavailable();
  try {
    const auth = await createClient();
    const { data, error } = await auth.auth.getUser();
    // A revoked or invalid session cannot fall back to anonymous access.
    if (error && (error.status === 401 || error.status === 403)) return unavailable();
    // Missing session is an ordinary public viewer. An auth outage is not.
    if (error && error.name !== "AuthSessionMissingError") throw error;
    let actor: ListingPhotoActor | null = null;
    if (data.user) {
      const current = await db.query.users.findFirst({ where: eq(users.authId, data.user.id), columns: { id: true, active: true, role: true } });
      if (!current?.active) return unavailable();
      let assuranceLevel: ListingPhotoActor["assuranceLevel"] = null;
      if (current.role === "admin") {
        const assurance = await auth.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!assurance.error && assurance.data?.currentLevel === "aal2") assuranceLevel = "aal2";
      }
      actor = { id: current.id, assuranceLevel };
    }
    const photo = await authorizeListingPhotoRead(db, id, actor);
    if (!photo) return unavailable();
    const storage = await privateListingPhotoStorage({ deadlineAt: Date.now() + 8_000, database: db });
    const loaded = await storage.download(photo.frozenPath);
    if (loaded.error && [loaded.error.status, loaded.error.statusCode].some(status => String(status) === "404")) return unavailable();
    if (loaded.error || !loaded.data) throw new Error("Private photo bytes unavailable");
    const body = await loaded.data.arrayBuffer();
    validateListingPhotoBytes(new Uint8Array(body), photo.fileSize, photo.mimeType);
    // Do not release downloaded bytes after a concurrent revocation/deletion decision.
    if (!await authorizeListingPhotoRead(db, id, actor)) return unavailable();
    return new NextResponse(body, { headers: {
      ...privateHeaders,
      "Content-Type": photo.mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename="${sanitizeDownloadFileName(photo.fileName, photo.mimeType)}"`,
    } });
  } catch {
    return new NextResponse("Photo temporarily unavailable. Try again.", { status: 503, headers: privateHeaders });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: { ...privateHeaders, Allow: "GET, HEAD, OPTIONS" } }); }
const methodNotAllowed = () => new NextResponse(null, { status: 405, headers: { ...privateHeaders, Allow: "GET, HEAD, OPTIONS" } });
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
