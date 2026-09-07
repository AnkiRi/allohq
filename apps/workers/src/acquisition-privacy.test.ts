import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@allohq/database";
import { redactAcquisitionEvidence } from "./acquisition-privacy";

test("redaction executes each acquisition deletion using linked submissions",async()=>{
  const calls:Array<[string,unknown]>=[];
  const method=(name:string,result:unknown={count:1})=>async(args:unknown)=>{calls.push([name,args]);return result};
  const tx={formSubmission:{findMany:method("submissions",[{id:"s1"},{id:"s2"}])},formExperimentExposure:{deleteMany:method("exposures")},formIncentiveGrant:{deleteMany:method("grants")},consentConfirmation:{deleteMany:method("confirmations")},customerTrait:{deleteMany:method("traits")},experimentOrderOutcome:{deleteMany:method("outcomes")}} as unknown as Prisma.TransactionClient;
  const result=await redactAcquisitionEvidence(tx,"customer-1");
  assert.deepEqual(result.submissionIds,["s1","s2"]);
  assert.deepEqual(calls.map(([name])=>name),["submissions","exposures","grants","confirmations","traits","outcomes"]);
  assert.deepEqual(calls[1]?.[1],{where:{submissionId:{in:["s1","s2"]}}});
});
