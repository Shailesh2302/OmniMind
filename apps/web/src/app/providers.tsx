"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * App-wide providers.
 *
 * IMPORTANT: never gate `children` behind a loading state here — doing so
 * blanks every page (including SSR output) whenever the auth check is slow
 * or the API is unreachable. Pages that genuinely require auth (dashboard)
 * enforce it in their own layouts.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    // Refresh the session in the background; never block rendering on it.
    void checkAuth();
  }, [checkAuth]);

  return <>{children}</>;
}
