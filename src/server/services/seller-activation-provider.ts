import { createServiceClient } from "@/lib/supabase/server";

export interface SellerActivationRoleProvider {
  readUser(authId: string): Promise<{ id: string; appMetadata: Record<string, unknown> }>;
  patchRole(authId: string, patch: {
    role: "buyer" | "seller" | "admin";
    plankmarket_seller_activation: string | null;
    plankmarket_role_write: string;
  }): Promise<void>;
}

/** Narrow metadata patches preserve unrelated provider fields. A write is never its own receipt. */
export async function sellerActivationRoleProvider(): Promise<SellerActivationRoleProvider> {
  const client = await createServiceClient({ requestTimeoutMs: 8000 });
  return {
    async readUser(authId) {
      const { data, error } = await client.auth.admin.getUserById(authId);
      if (error || !data.user || data.user.id !== authId) {
        throw new Error("Seller account confirmation is unavailable");
      }
      return { id: data.user.id, appMetadata: data.user.app_metadata };
    },
    async patchRole(authId, patch) {
      const { data, error } = await client.auth.admin.updateUserById(authId, { app_metadata: patch });
      if (error || !data.user || data.user.id !== authId) {
        throw new Error("Seller account update requires confirmation");
      }
    },
  };
}
