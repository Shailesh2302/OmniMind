"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { Spinner } from "@/components/ui/spinner";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5">
      {/* Watermark */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 select-none font-display text-[24vw] font-bold leading-none outline-text">
          Æ
        </div>
      </div>

      <div className="reveal w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between hairline-b pb-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center bg-lime-300 font-display text-xs font-bold text-black">Æ</span>
            <span className="font-display text-sm font-bold tracking-[0.22em]">AETHER</span>
          </Link>
          <span className="mono-label">AUTH / LOGIN</span>
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight">
          Welcome back<span className="lime-text">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your knowledge engine is waiting.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="mono-label">Email</label>
            <input
              id="email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full border border-border bg-secondary/50 px-3.5 font-mono text-sm outline-none transition focus:border-lime-300/60 focus:bg-secondary"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="mono-label">Password</label>
            <input
              id="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full border border-border bg-secondary/50 px-3.5 font-mono text-sm outline-none transition focus:border-lime-300/60 focus:bg-secondary"
            />
          </div>

          {error && (
            <div className="pill pill-err w-fit">{error}</div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-lime h-11 w-full text-xs uppercase tracking-[0.15em] disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Spinner className="h-4 w-4" /> Authenticating
              </>
            ) : (
              "Sign in →"
            )}
          </button>
        </form>

        <p className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
          <span>No account?</span>
          <Link href="/register" className="lime-text font-medium hover:underline">
            Create one free →
          </Link>
        </p>
      </div>
    </div>
  );
}
