import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";

const SAFE_TAGS = new Set(["route", "service", "runtime"]);
const safeFilename = (value: string | undefined) => {
  if (!value) return value;
  try {
    new URL(value);
    return "remote-frame";
  } catch {
    return value.split(/[\\/]/).pop()?.split(/[?#]/)[0];
  }
};

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    exception: event.exception ? { values: event.exception.values?.map((value) => ({
      type: value.type,
      value: "Application error",
      stacktrace: value.stacktrace ? { frames: value.stacktrace.frames?.map((frame) => ({
        filename: safeFilename(frame.filename),
        function: frame.function,
        lineno: frame.lineno,
        colno: frame.colno,
        in_app: frame.in_app,
      })) } : undefined,
    })) } : undefined,
    tags: Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key]) => SAFE_TAGS.has(key))),
  };
}

export function initObservability(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    beforeSend: sanitizeSentryEvent,
  });
  return true;
}

export function captureApiError(error: unknown, path: string): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(error, { tags: { route: path } });
}

export function shouldCaptureApiError(code: string | undefined, httpStatus: number | undefined): boolean {
  return code === "INTERNAL_SERVER_ERROR" || (httpStatus !== undefined && httpStatus >= 500);
}
