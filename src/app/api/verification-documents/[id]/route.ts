import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { verificationDocumentReference } from "@/lib/verification-documents";
import { readPrivateVerificationDocument } from "@/server/services/verification-documents";
import { sanitizeDownloadFileName } from "@/server/security/evidence-files";
export async function GET(_request: Request, {params}: {params:Promise<{id:string}>}) {
  const {id}=await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null,{status:404});
  const auth=await createClient();
  const {data:{user}}=await auth.auth.getUser();
  if (!user) return new NextResponse(null,{status:401});
  const actor=await db.query.users.findFirst({where:eq(users.authId,user.id)});
  if (!actor?.active) return new NextResponse(null,{status:403});
  if (actor.role === "admin") {
    const assurance=await auth.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data?.currentLevel!=="aal2") return new NextResponse(null,{status:403});
  }
  // Check metadata ownership before touching provider storage.
  const {verificationDocuments}=await import("@/server/db/schema/verification-documents");
  const row=await db.query.verificationDocuments.findFirst({where:eq(verificationDocuments.id,id)});
  if (!row || row.deletedAt || !row.readyAt || (actor.role!=="admin" && row.userId!==actor.id)) return new NextResponse(null,{status:404});
  try {
    const {data}=await readPrivateVerificationDocument(verificationDocumentReference(id));
    return new NextResponse(data,{headers:{"Content-Type":row.mimeType,"Content-Disposition":`attachment; filename="${sanitizeDownloadFileName(row.fileName,row.mimeType as "application/pdf"|"image/png"|"image/jpeg")}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch { return new NextResponse("Document unavailable. Try again.",{status:503}); }
}
