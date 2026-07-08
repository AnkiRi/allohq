"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------------ */
/* THE SWARM, reused from frontend-swarm/CustomerField.tsx.           */
/*                                                                     */
/* A brand has 4,820 customers. A human marketer can attend to a       */
/* handful, so the rest get a blast. joon attends to each one. ~240    */
/* individual customer marks render as a living, pointer-reactive      */
/* swarm that self-organizes through real states: one undifferentiated */
/* CROWD → four SEGMENTS (lapsed / loyal / at-risk / new) → FOCUS, the */
/* many resolving into one named person.                               */
/*                                                                     */
/* RE-THEMED for v2: colours are read from the live .opt-v2 palette    */
/* tokens (--ink / --accent / --faint), so the field re-themes across  */
/* drenched / light / dark, ink/accent marks on white in LIGHT,       */
/* never neon-on-black baked in.                                       */
/*                                                                     */
/* Continuous pointer + animation values live in refs + one rAF loop,  */
/* never React state. Degradation: reduced motion / coarse pointer /   */
/* JS-off → the field draws once in the SEGMENTS formation (already     */
/* organized, already meaningful) and the legend is in markup, so       */
/* content is never gated on the animation firing.                     */
/* ------------------------------------------------------------------ */

const MARK_COUNT = 240;
const MARK_COUNT_SM = 150;
const STAND_IN_FOR = 4820;

type Formation = "crowd" | "segments" | "focus";

const SEGMENTS = [
  { key: "lapsed", label: "Lapsed", n: 187 },
  { key: "loyal", label: "Loyal", n: 1240 },
  { key: "risk", label: "At risk", n: 612 },
  { key: "new", label: "New", n: 904 },
] as const;

function parseColor(c: string): [number, number, number] {
  const s = c.trim();
  if (s.startsWith("#")) {
    const m = s.slice(1);
    const v =
      m.length === 3
        ? m
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : m;
    return [
      parseInt(v.slice(0, 2), 16) || 0,
      parseInt(v.slice(2, 4), 16) || 0,
      parseInt(v.slice(4, 6), 16) || 0,
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = (m[1] ?? "").split(",").map((n) => parseFloat(n));
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  }
  // oklch / unknown, return a mid grey; the field still reads
  return [150, 150, 150];
}
function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Mulberry32, deterministic so the field is identical every render / on SSR.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Mark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  crowdX: number;
  crowdY: number;
  segX: number;
  segY: number;
  focusX: number;
  focusY: number;
  seg: number;
  hero: boolean;
  r: number;
  glow: number;
}

const FORMATIONS: Formation[] = ["crowd", "segments", "focus"];
const FORMATION_LABEL: Record<Formation, string> = {
  crowd: "4,820 customers, one undifferentiated crowd",
  segments: "the same people, sorted into who they actually are",
  focus: "and then, just one of them",
};

function buildMarks(count: number): Mark[] {
  const rand = rng(48_20_2026);
  const marks: Mark[] = [];

  const bandY = 0.5;
  const bandCenters = [0.16, 0.38, 0.62, 0.84];

  const weights = SEGMENTS.map((s) => s.n);
  const totalW = weights.reduce((a, b) => a + b, 0);

  const heroIndex = Math.floor(count * 0.5);

  for (let i = 0; i < count; i++) {
    let roll = rand() * totalW;
    let seg = 0;
    for (let k = 0; k < weights.length; k++) {
      roll -= weights[k] ?? 0;
      if (roll <= 0) {
        seg = k;
        break;
      }
    }

    const crowdX = 0.06 + rand() * 0.88;
    const crowdY = 0.1 + rand() * 0.8;

    const g = () => (rand() + rand() + rand()) / 3 - 0.5;
    const segX = (bandCenters[seg] ?? 0.5) + g() * 0.14;
    const segY = bandY + g() * 0.5;

    const hero = i === heroIndex;
    let focusX: number;
    let focusY: number;
    if (hero) {
      focusX = 0.34;
      focusY = 0.5;
    } else {
      const ang = rand() * Math.PI * 2;
      const rad = 0.42 + rand() * 0.16;
      focusX = 0.5 + Math.cos(ang) * rad * 0.95;
      focusY = 0.5 + Math.sin(ang) * rad;
    }

    marks.push({
      x: crowdX,
      y: crowdY,
      vx: 0,
      vy: 0,
      crowdX,
      crowdY,
      segX,
      segY,
      focusX,
      focusY,
      seg,
      hero,
      r: hero ? 5 : 1.6 + rand() * 1.1,
      glow: 0,
    });
  }
  return marks;
}

