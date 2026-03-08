/**
 * Trigger detection for popup display.
 */
export function setupTrigger(
  trigger: string,
  config: { scrollPercent?: number; delayMs?: number; pageUrl?: string },
  onTrigger: () => void
): () => void {
  // Check page URL filter
  if (config.pageUrl && !matchPageUrl(config.pageUrl)) {
    return () => {};
  }

  let cleanup = () => {};

  switch (trigger) {
    case "exit_intent": {
      const handler = (e: MouseEvent) => {
        if (e.clientY <= 5) {
          onTrigger();
          document.removeEventListener("mouseout", handler);
        }
      };
      document.addEventListener("mouseout", handler);
      cleanup = () => document.removeEventListener("mouseout", handler);
      break;
    }

    case "scroll": {
      const percent = config.scrollPercent ?? 50;
      const handler = () => {
        const scrolled = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
        if (scrolled >= percent) {
          onTrigger();
          window.removeEventListener("scroll", handler);
        }
      };
      window.addEventListener("scroll", handler, { passive: true });
      cleanup = () => window.removeEventListener("scroll", handler);
      break;
    }

    case "timer": {
      const delay = config.delayMs ?? 5000;
      const timer = setTimeout(onTrigger, delay);
      cleanup = () => clearTimeout(timer);
      break;
    }

    case "page_load": {
      // Trigger after a small delay to let page settle
      const timer = setTimeout(onTrigger, 500);
      cleanup = () => clearTimeout(timer);
      break;
    }
  }

  return cleanup;
}

function matchPageUrl(pattern: string): boolean {
  const path = window.location.pathname;
  // Simple glob matching — * matches any segment
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(path);
}
