"use client";

import { useEffect, useRef, useState } from "react";

export function AmbientField({ className = "" }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(Boolean(entry?.isIntersecting)),
      { rootMargin: "80px" }
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={root}
      className={`a2-field ${active ? "is-active" : ""} ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: 38 }, (_, index) => (
        <i key={index} className={index % 11 === 0 ? "is-silent" : ""} />
      ))}
    </div>
  );
}
