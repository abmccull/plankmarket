import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "../auth-store";
import { rememberWorkspace, useWorkspaceStore } from "../workspace-store";

type User = NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>;
function signIn(id: string, role: User["role"] = "seller") {
  useAuthStore.getState().setUser({ id, role, name: id, email: "synthetic@example.invalid", businessName: "Synthetic", avatarUrl: null, verified: true, verificationStatus: "verified", stripeOnboardingComplete: false, zipCode: "80202" });
}
beforeEach(() => { useAuthStore.getState().logout(); sessionStorage.clear(); });

describe("workspace context is account-bound presentation", () => {
  it("ignores malformed tab storage and does not alter account authority", () => {
    sessionStorage.setItem("plankmarket:workspace:seller-a", "admin");
    signIn("seller-a");
    expect(useWorkspaceStore.getState().selected).toBeNull();
    const actor = useAuthStore.getState().user;
    expect(rememberWorkspace(useWorkspaceStore.getState(), "buyer")).toBe(true);
    expect(useAuthStore.getState().user).toBe(actor);
    expect(useAuthStore.getState().user?.role).toBe("seller");
    expect(sessionStorage.getItem("plankmarket:workspace:seller-a")).toBe("buyer");
  });
  it("refuses a delayed selection from a previous account or login generation", () => {
    signIn("seller-a"); const old = useWorkspaceStore.getState();
    signIn("seller-b");
    expect(rememberWorkspace(old, "buyer")).toBe(false);
    expect(useWorkspaceStore.getState().selected).toBeNull();
    useAuthStore.getState().logout(); signIn("seller-a");
    expect(rememberWorkspace(old, "buyer")).toBe(false);
  });
  it("preserves context on same-account refresh and rejects buyer selling selection", () => {
    signIn("seller-a"); rememberWorkspace(useWorkspaceStore.getState(), "buyer");
    signIn("seller-a"); expect(useWorkspaceStore.getState().selected).toBe("buyer");
    signIn("buyer-b", "buyer");
    expect(rememberWorkspace(useWorkspaceStore.getState(), "seller")).toBe(false);
    expect(useAuthStore.getState().user?.role).toBe("buyer");
  });
});
