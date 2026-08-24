"use client";

import { useEffect, useRef } from "react";

/**
 * Signature visual: a slowly rotating constellation of nodes and edges —
 * a "knowledge globe". Reacts to cursor position. Pure canvas 2D.
 */
export default function KnowledgeGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    type Node = { lat: number; lon: number; size: number };
    const N = 160;
    const nodes: Node[] = Array.from({ length: N }, () => ({
      lat: Math.asin(Math.random() * 2 - 1),
      lon: Math.random() * Math.PI * 2,
      size: Math.random() < 0.12 ? 2.2 : Math.random() * 1.1 + 0.4,
    }));

    // Fixed edge list between nearby nodes (computed once in index space).
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dl =
          Math.abs(nodes[i].lat - nodes[j].lat) +
          Math.abs(nodes[i].lon - nodes[j].lon);
        if (dl < 0.42 && Math.random() < 0.5) edges.push([i, j]);
      }
    }

    let rotY = 0;
    let rotX = -0.25;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * DPR;
      canvas.height = height * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove);

    const render = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.36;

      rotY += 0.0026 + mouse.current.x * 0.0018;
      const targetTilt = -0.35 + mouse.current.y * 0.3;
      rotX += (targetTilt - rotX) * 0.04;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const pts = nodes.map((n) => {
        const x0 = Math.cos(n.lat) * Math.cos(n.lon + t * 0.00006);
        const y0 = Math.sin(n.lat);
        const z0 = Math.cos(n.lat) * Math.sin(n.lon + t * 0.00006);
        // rotate Y then X
        const x1 = x0 * cosY - z0 * sinY;
        const z1 = x0 * sinY + z0 * cosY;
        const y1 = y0 * cosX - z1 * sinX;
        const z2 = y0 * sinX + z1 * cosX;
        return { x: cx + x1 * R, y: cy + y1 * R, z: z2 };
      });

      // Edges
      for (const [a, b] of edges) {
        const pa = pts[a];
        const pb = pts[b];
        const depth = (pa.z + pb.z) / 2; // -1..1
        const alpha = 0.05 + (depth + 1) * 0.075;
        ctx.strokeStyle = `hsla(0 0% 100% / ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // Nodes
      nodes.forEach((n, i) => {
        const p = pts[i];
        const depth = (p.z + 1) / 2; // 0 back .. 1 front
        const isHub = n.size > 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, n.size * (0.6 + depth * 0.7), 0, Math.PI * 2);
        ctx.fillStyle = isHub
          ? `hsla(74 100% 62% / ${0.35 + depth * 0.65})`
          : `hsla(0 0% 100% / ${0.15 + depth * 0.55})`;
        ctx.fill();
      });

      // Sweep ring
      const ringR = R * (1.08 + 0.02 * Math.sin(t * 0.001));
      ctx.strokeStyle = "hsla(74 100% 62% / 0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div className={className}>
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
    </div>
  );
}
