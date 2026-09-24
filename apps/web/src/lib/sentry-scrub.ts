import type { ErrorEvent, Event } from "@sentry/nextjs";

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

type TransactionEvent = Event & { type: "transaction" };

// Tracing is off unless the traces sample rate is raised, and beforeSend
// never sees transactions. Keep timings and span shape; drop request data,
// span attributes, query strings, addresses and opaque path tokens.
const safeSpanText = (value: string | undefined) => value
  ?.replace(/[?#]\S*/g, "")
  .replace(/'(?:[^']|'')*'/g, "'?'")
  .replace(/[A-Z0-9._%+-][A-Z0-9._%+'-]*@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email]")
  .replace(/\/(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{20,}(?=\/|\s|$)/g, "/:id");

export function scrubSentryTransaction(event: TransactionEvent): TransactionEvent {
  const trace = event.contexts?.trace;
  return {
    type: "transaction",
    event_id: event.event_id,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    platform: event.platform,
    environment: event.environment,
    release: event.release,
    transaction: safeSpanText(event.transaction),
    transaction_info: event.transaction_info,
    contexts: trace ? { trace: {
      trace_id: trace.trace_id,
      span_id: trace.span_id,
      parent_span_id: trace.parent_span_id,
      op: trace.op,
      status: trace.status,
      origin: trace.origin,
    } } : undefined,
    spans: event.spans?.map((span) => ({
      trace_id: span.trace_id,
      span_id: span.span_id,
      parent_span_id: span.parent_span_id,
      op: span.op,
      description: safeSpanText(span.description),
      status: span.status,
      origin: span.origin,
      start_timestamp: span.start_timestamp,
      timestamp: span.timestamp,
      data: {},
    })),
    measurements: event.measurements,
    tags: Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key]) => ["service", "runtime"].includes(key))),
  };
}
