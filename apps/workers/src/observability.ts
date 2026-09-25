import * as Sentry from "@sentry/node";
import type { ErrorEvent, Event } from "@sentry/node";
import type { Job } from "bullmq";

const SAFE_TAGS = new Set(["queue", "job_name", "attempts_made", "service", "runtime"]);
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
      value: "Worker error",
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

type TransactionEvent = Event & { type: "transaction" };

// Tracing is off unless SENTRY_TRACES_SAMPLE_RATE is raised, and beforeSend
// never sees transactions. Keep timings and span shape; drop request data,
// span attributes, query strings, addresses and opaque path tokens.
const safeSpanText = (value: string | undefined) => value
  ?.replace(/[?#]\S*/g, "")
  .replace(/'(?:[^']|'')*'/g, "'?'")
  .replace(/[A-Z0-9._%+-][A-Z0-9._%+'-]*@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[email]")
  .replace(/\/(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{20,}(?=\/|\s|$)/g, "/:id");

export function sanitizeSentryTransaction(event: TransactionEvent): TransactionEvent {
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
    beforeSendTransaction: sanitizeSentryTransaction,
  });
  return true;
}

export function captureWorkerFailure(input: { queue: string; jobName: string; attemptsMade: number }): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(new Error("Critical worker job failed"), {
    tags: {
      queue: input.queue,
      job_name: input.jobName,
      attempts_made: String(input.attemptsMade),
    },
  });
}

export async function flushObservability(timeoutMs = 1_500): Promise<boolean> {
  if (!process.env.SENTRY_DSN) return true;
  return Sentry.flush(timeoutMs);
}

export interface FailureObservable {
  name: string;
  on(event: "failed", listener: (job: Job | undefined, error: Error, previous?: string) => void): unknown;
  off(event: "failed", listener: (job: Job | undefined, error: Error, previous?: string) => void): unknown;
}

const EXPECTED_FAILURES = [
  /capacity unavailable/i,
  /deferred:/i,
  /quiet hours/i,
  /warmup/i,
  /awaiting event reconciliation/i,
];

export function shouldCaptureWorkerFailure(job: Job | undefined, error: Error): boolean {
  const terminal = !job || job.attemptsMade >= Math.max(1, Number(job.opts.attempts ?? 1));
  // A delivery chunk that has failed for good always alerts, whatever the
  // message says: capacity refusals used to fail chunks under an "expected"
  // message, and 95% of a campaign went unsent without anyone being told.
  if (job?.name === "deliver-chunk") return terminal;
  if (EXPECTED_FAILURES.some((pattern) => pattern.test(error.message))) return false;
  return terminal;
}

export function monitorWorkerFailures(workers: readonly FailureObservable[]): () => void {
  const listeners = workers.map((worker) => {
    const listener = (job: Job | undefined, error: Error) => {
      if (!shouldCaptureWorkerFailure(job, error)) return;
      captureWorkerFailure({
      queue: worker.name,
      jobName: job?.name ?? "unknown",
      attemptsMade: job?.attemptsMade ?? 0,
      });
    };
    worker.on("failed", listener);
    return { worker, listener };
  });
  return () => {
    for (const { worker, listener } of listeners) worker.off("failed", listener);
  };
}
