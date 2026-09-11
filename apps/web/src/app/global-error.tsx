"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <main role="alert" style={{ maxWidth: 560, margin: "10vh auto", padding: 24 }}>
          <h1>Something went wrong</h1>
          <p>Please reload the page. If it keeps happening, contact Joon support.</p>
        </main>
      </body>
    </html>
  );
}
