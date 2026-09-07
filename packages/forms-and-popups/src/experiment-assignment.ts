import { createHash } from "node:crypto";
export type FormExperimentArm = "CONTROL" | "A" | "B";
export function assignFormExperimentArm(input: { experimentId: string; assignmentSalt: string; visitorId: string; controlRatio: number; splitRatio: number }): FormExperimentArm {
  const digest=createHash("sha256").update(`${input.experimentId}:${input.assignmentSalt}:${input.visitorId}`).digest();
  const bucket=digest.readUInt32BE(0)/0x1_0000_0000;
  const control=Math.max(0,Math.min(0.5,input.controlRatio));
  if(bucket<control)return "CONTROL";
  return (bucket-control)/(1-control)<Math.max(0,Math.min(1,input.splitRatio))?"A":"B";
}
