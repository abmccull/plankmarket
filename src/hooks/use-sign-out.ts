"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";

export function useSignOut(onSuccess?: () => void) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { error: signOutError } = await createClient().auth.signOut();
      if (signOutError) throw signOutError;
      await queryClient.cancelQueries();
      queryClient.clear();
      useAuthStore.getState().logout();
      onSuccess?.();
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not sign out. Try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return { signOut, pending, error };
}
