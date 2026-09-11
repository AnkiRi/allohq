export function nextSesWarmupResume(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 5, 0, 0);
  return next;
}

export function nextSesWarmupDelay(now = new Date()): number {
  return Math.max(1_000, nextSesWarmupResume(now).getTime() - now.getTime());
}
