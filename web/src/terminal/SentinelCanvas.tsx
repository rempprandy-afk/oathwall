"use client";

import { useEffect, useRef } from "react";

/**
 * The command deck's stage — the same sentinel as oathwall.dev's hero, so the
 * product and the site share one picture: a wireframe sphere cut clean
 * through by a blade of light — the wall. Trade packets stream in from the left; most hit the
 * blade and are refused (red burst, bounce), a few are within the oath and
 * pass through to the chain (blue). Pure 2D canvas, DPR-aware, paused when
 * offscreen, and a single still frame under reduced motion.
 */

type Packet = { x: number; y: number; vx: number; vy: number; pass: boolean; state: "in" | "out" | "bounce"; life: number };
type Burst = { x: number; y: number; t: number; ok: boolean };

const BLUE = "108, 182, 255";
const ICE = "207, 230, 255";
const RED = "255, 84, 64";

export function SentinelCanvas({ focusX = 0.64, labels = true }: { focusX?: number; labels?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mono = getComputedStyle(canvas).fontFamily || "ui-monospace, monospace";
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let R = 0;
    const fade = 1;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w * focusX;
      cy = h * 0.5;
      R = Math.min(h * 0.3, w * 0.14);
    };

    const packets: Packet[] = [];
    const bursts: Burst[] = [];
    let spawnAt = 0;
    const spawn = () => {
      const pass = Math.random() < 0.28;
      const y = cy + (Math.random() - 0.5) * R * 1.5;
      packets.push({ x: -20, y, vx: 2.4 + Math.random() * 1.8, vy: (cy - y) * 0.0025, pass, state: "in", life: 1 });
    };

    // one rotating sphere: latitude rings + meridians, projected with a tilt
    const TILT = 0.38;
    const project = (lat: number, lon: number, rot: number): [number, number, number] => {
      const x0 = Math.cos(lat) * Math.cos(lon + rot);
      const y0 = Math.sin(lat);
      const z0 = Math.cos(lat) * Math.sin(lon + rot);
      const y1 = y0 * Math.cos(TILT) - z0 * Math.sin(TILT);
      const z1 = y0 * Math.sin(TILT) + z0 * Math.cos(TILT);
      return [cx + x0 * R, cy + y1 * R, z1];
    };

    const drawSphere = (rot: number) => {
      ctx.lineWidth = 1;
      const seg = (pts: [number, number, number][]) => {
        for (let i = 1; i < pts.length; i++) {
          const [x1, y1, z1] = pts[i - 1];
          const [x2, y2, z2] = pts[i];
          const front = (z1 + z2) / 2 < 0;
          ctx.strokeStyle = `rgba(${BLUE}, ${(front ? 0.42 : 0.1) * fade})`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      };
      for (let i = 1; i < 9; i++) {
        const lat = -Math.PI / 2 + (i * Math.PI) / 9;
        const pts: [number, number, number][] = [];
        for (let j = 0; j <= 64; j++) pts.push(project(lat, (j / 64) * Math.PI * 2, rot));
        seg(pts);
      }
      for (let i = 0; i < 14; i++) {
        const lon = (i / 14) * Math.PI * 2;
        const pts: [number, number, number][] = [];
        for (let j = 0; j <= 40; j++) pts.push(project(-Math.PI / 2 + (j / 40) * Math.PI, lon, rot));
        seg(pts);
      }
      // nodes at intersections, lit on the front face
      for (let i = 1; i < 9; i += 2) {
        const lat = -Math.PI / 2 + (i * Math.PI) / 9;
        for (let k = 0; k < 14; k += 2) {
          const [x, y, z] = project(lat, (k / 14) * Math.PI * 2, rot);
          if (z > 0) continue;
          ctx.fillStyle = `rgba(${ICE}, ${0.75 * fade})`;
          ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        }
      }
      // core glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
      g.addColorStop(0, `rgba(${BLUE}, ${0.16 * fade})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawRings = (t: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      // outer HUD ring with ticks
      ctx.rotate(t * 0.00012);
      const rr = R * 1.28;
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const long = i % 10 === 0;
        const r0 = rr - (long ? 9 : 4);
        ctx.strokeStyle = `rgba(${BLUE}, ${(long ? 0.5 : 0.18) * fade})`;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.stroke();
      }
      ctx.restore();
      // counter-rotating arc segments
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-t * 0.0003);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${ICE}, ${0.55 * fade})`;
      for (let k = 0; k < 3; k++) {
        const a0 = (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.4, a0, a0 + 0.5);
        ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 1;
    };

    const drawBlade = (t: number) => {
      const top = cy - R * 1.75;
      const bot = cy + R * 1.75;
      const skew = R * 0.09;
      const bw = Math.max(5, R * 0.035);
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, `rgba(${ICE}, ${0.2 * fade})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - bw + skew, top);
      ctx.lineTo(cx + bw + skew, top);
      ctx.lineTo(cx + bw - skew, bot);
      ctx.lineTo(cx - bw - skew, bot);
      ctx.closePath();
      ctx.fill();
      // bright edge + travelling scan glint
      const e = ctx.createLinearGradient(0, top, 0, bot);
      e.addColorStop(0, "rgba(0,0,0,0)");
      e.addColorStop(0.5, `rgba(${ICE}, ${0.9 * fade})`);
      e.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = e;
      ctx.beginPath();
      ctx.moveTo(cx - bw + skew, top);
      ctx.lineTo(cx - bw - skew, bot);
      ctx.stroke();
      const s = ((t * 0.00035) % 1) * (bot - top) + top;
      const sx = cx - bw + skew - ((s - top) / (bot - top)) * skew * 2;
      const glint = ctx.createRadialGradient(sx, s, 0, sx, s, 26);
      glint.addColorStop(0, `rgba(${ICE}, ${0.8 * fade})`);
      glint.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glint;
      ctx.fillRect(sx - 26, s - 26, 52, 52);
    };

    const bladeX = (y: number) => {
      const top = cy - R * 1.75;
      const bot = cy + R * 1.75;
      const skew = R * 0.09;
      return cx - Math.max(5, R * 0.035) + skew - ((y - top) / (bot - top)) * skew * 2;
    };

    const drawPackets = () => {
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.state === "in" && p.x >= bladeX(p.y)) {
          bursts.push({ x: p.x, y: p.y, t: 0, ok: p.pass });
          if (p.pass) p.state = "out";
          else {
            p.state = "bounce";
            p.vx = -p.vx * 0.35;
            p.vy = (Math.random() - 0.5) * 2.2;
          }
        }
        if (p.state !== "in") p.life -= p.state === "bounce" ? 0.03 : 0.006;
        if (p.life <= 0 || p.x > w + 40) {
          packets.splice(i, 1);
          continue;
        }
        const col = p.state === "bounce" ? RED : p.state === "out" ? BLUE : ICE;
        const len = p.state === "bounce" ? 10 : 34;
        const g = ctx.createLinearGradient(p.x - Math.sign(p.vx) * len, p.y, p.x, p.y);
        g.addColorStop(0, `rgba(${col}, 0)`);
        g.addColorStop(1, `rgba(${col}, ${0.95 * p.life * fade})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.sign(p.vx) * len, p.y - (p.vy / Math.abs(p.vx || 1)) * len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${col}, ${p.life * fade})`;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.lineWidth = 1;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.t += 0.035;
        if (b.t >= 1) {
          bursts.splice(i, 1);
          continue;
        }
        const col = b.ok ? BLUE : RED;
        ctx.strokeStyle = `rgba(${col}, ${(1 - b.t) * 0.9 * fade})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4 + b.t * (b.ok ? 14 : 26), 0, Math.PI * 2);
        ctx.stroke();
        if (!b.ok && b.t < 0.5) {
          ctx.fillStyle = `rgba(${RED}, ${(0.5 - b.t) * 0.5 * fade})`;
          ctx.font = `500 10px ${mono}`;
          ctx.fillText("REFUSED", b.x - 58, b.y - 10);
        }
      }
    };

    const drawHud = () => {
      ctx.font = `500 10px ${mono}`;
      ctx.fillStyle = `rgba(${BLUE}, ${0.55 * fade})`;
      const x = cx + R * 1.5;
      ctx.fillText("POLICY 0417 · ENFORCED", cx - R * 0.5, cy + R * 1.58);
      ctx.fillText("SESSION KEY · CAPPED", cx - R * 0.5, cy + R * 1.58 + 15);
      if (x + 90 < w) {
        ctx.fillText("CHAIN", x, cy - 4);
        ctx.fillText("BNB · 56", x, cy + 10);
      }
    };

    let raf = 0;
    let visible = true;
    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const rot = t * 0.00018;
      drawRings(t);
      drawSphere(rot);
      if (!still) {
        if (t > spawnAt) {
          spawn();
          spawnAt = t + 260 + Math.random() * 420;
        }
        drawPackets();
      }
      drawBlade(t);
      if (labels) drawHud();
      if (!still && visible) raf = requestAnimationFrame(frame);
    };

    size();
    const ro = new ResizeObserver(() => {
      size();
      if (still) frame(0);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !still) raf = requestAnimationFrame(frame);
    });
    io.observe(canvas);
    if (still) frame(0);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [focusX, labels]);

  return <canvas ref={ref} className="deck-canvas" aria-hidden="true" />;
}
