"use client";

import { useState, useEffect } from "react";
import { useMotionValue, useTransform, animate } from "framer-motion";

export function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 1.2,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) =>
    prefix + v.toLocaleString("en-US", { maximumFractionDigits: 0 }) + suffix
  );
  const [display, setDisplay] = useState(prefix + "0" + suffix);

  useEffect(() => {
    const controls = animate(motionVal, value, { duration, ease: "easeOut" });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [value, duration, motionVal, rounded]);

  return <span className={className}>{display}</span>;
}
