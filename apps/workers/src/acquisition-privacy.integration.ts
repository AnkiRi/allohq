import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { redactAcquisitionEvidence } from "./acquisition-privacy";

const databaseUrl = process.env["TEST_DATABASE_URL"];

test("acquisition redaction removes linked evidence in Postgres", async () => {
  assert.ok(
    databaseUrl,
    "TEST_DATABASE_URL must point to an isolated, disposable Postgres database",
  );
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let workspaceId: string | undefined;
  try {
    const workspace = await db.workspace.create({
      data: { name: "Privacy integration", slug: `privacy-${suffix}` },
    });
    workspaceId = workspace.id;
    const store = await db.store.create({
      data: {
        workspaceId,
        platform: "shopify",
        shopDomain: `privacy-${suffix}.myshopify.com`,
        accessToken: "isolated-test-token",
      },
    });
    const customer = await db.customer.create({
      data: {
        storeId: store.id,
        externalId: `customer-${suffix}`,
        email: `privacy-${suffix}@example.com`,
        tags: [],
      },
    });
    const form = await db.form.create({
      data: {
        storeId: store.id,
        name: "Privacy test form",
        fields: [],
      },
    });
    const submission = await db.formSubmission.create({
      data: { formId: form.id, customerId: customer.id, data: {} },
    });
    const experiment = await db.formExperiment.create({
      data: {
        storeId: store.id,
        formId: form.id,
        name: "Privacy experiment",
        assignmentSalt: `salt-${suffix}`,
      },
    });
    await Promise.all([
      db.formExperimentExposure.create({
        data: {
          experimentId: experiment.id,
          visitorId: `visitor-${suffix}`,
          variant: "A",
          submissionId: submission.id,
        },
      }),
      db.formIncentiveGrant.create({
        data: {
          formId: form.id,
          customerId: customer.id,
          kind: "discount",
          label: "10% off",
        },
      }),
      db.consentConfirmation.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          channel: "email",
          submissionId: submission.id,
          tokenHash: `hash-${suffix}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
      db.customerTrait.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          key: `preference-${suffix}`,
          value: "skin-care",
          source: "form",
          formId: form.id,
        },
      }),
    ]);

    await db.$transaction((tx) => redactAcquisitionEvidence(tx, customer.id));

    const remaining = await Promise.all([
      db.formExperimentExposure.count({ where: { submissionId: submission.id } }),
      db.formIncentiveGrant.count({ where: { customerId: customer.id } }),
      db.consentConfirmation.count({ where: { customerId: customer.id } }),
      db.customerTrait.count({ where: { customerId: customer.id } }),
    ]);
    assert.deepEqual(remaining, [0, 0, 0, 0]);
  } finally {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  }
});
