"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const prevPath = useRef(pathname);

  useEffect(() => {
    // Route changed — complete the bar
    if (prevPath.current !== pathname) {
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }
    prevPath.current = pathname;
  }, [pathname, searchParams]);

  // Listen for link clicks to start the progress bar
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href === pathname) return;

      // Start progress
      setVisible(true);
      setProgress(20);

      clearInterval(timerRef.current);
      let p = 20;
      timerRef.current = setInterval(() => {
        p += Math.random() * 10;
        if (p >= 90) {
          clearInterval(timerRef.current);
          p = 90;
        }
        setProgress(p);
      }, 150);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clearInterval(timerRef.current);
    };
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5">
      <div
        className="h-full bg-secondary transition-all duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
