"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useUpload } from "@/hooks/useUpload";
import {
  Upload,
  FileText,
  Search,
  MessageSquare,
  Video,
  ArrowUpRight,
  HardDrive,
} from "lucide-react";
import { formatDate, formatFileSize, getFileCategory } from "@/lib/utils";

const QUICK_ACTIONS = [
  { href: "/upload", label: "Upload", desc: "Feed the engine", icon: Upload },
  { href: "/search", label: "Search", desc: "Query everything", icon: Search },
  { href: "/dashboard/chat", label: "Chat", desc: "Talk to your library", icon: MessageSquare },
];

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const { files, fetchFiles } = useUpload();

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const fileList = useMemo(() => (Array.isArray(files) ? files : []), [files]);

  const stats = useMemo(() => {
    const totalSize = fileList.reduce((sum, f) => {
      const size = typeof f.size === "string" ? parseInt(f.size, 10) : f.size;
      return sum + (Number.isFinite(size) ? size : 0);
    }, 0);
    const videos = fileList.filter((f) => getFileCategory(f.mimeType) === "video").length;
    const docs = fileList.length - videos;
    return { totalSize, videos, docs };
  }, [fileList]);

  const recentFiles = useMemo(
    () =>
      [...fileList]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6),
    [fileList]
  );

  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      {/* Header row */}
      <div className="reveal flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mono-label mb-2">
            {new Date().toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()}
            {" · "}
            CONSOLE
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">
            {firstName}<span className="lime-text">.</span>
          </h1>
        </div>
        <Link
          href="/upload"
          className="btn-lime h-11 px-6 text-xs uppercase tracking-wider"
        >
          <Upload className="h-4 w-4" />
          Upload
        </Link>
      </div>

      {/* Quick actions */}
      <div className="reveal reveal-1 mt-8 grid gap-px border border-border bg-border sm:grid-cols-3">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center justify-between bg-background p-5 transition-colors hover:bg-white/[0.03]"
            >
              <span className="flex items-center gap-4">
                <Icon className="h-5 w-5 text-muted-foreground transition group-hover:lime-text" />
                <span>
                  <span className="block text-sm font-semibold">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.desc}</span>
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:text-lime-300 group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>

      {/* Stats */}
      <div className="reveal reveal-2 mt-8 grid grid-cols-3 gap-px border border-border bg-border">
        {[
          { icon: <FileText className="h-3.5 w-3.5" />, v: String(fileList.length), l: "FILES" },
          { icon: <HardDrive className="h-3.5 w-3.5" />, v: formatFileSize(stats.totalSize), l: "STORAGE" },
          { icon: <Video className="h-3.5 w-3.5" />, v: String(stats.videos), l: "VIDEOS" },
        ].map((s) => (
          <div key={s.l} className="bg-background p-5">
            <div className="mono-label flex items-center gap-2">
              {s.icon}
              {s.l}
            </div>
            <div className="mt-3 font-display text-3xl font-bold tracking-tight">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Recent */}
      <div className="reveal reveal-3 mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">
            Recent<span className="lime-text">.</span>
          </h2>
          <Link href="/dashboard/files" className="mono-label transition hover:text-foreground">
            ALL FILES →
          </Link>
        </div>

        {recentFiles.length === 0 ? (
          <div className="panel p-14 text-center">
            <div className="mx-auto mb-5 grid h-12 w-12 place-items-center border border-border bg-secondary text-muted-foreground">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold">Empty engine</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Drop a video or document in and it becomes searchable within a minute.
            </p>
            <Link href="/upload" className="btn-lime mt-6 px-6 py-2.5 text-xs uppercase tracking-wider">
              First upload
            </Link>
          </div>
        ) : (
          <div className="border-t border-border">
            {recentFiles.map((f) => {
              const isVideo = getFileCategory(f.mimeType) === "video";
              const status = String(f.status).toUpperCase();
              return (
                <Link
                  key={f.id}
                  href={isVideo ? `/dashboard/videos/${f.id}` : "/dashboard/files"}
                  className="group flex items-center gap-4 border-b border-border px-2 py-4 transition hover:bg-white/[0.02]"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {isVideo ? "VID" : "DOC"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:lime-text">
                      {f.originalName}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {formatDate(f.createdAt)} · {formatFileSize(typeof f.size === "string" ? parseInt(f.size, 10) : f.size)}
                    </span>
                  </span>
                  <StatusPill status={status} />
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "COMPLETED") return <span className="pill pill-ok">DONE</span>;
  if (status === "PROCESSING") return <span className="pill pill-busy"><span className="live-dot !h-1 !w-1" />PROC</span>;
  if (status === "FAILED") return <span className="pill pill-err">FAIL</span>;
  return <span className="pill pill-warn">PEND</span>;
}