export function SwarmField() {
  const reduced = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const pointer = useRef({ x: -9999, y: -9999, active: false });
  const marksRef = useRef<Mark[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const formationRef = useRef(0);
  const morphRef = useRef(0);

  const [label, setLabel] = useState<string>(FORMATION_LABEL.segments);
  const [hasPointer, setHasPointer] = useState(false);

  useEffect(() => {
    const fine =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: fine)").matches;
    setHasPointer(fine);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // read palette tokens off the live element so the field re-themes per palette
    const css = getComputedStyle(wrap);
    const colInk = parseColor(css.getPropertyValue("--ink") || "#e9e7e0");
    const colAccent = parseColor(css.getPropertyValue("--accent") || "#25b583");
    const colFaint = parseColor(css.getPropertyValue("--faint") || "#6b7480");

    const small = wrap.getBoundingClientRect().width < 420;
    const want = small ? MARK_COUNT_SM : MARK_COUNT;
    if (marksRef.current.length === 0) {
      marksRef.current = buildMarks(want);
    }

    function resize() {
      const rect = wrap!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const fine = window.matchMedia("(pointer: fine)").matches;

    function pos(m: Mark, f: Formation, axis: "x" | "y") {
      const { w, h } = sizeRef.current;
      if (f === "crowd") return axis === "x" ? m.crowdX * w : m.crowdY * h;
      if (f === "segments") return axis === "x" ? m.segX * w : m.segY * h;
      return axis === "x" ? m.focusX * w : m.focusY * h;
    }
    function homeFor(m: Mark, formIdx: number, next: number, t: number) {
      const A = FORMATIONS[formIdx]!;
      const B = FORMATIONS[next]!;
      const ax = pos(m, A, "x");
      const ay = pos(m, A, "y");
      const bx = pos(m, B, "x");
      const by = pos(m, B, "y");
      return { hx: ax + (bx - ax) * t, hy: ay + (by - ay) * t };
    }

    function glowTarget(m: Mark, formIdx: number) {
      const f = FORMATIONS[formIdx];
      if (f === "crowd") return 0.05;
      if (f === "segments") {
        return m.seg === 0 ? 0.55 : m.seg === 2 ? 0.66 : 0.24;
      }
      return m.hero ? 1 : 0.06;
    }

    function drawMark(m: Mark) {
      // dim ink → warm accent as attended; hero tips fully to accent (the human)
      const w = Math.min(m.glow, 1);
      const fill = m.hero ? colAccent : lerp3(colInk, colAccent, w);
      const rr = m.hero ? m.r * (1 + m.glow * 0.55) : m.r;
      ctx!.beginPath();
      ctx!.arc(m.x, m.y, rr, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${fill[0]},${fill[1]},${fill[2]},${
        m.hero ? 1 : 0.28 + m.glow * 0.6
      })`;
      ctx!.fill();
      if (m.hero && m.glow > 0.2) {
        ctx!.beginPath();
        ctx!.arc(m.x, m.y, rr + 6 + m.glow * 6, 0, Math.PI * 2);
        ctx!.lineWidth = 1.4;
        ctx!.strokeStyle = `rgba(${colAccent[0]},${colAccent[1]},${colAccent[2]},${
          (m.glow - 0.2) * 0.85
        })`;
        ctx!.stroke();
      }
      void colFaint;
    }

    function drawStatic() {
      const { w, h } = sizeRef.current;
      ctx!.clearRect(0, 0, w, h);
      for (const m of marksRef.current) drawMark(m);
    }

    // STATIC PATH (reduced motion): draw the segments formation once, settled.
    if (reduced) {
      formationRef.current = 1;
      for (const m of marksRef.current) {
        m.x = pos(m, "segments", "x");
        m.y = pos(m, "segments", "y");
        m.glow = glowTarget(m, 1);
      }
      drawStatic();
      setLabel(FORMATION_LABEL.segments);
      ro.disconnect();
      const ro2 = new ResizeObserver(() => {
        resize();
        for (const m of marksRef.current) {
          m.x = pos(m, "segments", "x");
          m.y = pos(m, "segments", "y");
        }
        drawStatic();
      });
      ro2.observe(wrap);
      return () => ro2.disconnect();
    }

    // initialize marks at crowd positions in pixels
    for (const m of marksRef.current) {
      m.x = pos(m, "crowd", "x");
      m.y = pos(m, "crowd", "y");
    }

    let raf = 0;
    let last = performance.now();
    let cycleT = 0;
    const HOLD = 3.4;
    const MORPH = 1.5;
    let morphing = false;
    let lastLabelIdx = -1;

    function setLabelFor(idx: number) {
      if (idx === lastLabelIdx) return;
      lastLabelIdx = idx;
      setLabel(FORMATION_LABEL[FORMATIONS[idx]!]);
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { w, h } = sizeRef.current;

      cycleT += dt;
      if (!morphing && cycleT >= HOLD) {
        morphing = true;
        cycleT = 0;
      }
      let curIdx = formationRef.current;
      let nextIdx = (curIdx + 1) % FORMATIONS.length;
      if (morphing) {
        morphRef.current = Math.min(cycleT / MORPH, 1);
        const t = morphRef.current;
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        morphRef.current = eased;
        setLabelFor(t > 0.5 ? nextIdx : curIdx);
        if (cycleT >= MORPH) {
          morphing = false;
          formationRef.current = nextIdx;
          morphRef.current = 0;
          cycleT = 0;
          curIdx = nextIdx;
          nextIdx = (curIdx + 1) % FORMATIONS.length;
        }
      } else {
        setLabelFor(curIdx);
      }

      const mt = morphing ? morphRef.current : 0;
      const targetForm = morphing ? nextIdx : curIdx;

      const p = pointer.current;
      const repelR = Math.min(w, h) * 0.22;
      const repelR2 = repelR * repelR;

      ctx!.clearRect(0, 0, w, h);

      for (const m of marksRef.current) {
        const { hx, hy } = homeFor(m, curIdx, nextIdx, mt);
        const k = 0.045;
        m.vx += (hx - m.x) * k;
        m.vy += (hy - m.y) * k;

        if (p.active && fine) {
          const dx = m.x - p.x;
          const dy = m.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < repelR2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const force = (1 - d / repelR) * 2.6;
            m.vx += (dx / d) * force;
            m.vy += (dy / d) * force;
          }
        }

        m.vx *= 0.82;
        m.vy *= 0.82;
        m.x += m.vx;
        m.y += m.vy;

        const gt = glowTarget(m, targetForm);
        m.glow += (gt - m.glow) * Math.min(dt * 2.2, 1);

        drawMark(m);
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function onMove(e: PointerEvent) {
      if (!fine) return;
      const rect = canvas!.getBoundingClientRect();
      pointer.current.x = e.clientX - rect.left;
      pointer.current.y = e.clientY - rect.top;
      pointer.current.active = true;
    }
    function onLeave() {
      pointer.current.active = false;
      pointer.current.x = -9999;
      pointer.current.y = -9999;
    }
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <div className="v2-swarm" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="v2-swarm__canvas"
        aria-hidden="true"
        role="presentation"
      />

      <p className="v2-swarm__caption" aria-live="polite">
        <span className="v2-swarm__count">
          {STAND_IN_FOR.toLocaleString("en-IN")}
        </span>
        <span className="v2-swarm__caption-text mono">{label}</span>
      </p>

      {hasPointer && !reduced && (
        <p className="v2-swarm__hint mono" aria-hidden="true">
          stir the field, each one is a person
        </p>
      )}

      {/* static / accessible legend, always in the DOM, never gated on motion */}
      <ul className="v2-swarm__legend mono" aria-label="The 4,820 customers, sorted">
        {SEGMENTS.map((s) => (
          <li key={s.key} className={`v2-swarm__chip v2-swarm__chip--${s.key}`}>
            <span className="v2-swarm__chip-dot" aria-hidden="true" />
            <span className="v2-swarm__chip-label">{s.label}</span>
            <span className="v2-swarm__chip-n">{s.n.toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
