"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
  useMotionValue,
  type MotionValue,
} from "framer-motion";
import {
  useRef,
  useState,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* ON THE CLOCK, reused from frontend-clock/motion.tsx.               */
/* A single day, pre-dawn → midnight, is one scroll-scrubbed rail.     */
/* useScroll → progress 0..1 → the clock digits, the sweep hand, and   */
/* each event "posting" at its real hour with its lamp warming.        */
/* RE-THEMED for v2: the SkyWash walks value/temperature through the    */
/* active palette's tokens (accent-soft over surface), so it works in   */
/* the two darks AND in light. Lamp warming is token-driven (--lamp).  */
/* Reduced motion / JS-off: a static, fully readable vertical timeline. */
/* ------------------------------------------------------------------ */

const SETTLE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const DAY_START = 4; // 04:00 pre-dawn
const DAY_END = 24; // 00:00 midnight
const DAY_SPAN = DAY_END - DAY_START;

function hourToProgress(hour: number) {
  return (hour - DAY_START) / DAY_SPAN;
}
function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function progressToClock(p: number) {
  const raw = DAY_START + p * DAY_SPAN;
  let h = Math.floor(raw);
  const m = Math.floor((raw - h) * 60);
  if (h >= 24) h -= 24;
  return `${pad(h)}:${pad(m)}`;
}

type RailCtx = { progress: MotionValue<number>; reduce: boolean };
const RailContext = createContext<RailCtx | null>(null);

function useRailProgress(ctx: RailCtx | null): MotionValue<number> {
  const zero = useMotionValue(0);
  return ctx ? ctx.progress : zero;
}

export function DayRail({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
    mass: 0.4,
  });

  return (
    <div className="v2-rail" ref={ref}>
      <RailContext.Provider value={{ progress, reduce }}>
        {children}
      </RailContext.Provider>
    </div>
  );
}

/* SkyWash, the day's light, carried through the palette's own tokens.
   The accent-soft "lamp glow" sweeps brighter at dawn/dusk; the ground stays
   on var(--surface). Disciplined value/temperature, never a rainbow. */
export function SkyWash() {
  const ctx = useContext(RailContext);
  const progress = useRailProgress(ctx);
  const glow = useTransform(progress, [0, 0.18, 0.5, 0.82, 1], [
    0.05, 0.7, 0.25, 0.7, 0.05,
  ]);

  if (!ctx || ctx.reduce) {
    return <div className="v2-sky" aria-hidden="true" />;
  }
  return (
    <motion.div
      className="v2-sky"
      aria-hidden="true"
      style={{ ["--sky-glow" as string]: glow as unknown as string }}
    />
  );
}

export function NowClock() {
  const ctx = useContext(RailContext);
  const progress = useRailProgress(ctx);
  const [time, setTime] = useState(() => progressToClock(0));

  useMotionValueEvent(progress, "change", (v) => {
    if (!ctx || ctx.reduce) return;
    setTime(progressToClock(Math.min(Math.max(v, 0), 1)));
  });

  if (!ctx || ctx.reduce) {
    return (
      <div className="v2-now" aria-hidden="true">
        <span className="v2-now__time mono">04:00 → 00:00</span>
        <span className="v2-now__label mono">a full day, on the clock</span>
      </div>
    );
  }

  return (
    <div className="v2-now" aria-hidden="true">
      <span className="v2-now__time mono">{time}</span>
      <span className="v2-now__label mono">scroll the day forward</span>
    </div>
  );
}

export function DayHand() {
  const ctx = useContext(RailContext);
  const progress = useRailProgress(ctx);
  const top = useTransform(progress, [0, 1], ["2%", "98%"]);
  if (!ctx || ctx.reduce) return null;
  return (
    <motion.div className="v2-hand" aria-hidden="true" style={{ top }}>
      <span className="v2-hand__bead" />
    </motion.div>
  );
}

export function Event({
  hour,
  children,
  className,
}: {
  hour: number;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(RailContext);
  const progress = useRailProgress(ctx);
  const p = hourToProgress(hour);
  const win = 0.085;

  const opacity = useTransform(
    progress,
    [p - win * 2, p - win, p, p + win, p + win * 2.4],
    [0.4, 0.64, 1, 1, 0.8],
  );
  const y = useTransform(progress, [p - win, p, p + win], [16, 0, 0]);
  const lamp = useTransform(progress, [p - win, p, p + win * 2], [0, 1, 0.55]);

  if (!ctx || ctx.reduce) {
    return (
      <div className={`v2-event ${className ?? ""}`} data-static="true">
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={`v2-event ${className ?? ""}`}
      style={{ opacity, y, ["--lamp" as string]: lamp as unknown as string }}
      transition={{ ease: SETTLE }}
    >
      {children}
    </motion.div>
  );
}

/* Rise, calm one-shot reveal for the quiet connective sections. NOT a
   signature; used sparingly. Content always rendered. */
export function Rise({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px -6% 0px" }}
      transition={{ duration: 0.7, ease: SETTLE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ConsoleClock, the small live HH:MM:SS in the hero console bar; ticks each
   second. Reduced motion / JS-off: a static placeholder, never empty. */
export function ConsoleClock() {
  const reduce = useReducedMotion();
  const [t, setT] = useState("00:00:00");
  useEffect(() => {
    if (reduce) return;
    const fmt = () => {
      const d = new Date();
      setT(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    fmt();
    const id = window.setInterval(fmt, 1000);
    return () => window.clearInterval(id);
  }, [reduce]);
  return (
    <span className="v2-console__clock mono" aria-hidden="true">
      {t}
    </span>
  );
}
