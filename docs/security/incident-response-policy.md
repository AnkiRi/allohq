# Security incident response policy

Incident commander: Joon security owner  
Technical lead: designated production operator  
Security contact: security incident contact published in the support process

## When this policy starts

Start an incident immediately for suspected unauthorized access, cross-merchant
data exposure, leaked credentials, malicious activity, unapproved or duplicate
messages, loss of production data, or a material outage affecting privacy or
delivery safety. Certainty is not required.

## Severity

- **SEV-1:** Confirmed or likely protected-data exposure, account takeover,
  cross-tenant access, or unapproved/duplicate customer sends.
- **SEV-2:** Contained security weakness, sustained production outage, failed
  suppression/consent control, or loss of recoverability without known exposure.
- **SEV-3:** Low-impact event with no protected-data exposure and a reliable
  workaround.

## Response

1. Record discovery time, reporter, affected service and initial facts.
2. Contain: pause the affected store or use the global delivery kill switch;
   disable the endpoint/job; revoke sessions; rotate suspected credentials.
3. Preserve evidence: relevant request IDs, deployment IDs, sanitized logs and
   configuration history. Do not copy customer payloads into the incident log.
4. Determine affected merchants, records, actions and time range.
5. Eradicate the cause and review adjacent paths for the same failure class.
6. Recover from a known-good deployment or backup and verify tenant isolation,
   consent, suppression and delivery idempotency before reopening.
7. Notify affected merchants, Shopify, providers and authorities when required
   by contract or applicable law. Legal notification timing is assessed from
   the first confirmed facts, not delayed until engineering is complete.
8. Within five business days, record root cause, impact, response timeline,
   corrective actions, owners and deadlines.

## Communications

- Only the incident commander or delegate communicates externally.
- State known facts, uncertainty, impact and next update time; do not speculate.
- Never send secrets or raw customer data through chat, email or tickets.
- Shopify security or review contacts and affected merchants receive the facts
  required for them to meet their own obligations.

## Readiness exercise

Run a tabletop exercise before the protected-customer-data submission and at
least annually. The initial scenario is: a production log is found to contain
customer email addresses. Verify detection, containment, credential decisions,
scope analysis, notification decision, remediation and evidence preservation.
Record the exercise in `docs/security/evidence/incident-tabletop.md`.

