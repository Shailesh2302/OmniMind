"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import KnowledgeGlobe from "@/components/visual/KnowledgeGlobe";

const FEATURES = [
  {
    n: "01",
    t: "Transcribe",
    d: "Whisper converts every spoken word into text with timestamps. Hindi, English, 90+ languages.",
    tag: "WHISPER · CPU/GPU",
  },
  {
    n: "02",
    t: "Index",
    d: "Embeddings land in your private Qdrant vector space the moment processing finishes.",
    tag: "QDRANT · 1536-DIM",
  },
  {
    n: "03",
    t: "Ask",
    d: "A reasoning model answers strictly from your library, citing the exact chunk and timestamp.",
    tag: "OX-ALPHA · RAG",
  },
  {
    n: "04",
    t: "Clip",
    d: "Describe a cut in words. ffmpeg renders a frame-accurate clip you can download instantly.",
    tag: "FFMPEG · RUST WORKER",
  },
];

const TICKER = [
  "TRANSCRIBE",
  "INDEX",
  "SEARCH",
  "ASK",
  "SUMMARIZE",
  "CLIP",
  "HIGHLIGHTS",
  "TOPICS",
];

export default function LandingPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cta = isAuthenticated ? "/dashboard" : "/register";
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", { hour12: false })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* ================= NAV ================= */}
      <header className="fixed inset-x-0 top-0 z-50 hairline-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center bg-lime-300 font-display text-xs font-bold text-black">
              Æ
            </span>
            <span className="font-display text-sm font-bold tracking-[0.22em]">AETHER</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#capabilities" className="mono-label transition hover:text-foreground">Capabilities</a>
            <a href="#engine" className="mono-label transition hover:text-foreground">Engine</a>
            <Link href="/search" className="mono-label transition hover:text-foreground">Search</Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 mono-label sm:flex">
              <span className="live-dot" /> SYS ONLINE
            </span>
            {isAuthenticated ? (
              <Link href="/dashboard" className="btn-lime px-4 py-1.5 text-xs uppercase tracking-wider">
                Console →
              </Link>
            ) : (
              <>
                <Link href="/login" className="mono-label hidden transition hover:text-foreground sm:block">
                  Sign in
                </Link>
                <Link href="/register" className="btn-lime px-4 py-1.5 text-xs uppercase tracking-wider">
                  Get access
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden pt-14">
        {/* Giant watermark */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 top-16 select-none font-display text-[26vw] font-bold leading-none outline-text opacity-60"
        >
          Æ
        </div>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 pb-0 pt-20 lg:grid-cols-[1.15fr_1fr] lg:pt-24">
          {/* Copy */}
          <div className="relative z-10 flex flex-col justify-center pb-16 lg:pb-28">
            <div className="reveal mb-8 inline-flex w-fit items-center gap-3 border border-border px-3 py-1.5">
              <span className="live-dot" />
              <span className="mono-label">Knowledge engine · v1.0</span>
            </div>

            <h1 className="reveal reveal-1 font-display text-[13vw] font-bold leading-[0.92] tracking-tight sm:text-7xl xl:text-[86px]">
              Your knowledge,
              <br />
              <span className="lime-text">alive.</span>
            </h1>

            <p className="reveal reveal-2 mt-8 max-w-md text-lg leading-relaxed text-muted-foreground">
              Upload videos and documents. Aether transcribes every word,
              indexes every idea — then answers to it. Search it. Question it.
              Clip it.
            </p>

            <div className="reveal reveal-3 mt-10 flex flex-wrap items-center gap-4">
              <Link
                href={cta}
                className="btn-lime px-8 py-4 text-sm uppercase tracking-wider"
                data-testid="hero-primary-cta"
              >
                {isAuthenticated ? "Open console" : "Start indexing"} →
              </Link>
              <a href="#engine" className="btn-ghost px-8 py-4 text-sm uppercase tracking-wider">
                See the engine
              </a>
            </div>

            {/* Mono stats strip */}
            <div className="reveal reveal-4 mt-14 grid max-w-lg grid-cols-3 hairline-t">
              {[
                ["40+", "formats"],
                ["<60s", "to searchable"],
                ["90+", "languages"],
              ].map(([v, l]) => (
                <div key={l} className="py-4 pr-4">
                  <div className="font-mono text-xl font-bold lime-text">{v}</div>
                  <div className="mt-1 mono-label">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Globe */}
          <div className="relative hidden lg:block">
            <KnowledgeGlobe className="absolute inset-0" />
            <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex items-end justify-between">
              <div className="mono-label">
                NODES: 160 · EDGES: LIVE
                <br />
                MOVE CURSOR TO STEER
              </div>
              <div className="text-right font-mono text-xs text-muted-foreground">
                {clock || "00:00:00"}
                <br />
                <span className="lime-text">● REC</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= TICKER ================= */}
      <div className="marquee hairline-y border-y border-border py-4" aria-hidden>
        <div className="marquee-track font-display text-2xl font-bold tracking-tight">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="mx-6 inline-flex items-center gap-6">
              <span className={i % 2 ? "outline-text" : ""}>{t}</span>
              <span className="lime-text">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ================= CAPABILITIES (editorial rows) ================= */}
      <section id="capabilities" className="mx-auto max-w-[1400px] px-5 py-24">
        <div className="mb-12 flex items-end justify-between">
          <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Capabilities<span className="lime-text">.</span>
          </h2>
          <span className="mono-label hidden sm:block">04 SYSTEMS / ONE ENGINE</span>
        </div>

        <div className="border-t border-border">
          {FEATURES.map((f) => (
            <div
              key={f.n}
              className="group grid grid-cols-[64px_1fr] items-baseline gap-x-6 gap-y-2 border-b border-border py-8 transition-colors hover:bg-white/[0.02] md:grid-cols-[96px_240px_1fr_180px] md:items-center"
            >
              <span className="font-mono text-sm text-muted-foreground transition group-hover:lime-text">
                /{f.n}
              </span>
              <h3 className="font-display text-2xl font-bold tracking-tight transition-transform duration-300 group-hover:translate-x-2 md:text-3xl">
                {f.t}
              </h3>
              <p className="col-span-2 max-w-xl text-sm leading-relaxed text-muted-foreground md:col-span-1">
                {f.d}
              </p>
              <span className="mono-label col-span-2 md:col-span-1 md:text-right">{f.tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ================= ENGINE / HOW ================= */}
      <section id="engine" className="hairline-t bg-card/40">
        <div className="mx-auto max-w-[1400px] px-5 py-24">
          <div className="mb-14 flex items-end justify-between">
            <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              The pipeline<span className="lime-text">.</span>
            </h2>
            <span className="mono-label hidden sm:block">UPLOAD → ALIVE</span>
          </div>

          <div className="grid gap-px border border-border bg-border md:grid-cols-3">
            {[
              { n: "01", t: "Drop anything", d: "MP4, MOV, WEBM, MP3, WAV, PDF, DOCX, XLSX, TXT — up to 500 MB per file.", meta: "POST /api/files/upload" },
              { n: "02", t: "Workers take over", d: "A Rust worker extracts audio, Whisper transcribes, embeddings index — live status throughout.", meta: "REDIS QUEUE × 3" },
              { n: "03", t: "It answers back", d: "Semantic search, cited chat answers, summaries, moments and rendered clips.", meta: "RAG + FFMPEG" },
            ].map((s) => (
              <div key={s.n} className="group relative bg-background p-8 transition-colors hover:bg-white/[0.02]">
                <div className="mb-10 font-mono text-4xl font-bold outline-text transition group-hover:lime-text" style={{ WebkitTextStroke: undefined }}>
                  {s.n}
                </div>
                <h3 className="font-display text-xl font-semibold">{s.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
                <div className="mt-6 mono-label">{s.meta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-[1400px] px-5 py-32 text-center">
          <div className="mono-label mb-6">READY WHEN YOU ARE</div>
          <h2 className="mx-auto max-w-3xl font-display text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl">
            Stop scrubbing.
            <br />
            <span className="lime-text">Start asking.</span>
          </h2>
          <button
            onClick={() => router.push(cta)}
            className="btn-lime mx-auto mt-12 px-12 py-5 text-sm uppercase tracking-[0.15em]"
          >
            Create your engine →
          </button>
          <p className="mt-6 mono-label">FREE · NO CARD · LOCAL-FIRST STORAGE</p>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="hairline-t">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center bg-lime-300 font-display text-[10px] font-bold text-black">Æ</span>
            <span className="font-display text-xs font-bold tracking-[0.22em]">AETHER</span>
          </div>
          <span className="mono-label">
            WHISPER · QDRANT · OX-ALPHA · RUST — {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
