"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useUpload } from "@/hooks/useUpload";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  AlertCircle,
  FileText,
  UploadCloud,
  X,
  Video,
  Music,
  Image as ImageIcon,
  ArrowUpRight,
} from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const MAX_SIZE = 500 * 1024 * 1024;

function fileIcon(type: string) {
  if (type.startsWith("video/")) return <Video className="h-5 w-5" />;
  if (type.startsWith("audio/")) return <Music className="h-5 w-5" />;
  if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export default function UploadPage() {
  const { uploadFile, uploads, clearUploads, removeUpload } = useUpload();
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const handleFiles = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      for (const file of Array.from(list)) {
        if (file.size > MAX_SIZE) {
          toast({ title: "File too large", description: `${file.name} exceeds 500 MB`, variant: "destructive" });
          continue;
        }
        const result = await uploadFile(file);
        if (result) {
          toast({ title: "Queued — processing in background", description: result.originalName });
        }
      }
    },
    [uploadFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragCounter(0);
      setIsDragging(false);
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const doneCount = uploads.filter((u) => u.status === "success").length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      {/* Heading */}
      <div className="reveal mb-10 border-b border-border pb-8">
        <div className="mono-label mb-2">INTAKE</div>
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Feed the engine<span className="lime-text">.</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Transcription, indexing and intelligence run automatically.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragCounter((c) => c + 1);
          setIsDragging(true);
        }}
        onDragLeave={() => {
          setDragCounter((c) => Math.max(0, c - 1));
          if (dragCounter <= 1) setIsDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "reveal reveal-1 relative cursor-pointer border border-dashed p-16 text-center transition-all duration-200",
          isDragging
            ? "border-lime-300 bg-lime-300/[0.04]"
            : "border-border hover:border-white/30"
        )}
      >
        <input
          type="file"
          multiple
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          accept=".mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a,.jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.xlsx,.txt"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <div className="pointer-events-none">
          <UploadCloud
            className={cn(
              "mx-auto mb-6 h-10 w-10 transition",
              isDragging ? "lime-text scale-110" : "text-muted-foreground"
            )}
          />
          <h2 className="font-display text-xl font-semibold">
            {isDragging ? (
              <span className="lime-text">Release to index</span>
            ) : (
              <>Drop files <span className="text-muted-foreground">or click</span></>
            )}
          </h2>
          <div className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-x-1 gap-y-1 font-mono text-[11px] text-muted-foreground">
            {["MP4", "MOV", "WEBM", "MP3", "WAV", "PDF", "DOCX", "XLSX", "TXT"].map((t, i, arr) => (
              <span key={t}>
                {t}
                {i < arr.length - 1 && <span className="ml-1 text-white/20">/</span>}
              </span>
            ))}
          </div>
          <p className="mt-4 mono-label">MAX 500 MB / FILE</p>
        </div>
      </div>

      {/* Queue */}
      {uploads.length > 0 && (
        <div className="reveal mt-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="mono-label">
              QUEUE · {doneCount}/{uploads.length} DONE
            </span>
            <button
              onClick={clearUploads}
              className="mono-label transition hover:text-foreground"
            >
              CLEAR
            </button>
          </div>
          <div className="border-t border-border">
            {uploads.map((u) => (
              <div key={u.id} className="relative flex items-center gap-4 border-b border-border py-4">
                {u.status === "uploading" && (
                  <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-white/5">
                    <div className="h-full shimmer-line" />
                  </div>
                )}
                <span className="grid h-10 w-10 shrink-0 place-items-center border border-border bg-secondary text-muted-foreground">
                  {fileIcon(u.file.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-sm">{u.file.name}</p>
                    {(u.status === "success" || u.status === "error") && (
                      <button
                        onClick={() => removeUpload(u.id)}
                        className="shrink-0 p-1 text-muted-foreground transition hover:text-foreground"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {u.status === "uploading" && (
                    <>
                      <Progress value={u.progress} className="mt-2 h-1" />
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{u.progress}%</p>
                    </>
                  )}
                  {u.status === "success" && (
                    <div className="mt-1 flex items-center gap-4 text-xs">
                      <span className="pill pill-ok">UPLOADED</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{formatFileSize(u.file.size)}</span>
                      <Link href="/dashboard/files" className="inline-flex items-center gap-0.5 lime-text hover:underline">
                        Track <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                  {u.status === "error" && (
                    <div className="mt-1 pill pill-err w-fit">{u.error || "Failed"}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline note */}
      <div className="reveal mt-12 grid grid-cols-3 gap-px border border-border bg-border">
        {["TRANSCRIBE", "INDEX", "ALIVE"].map((t, i) => (
          <div key={t} className="bg-background p-4">
            <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
            <div className="mt-2 font-display text-sm font-semibold">{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
