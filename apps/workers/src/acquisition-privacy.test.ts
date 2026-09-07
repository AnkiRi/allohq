import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=process.cwd().endsWith("apps/workers")?process.cwd():process.cwd().endsWith("apps/api")?resolve(process.cwd(),"../workers"):resolve(process.cwd(),"apps/workers");
const worker=readFileSync(resolve(root,"src/workers/shopify-webhook.worker.ts"),"utf8");
const retention=readFileSync(resolve(root,"src/workers/privacy-retention.worker.ts"),"utf8");

test("customer export includes acquisition evidence",()=>{for(const model of ["formIncentiveGrants","consentConfirmations","formExperimentExposures","experimentOrderOutcomes"])assert.match(worker,new RegExp(model))});
test("redaction deletes acquisition identifiers",()=>{for(const model of ["formExperimentExposure.deleteMany","formIncentiveGrant.deleteMany","consentConfirmation.deleteMany","customerTrait.deleteMany","experimentOrderOutcome.deleteMany"])assert.ok(worker.includes(model))});
test("retention removes old experiment exposures and grants",()=>{assert.ok(retention.includes("formExperimentExposure.deleteMany"));assert.ok(retention.includes("formIncentiveGrant.deleteMany"))});
