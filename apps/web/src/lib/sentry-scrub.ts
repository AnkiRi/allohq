import type { ErrorEvent } from "@sentry/nextjs";

const safeFilename = (value: string | undefined) => {
  if (!value) return value;
  try {
    new URL(value);
    return "remote-frame";
  } catch {
    return value.split(/[\\/]/).pop()?.split(/[?#]/)[0];
  }
};

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
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
    tags: Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key]) => ["service", "runtime"].includes(key))),
  };
}
