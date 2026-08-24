"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");

  const { register, error, isLoading, clearError } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    clearError();

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }

    try {
      await register(email, password, name);
      router.push("/dashboard");
    } catch {
      // error is in store
    }
  };

  const displayError = validationError || error;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5">
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
          <span className="mono-label">AUTH / REGISTER</span>
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight">
          Create your engine<span className="lime-text">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Free forever. Your files stay yours.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {[
            { id: "name", label: "Name", type: "text", ph: "Ada Lovelace", val: name, set: setName },
            { id: "email", label: "Email", type: "email", ph: "you@example.com", val: email, set: setEmail },
            { id: "password", label: "Password", type: "password", ph: "min. 8 characters", val: password, set: setPassword },
            { id: "confirmPassword", label: "Confirm password", type: "password", ph: "••••••••", val: confirmPassword, set: setConfirmPassword },
          ].map((f) => (
            <div key={f.id} className="space-y-2">
              <label htmlFor={f.id} className="mono-label">{f.label}</label>
              <input
                id={f.id}
                type={f.type}
                required
                placeholder={f.ph}
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                className="h-11 w-full border border-border bg-secondary/50 px-3.5 font-mono text-sm outline-none transition focus:border-lime-300/60 focus:bg-secondary"
              />
            </div>
          ))}

          {displayError && <div className="pill pill-err w-fit">{displayError}</div>}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-lime h-11 w-full text-xs uppercase tracking-[0.15em] disabled:opacity-60"
          >
            {isLoading ? "Creating…" : "Create account →"}
          </button>
        </form>

        <p className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
          <span>Already have one?</span>
          <Link href="/login" className="lime-text font-medium hover:underline">
            Sign in →
          </Link>
        </p>
      </div>
    </div>
  );
}
