import assert from "node:assert/strict";
import test from "node:test";
import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { SesProvisioningService } from "./ses-admin";

test("SES provisioning returns the DNS values consumed by the generic domain UI", async () => {
  delete process.env["SES_OPERATIONAL_FROM_EMAIL"];
  delete process.env["SES_FROM_EMAIL"];
  process.env["AWS_ACCOUNT_ID"] = "123456789012";
  process.env["SES_EVENT_TOPIC_ARN"] = "arn:aws:sns:ap-south-1:123456789012:joon-ses";
  process.env["SES_STANDARD_REPUTATION_POLICY"] = "standard";
  const commands: string[] = [];
  const client = { send: async (command: object) => { commands.push(command.constructor.name); return command.constructor.name === "CreateEmailIdentityCommand" ? { DkimAttributes: { Tokens: ["one", "two", "three"] } } : {}; } } as unknown as SESv2Client;
  const result = await new SesProvisioningService(client).provisionStore("store-1", "mail.example.com");
  assert.deepEqual(result.dkimTokens, ["one", "two", "three"]);
  assert.equal(result.mailFromDomain, "mail.mail.example.com");
  assert.ok(commands.includes("CreateTenantCommand"));
  assert.ok(commands.includes("UpdateReputationEntityPolicyCommand"));
  assert.equal(commands.filter((name) => name === "CreateConfigurationSetCommand").length, 2);
  assert.equal(commands.filter((name) => name === "CreateConfigurationSetEventDestinationCommand").length, 2);
  assert.equal(commands.filter((name) => name === "CreateTenantResourceAssociationCommand").length, 3);
});

test("SES provisioning reconciles an existing event destination", async () => {
  delete process.env["SES_OPERATIONAL_FROM_EMAIL"];
  delete process.env["SES_FROM_EMAIL"];
  process.env["AWS_ACCOUNT_ID"] = "123456789012";
  process.env["SES_EVENT_TOPIC_ARN"] = "arn:aws:sns:ap-south-1:123456789012:joon-ses";
  process.env["SES_STANDARD_REPUTATION_POLICY"] = "standard";
  const commands: string[] = [];
  const client = { send: async (command: object) => {
    const name = command.constructor.name;
    commands.push(name);
    if (name === "CreateConfigurationSetEventDestinationCommand") throw Object.assign(new Error("exists"), { name: "AlreadyExistsException" });
    if (name === "CreateEmailIdentityCommand") return { DkimAttributes: { Tokens: ["one"] } };
    return {};
  } } as unknown as SESv2Client;
  await new SesProvisioningService(client).provisionStore("store-1", "mail.example.com");
  assert.equal(commands.filter((name) => name === "UpdateConfigurationSetEventDestinationCommand").length, 2);
});
