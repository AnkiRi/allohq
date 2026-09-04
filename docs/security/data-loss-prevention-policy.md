# Data loss prevention policy

Owner: Joon security owner  
Review cadence: quarterly and after every security incident  
Applies to: production customer, merchant, staff, commerce, delivery and behavioral data

## Purpose

Joon prevents protected data from being exposed to the wrong merchant, person,
environment or service. Production data may be processed only to operate the
merchant-authorized email product described in Joon's Privacy Policy and DPA.

## Data-minimization boundary

- Shopify v1 requests customer name and email, not phone or customer address.
- The storefront pixel removes direct contact, address and payment fields before
  transmission or persistence.
- Anonymous behavior cannot trigger email until it is resolved to a consented
  customer inside the same store.
- Production data must never be copied to development, demos or staging. Test
  environments use generated or explicitly created test records.
- New fields and subprocessors require a documented purpose, retention period
  and security review before collection begins.

## Technical controls

- Every authenticated request is bound to a verified workspace and store.
- Shopify ID tokens, OAuth callbacks and webhooks are cryptographically verified.
- Shopify credentials are encrypted at rest and never placed in queue payloads.
- TLS is required for all public production endpoints.
- Protected-data API access emits an audit event containing actor, tenant,
  action and time, but not the protected payload.
- Application logs must not contain access tokens, passwords, message bodies,
  customer lists, full email addresses, phone numbers or postal addresses.
- Bulk exports are restricted to explicitly authorized roles and must emit an
  audit record. Customer-list export remains disabled until that role boundary
  is implemented and tested.
- Secrets must be stored in provider secret managers, never source control.
- Privacy redaction and retention jobs remove data after the documented purpose
  expires.

## Operational controls

- Production provider access is individual, MFA-protected and need-to-know.
- Shared accounts and shared passwords are prohibited.
- Access is reviewed quarterly and removed immediately when a person's work no
  longer requires it.
- Downloads of production data to personal devices are prohibited.
- Support investigation uses identifiers and aggregate counts where possible;
  access to a customer record must be necessary, time-bounded and auditable.
- Suspected disclosure, cross-tenant access or secret exposure invokes the
  incident-response plan immediately.

## Review evidence

Maintain the following without including secrets or customer payloads:

- Current access list for each production provider.
- MFA status screenshots or provider exports.
- A sanitized protected-data audit event.
- Secret-scanning and dependency-audit results.
- Retention-worker result and privacy-webhook test evidence.
- Backup configuration and latest restore-drill record.

