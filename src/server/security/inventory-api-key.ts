import {
  createHash,
  createHmac,
  randomBytes,
} from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { inventorySources } from "@/server/db/schema";

export const INVENTORY_API_KEY_PREFIX = "pm_inv_";

export interface GeneratedInventoryApiKey {
  plaintext: string;
  hash: string;
  hint: string;
}

export interface AuthenticatedInventorySource {
  id: string;
  sellerId: string;
  authMode: "bearer" | "signed";
  status: "active";
  keyRotatedAt: Date;
}

export type InventoryAuthenticationResult =
  | { ok: true; source: AuthenticatedInventorySource; deliveryId?: string }
  | {
      ok: false;
      status: 401 | 403;
      code: "INVALID_CREDENTIALS" | "SOURCE_DISABLED";
    };

export function hashInventoryApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export function generateInventoryApiKey(): GeneratedInventoryApiKey {
  const plaintext = `${INVENTORY_API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    hash: hashInventoryApiKey(plaintext),
    hint: `${INVENTORY_API_KEY_PREFIX}...${plaintext.slice(-6)}`,
  };
}

export function inventorySignaturePayload(params: {
  timestamp: string;
  deliveryId: string;
  rawBody: Uint8Array;
}): Buffer {
  return Buffer.concat([
    Buffer.from(`${params.timestamp}.${params.deliveryId}.`, "utf8"),
    Buffer.from(params.rawBody),
  ]);
}

/**
 * Legacy helper retained for deterministic tests and compatibility utilities.
 * Inventory ingest now authenticates with bearer credentials only.
 */
export function createInventoryRequestSignature(params: {
  apiKey: string;
  timestamp: string;
  deliveryId: string;
  rawBody: Uint8Array;
}): string {
  return createHmac("sha256", hashInventoryApiKey(params.apiKey))
    .update(inventorySignaturePayload(params))
    .digest("hex");
}

export async function authenticateInventoryRequest(params: {
  headers: Headers;
  rawBody: Uint8Array;
  now?: Date;
}): Promise<InventoryAuthenticationResult> {
  const authorization = params.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const token = bearerMatch[1]?.trim() ?? "";
    if (
      !token.startsWith(INVENTORY_API_KEY_PREFIX) ||
      token.length > 128 ||
      token.length < 40
    ) {
      return { ok: false, status: 401, code: "INVALID_CREDENTIALS" };
    }

    const tokenHash = hashInventoryApiKey(token);
    const [source] = await db
      .select({
        id: inventorySources.id,
        sellerId: inventorySources.sellerId,
        authMode: inventorySources.authMode,
        status: inventorySources.status,
        keyRotatedAt: inventorySources.keyRotatedAt,
      })
      .from(inventorySources)
      .where(eq(inventorySources.apiKeyHash, tokenHash))
      .limit(1);

    if (!source || source.authMode !== "bearer") {
      return { ok: false, status: 401, code: "INVALID_CREDENTIALS" };
    }
    if (source.status !== "active") {
      return { ok: false, status: 403, code: "SOURCE_DISABLED" };
    }
    return {
      ok: true,
      source: {
        id: source.id,
        sellerId: source.sellerId,
        authMode: source.authMode,
        status: "active",
        keyRotatedAt: source.keyRotatedAt,
      },
    };
  }
  return { ok: false, status: 401, code: "INVALID_CREDENTIALS" };
}
