export function eventTriggerJobId(automationId: string, customerId: string, instance: string): string {
  return `${automationId}-${customerId}-${instance}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}
