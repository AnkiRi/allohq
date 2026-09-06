# Joon onboarding input audit

Audited on 6 September 2026 against the production code path.

## Decision summary

Joon onboarding should collect only information that is needed before the first useful draft or before the first safe send. Advanced operator preferences remain available after onboarding.

Two former steps have been removed from the visible sequence:

- Model selection: real, but not a useful first-run merchant decision. The safe default is used and the complete model harness remains under Settings.
- Co-pilot selection: not a choice in email v1. Co-pilot is the enforced server policy. The four safe defaults are persisted automatically.

## Complete input matrix

| Input | Persisted in | Actual effect today | Editable later | Decision |
|---|---|---|---|---|
| Brand-guideline document | `BrandProfile.brandDocument` | LLM analysis extracts voice, vocabulary, identity and samples. The raw document is also included in later brand context. | Brand Voice | Keep, optional |
| Business category | `Store.storeCategory` | Selects starter segment recipes, category benchmarks and category-level analysis. | Settings, Business profile | Keep |
| Current email platform | `Store.currentEmailPlatform` | Shows the relevant migration-assistance workflow only. It never implies that external data was imported. | Setup readiness until a request is made | Keep, label as migration context |
| From name | `BrandProfile.fromName` | Used by campaign and journey delivery. Required by readiness. | Brand Voice | Keep, required before live send |
| From email | `BrandProfile.fromEmail` | Used by campaign and journey delivery. Its domain must match the verified sender domain in live mode. | Brand Voice | Keep, required before live send |
| Reply-to email | `BrandProfile.replyToEmail` | Sent to the email provider for campaigns and journeys. | Brand Voice | Keep, optional |
| Business postal address | `Store.address` | Rendered into compliant email footers. | Settings, Business profile | Keep, required before live send |
| Formality | `BrandProfile.toneAttributes.formality` | Passed to every generated campaign and generated journey email. | Brand Voice | Keep |
| Energy | `BrandProfile.toneAttributes.energy` | Passed to every generated campaign and generated journey email. | Brand Voice | Keep |
| Warmth | `BrandProfile.toneAttributes.warmth` | Passed to every generated campaign and generated journey email. | Brand Voice | Keep |
| Humor | `BrandProfile.toneAttributes.humor` | Passed as a semantic four-level choice to every email-generation prompt. | Brand Voice | Keep. It is a style choice, not a learned performance claim |
| Words to avoid | `BrandProfile.vocabulary.bannedWords` | Included in generation prompts and hard-checked before campaign approval or journey activation. | Brand Voice | Keep |
| Visual aesthetic | `BrandVisualProfile.aestheticClassification` | Selects creative layout and styling direction for generated emails. | Brand Voice, Visual design | Keep |
| Primary background | `brandDesignTokens.primaryBackground` | Controls the email page background. | Brand Voice, Visual design | Keep, now wired |
| Accent color | `brandDesignTokens.accentColor` | Controls secondary accents and contributes to CTA palette. | Brand Voice, Visual design | Keep |
| CTA background | `brandDesignTokens.ctaBackground` | Controls the primary email CTA color. | Brand Voice, Visual design | Keep |
| CTA text color | `brandDesignTokens.ctaTextColor` | Controls text on the primary CTA. | Brand Voice, Visual design | Keep, now wired |
| Primary text color | `brandDesignTokens.textPrimary` | Controls email heading ink. | Brand Voice, Visual design | Keep, now wired |
| Secondary text color | `brandDesignTokens.textSecondary` | Controls email body copy. | Brand Voice, Visual design | Keep, now wired |
| Logo URL | `BrandVisualProfile.logoUrl` | Used in rendered email headers with a text-wordmark fallback. | Brand assets / Brand Voice | Keep |
| Heading font | `brandDesignTokens.headingFont` | Prepended to an email-safe fallback stack. Unsupported email clients use the fallback. | Brand Voice, Visual design | Keep with fallback caveat |
| Body font | `brandDesignTokens.bodyFont` | Prepended to an email-safe fallback stack. Unsupported email clients use the fallback. | Brand Voice, Visual design | Keep with fallback caveat |
| Maximum emails per customer per week | active `Guardrail.max_sends_per_week` | Checked during dry-run and again immediately before campaign and journey delivery. | Settings, Guardrails | Keep |
| Maximum discount percentage | active `Guardrail.max_discount` | Enforced during both conversational campaign creation paths and checked before creating a Shopify offer. | Settings, Guardrails | Keep |
| Quiet-hours start and end | active `Guardrail.quiet_hours` | Checked using the merchant timezone during audience resolution and immediately before delivery. | Settings, Guardrails | Keep |
| Skip guardrail setup | no rules created | Uses system safety defaults. | Settings, Guardrails | Keep, but describe the consequence clearly |
| Sending domain | `SenderDomain` | Provider creates DNS requirements. Live delivery is blocked until the exact From domain is verified. | Setup readiness | Keep in readiness because it requires external DNS work |
| Migration items | `MigrationAssistanceRequest.requestedItems` | Creates a durable, deduplicated support request. It does not pretend to import data automatically. | Setup readiness | Keep when an existing platform was selected |

## Inputs intentionally not collected during onboarding

### AI model and model harness

The model setting is implemented and changes real routing for strategy, creative, analysis, classification, evaluation, support and orchestration workloads. It belongs in Settings because a new merchant should not need to understand model cost and fallback chains before seeing Joon work.

### Creative intensity

Text-heavy, balanced and visual-heavy modes change generated email structure and image use. This remains in Settings and Brand Voice. The visual-aesthetic review already gives onboarding enough creative direction without adding another overlapping decision.

### Sending frequency label

The old minimal/balanced/frequent selector was only stored; it did not enforce a cadence. It has been removed from the visible Brand Voice settings. Merchants now use the enforceable numeric weekly cap and quiet hours instead.

### Channel preference

Email v1 cannot learn or act on channel preference. SMS, WhatsApp and RCS are not shown as onboarding choices.

## Correct first-run sequence

1. Shopify verifies the store and Joon account.
2. Joon syncs catalog, customers, orders, consent and storefront tracking registration.
3. Merchant reviews business identity, sender identity, brand voice and email design.
4. Joon persists the fixed co-pilot safety policy without asking a fake question.
5. Merchant chooses enforceable communication and discount limits.
6. Joon presents the store analysis and launch-readiness state.
7. Merchant may enter the dashboard while DNS and first storefront observation remain pending. Setup readiness stays available in the sidebar and as a dashboard warning.

## Attentive comparison

Attentive currently uses its Shopify-embedded page primarily as a sales, terms and launch handoff, then gates new accounts behind a demo. That fits a sales-led SMS product but is not the right constraint for Joon's self-serve email launch.

The useful pattern to retain is:

- a compact and trustworthy Shopify surface;
- explicit terms, fee and data-access context;
- configuration in a full-width external workspace;
- a clear return path from Shopify.

Joon should not copy Attentive's wider permissions for email v1. Phone, address, customer writes, theme scripts and SMS-related access should be requested only when a shipped feature needs them. Joon already requests browsing behavior, catalog, recent order history, discounts and Web Pixel access for the decision and email layers it actually operates.

## Honest product claims

- Brand tone is applied consistently to generated work.
- Tone is not yet autonomously learned from outcomes.
- Banned vocabulary is enforced at approval and activation.
- Guardrails are runtime safety controls, not preference labels.
- Visual settings alter rendered emails, with email-client font fallbacks.
- Co-pilot is the email-v1 operating policy, not a selectable autonomy tier.
