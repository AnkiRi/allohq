# Privileged access and authentication policy

## Scope

This policy covers Joon's own production providers: Shopify Partner/Dev
Dashboard, GitHub, Railway, Vercel, DNS, Clerk, Resend, databases and configured
AI providers. Merchant staff permissions inside Joon are a separate product
authorization system.

## Rules

- Every person uses an individual account; shared credentials are prohibited.
- MFA or a passkey is required for every privileged account that supports it.
- Recovery codes are stored in an approved password manager, not email or source
  control.
- Access is least-privilege: production database, secret and deployment access
  is limited to people whose current responsibilities require it.
- Contractors receive time-bounded access and lose it at engagement end.
- Service credentials are scoped, stored as provider secrets and rotated after
  exposure or personnel changes.
- Provider access is reviewed quarterly and documented without exposing account
  recovery material.
- Emergency access must be logged and reviewed after use.

## Minimum production access register

For each provider record: named user, role, reason, MFA state, date granted,
last review and revocation date. Store the completed register outside the public
repository; keep only the evidence checklist here.

