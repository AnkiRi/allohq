import { CreateConfigurationSetCommand, CreateConfigurationSetEventDestinationCommand, CreateEmailIdentityCommand, CreateTenantCommand, CreateTenantResourceAssociationCommand, GetAccountCommand, GetEmailIdentityCommand, PutEmailIdentityMailFromAttributesCommand, UpdateConfigurationSetEventDestinationCommand, UpdateReputationEntityPolicyCommand, SESv2Client, type EventType } from "@aws-sdk/client-sesv2";
import { sesSafeTag } from "./channels/email/ses";

export class SesProvisioningService {
  constructor(private readonly client: { send(command: unknown): Promise<any> } = new SESv2Client({ region: process.env["AWS_SES_REGION"] || "ap-south-1" }) as any) {}
  async provisionStore(storeId: string, domain: string) {
    const region = process.env["AWS_SES_REGION"] || "ap-south-1";
    const account = process.env["AWS_ACCOUNT_ID"];
    const topic = process.env["SES_EVENT_TOPIC_ARN"];
    const reputationPolicy = process.env["SES_STANDARD_REPUTATION_POLICY"];
    if (!/^\d{12}$/.test(account || "")) throw new Error("AWS_ACCOUNT_ID must be a 12-digit account id");
    if (!topic?.startsWith(`arn:aws:sns:${region}:${account}:`)) throw new Error("SES_EVENT_TOPIC_ARN must belong to the configured SES region and account");
    if (!reputationPolicy) throw new Error("SES_STANDARD_REPUTATION_POLICY must be confirmed by AWS before tenant provisioning");
    const ensure = async (command: unknown) => { try { return await this.client.send(command); } catch (error) { if ((error as { name?: string }).name !== "AlreadyExistsException") throw error; return {}; } };
    const suffix = sesSafeTag(storeId).slice(0, 12);
    const tenantName = `joon-${suffix}`;
    const configurationSets = [`joon-triggered-${suffix}`, `joon-broadcast-${suffix}`];
    const eventDestination = { Enabled: true, MatchingEventTypes: ["SEND", "REJECT", "BOUNCE", "COMPLAINT", "DELIVERY", "OPEN", "CLICK", "RENDERING_FAILURE", "DELIVERY_DELAY"] as EventType[], SnsDestination: { TopicArn: topic } };
    await ensure(new CreateTenantCommand({ TenantName: tenantName }));
    await this.client.send(new UpdateReputationEntityPolicyCommand({ ReputationEntityType: "RESOURCE", ReputationEntityReference: `tenant/${tenantName}`, ReputationEntityPolicy: reputationPolicy }));
    for (const ConfigurationSetName of configurationSets) {
      await ensure(new CreateConfigurationSetCommand({ ConfigurationSetName }));
      try {
        await this.client.send(new CreateConfigurationSetEventDestinationCommand({ ConfigurationSetName, EventDestinationName: "joon-events", EventDestination: eventDestination }));
      } catch (error) {
        if ((error as { name?: string }).name !== "AlreadyExistsException") throw error;
        await this.client.send(new UpdateConfigurationSetEventDestinationCommand({ ConfigurationSetName, EventDestinationName: "joon-events", EventDestination: eventDestination }));
      }
      await ensure(new CreateTenantResourceAssociationCommand({ TenantName: tenantName, ResourceArn: `arn:aws:ses:${region}:${account}:configuration-set/${ConfigurationSetName}` }));
    }
    const identity = await ensure(new CreateEmailIdentityCommand({ EmailIdentity: domain, DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" } })) as { DkimAttributes?: { Tokens?: string[] } };
    await ensure(new CreateTenantResourceAssociationCommand({ TenantName: tenantName, ResourceArn: `arn:aws:ses:${region}:${account}:identity/${domain}` }));
    const operationalFrom = process.env["SES_OPERATIONAL_FROM_EMAIL"] || process.env["SES_FROM_EMAIL"];
    const operationalAddress = operationalFrom?.match(/<([^>]+)>/)?.[1] || operationalFrom;
    const operationalIdentity = operationalAddress?.split("@")[1];
    if (operationalIdentity && operationalIdentity !== domain) {
      await ensure(new CreateTenantResourceAssociationCommand({ TenantName: tenantName, ResourceArn: `arn:aws:ses:${region}:${account}:identity/${operationalIdentity}` }));
    }
    const mailFromDomain = `mail.${domain}`;
    await this.client.send(new PutEmailIdentityMailFromAttributesCommand({ EmailIdentity: domain, MailFromDomain: mailFromDomain, BehaviorOnMxFailure: "REJECT_MESSAGE" }));
    const currentIdentity = identity.DkimAttributes?.Tokens?.length ? identity : await this.domainStatus(domain);
    return { tenantName, configurationSets, identity: domain, mailFromDomain, dkimTokens: currentIdentity.DkimAttributes?.Tokens || [] };
  }
  async domainStatus(domain: string) { return this.client.send(new GetEmailIdentityCommand({ EmailIdentity: domain })); }
  async maximumSendRate() { const account = await this.client.send(new GetAccountCommand({})); return account.SendQuota?.MaxSendRate || 1; }
}
