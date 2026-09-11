import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";
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
  if (EXPECTED_FAILURES.some((pattern) => pattern.test(error.message))) return false;
  if (!job) return true;
  const attempts = Math.max(1, Number(job.opts.attempts ?? 1));
  return job.attemptsMade >= attempts;
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
