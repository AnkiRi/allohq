export function automationContinuationJobId(input: {
  automationId: string;
  executionId: string;
  nextNodeIndex: number;
}): string {
  return `continue-${input.automationId}-${input.executionId}-${input.nextNodeIndex}`
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}
