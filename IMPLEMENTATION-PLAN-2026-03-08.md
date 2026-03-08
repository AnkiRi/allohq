# Master Plan V2.0 Implementation — Phase-wise Plan

## Context

AlloHQ is pivoting from "marketing automation tool" to "autonomous relationship platform." The ALLOHQ-MASTER-PLAN.md defines 7 V1 sprints (now 16 weeks after splitting Sprint 3). This plan maps each sprint to concrete file-level changes, identifying what we already have, what's new, and what needs modification.

**Architectural shift:** From tool-driven AI assistant → state-driven autonomous system (state updates → policy decides → orchestrator executes → analytics close loop).

---

## Gap Analysis Summary

| Area | Have | Need | Gap |
|------|------|------|-----|
| Packages | 12 (6 production, 4 stubs, 2 infra) | 21 (9 new packages) | 9 new packages |
| Database models | ~45 | ~60 | ~15 new models |
| Workers | 14 (16 queues) | 31 | 17 new workers |
| API routers | 11 (63+ procedures) | ~16 | 5 new routers |
| Web pages | 15 sections | ~20 | Major redesigns + new pages |

### What We Already Have (KEEP/EXTEND)
- `packages/database/` — Solid foundation, extend with new models
- `packages/messaging/` — Production-ready multi-channel (email/SMS/WhatsApp/RCS, Twilio+Gupshup)
- `packages/email-builder/` — 14+ blocks, HTML rendering, merge tags (to be extended with MJML path)
- `packages/ecommerce-integrations/` — Full Shopify sync/webhooks/OAuth
- `packages/customer-intelligence/` — RFM, LTV, brand voice, AI content gen, image gen (Flux/DALL-E/Unsplash)
- `packages/agent-core/` — Multi-agent system, 50+ tools
- `packages/agent-brain/` — Embeddings, RAG, context assembly
- All 14 existing workers (sync, rfm, send, automation-runner, shopify-webhook, trigger-listener, etc.)
- All 11 existing routers
- Full web dashboard with glassmorphic UI

### What's New (BUILD)
- `packages/customer-state/` — Unified Customer State Engine
- `packages/autonomy-engine/` — Merchant Trust + Approval System
- `packages/communication-governor/` — Anti-Spam + Channel Coordination
- `packages/campaign-engine/` — Proactive Campaign Generation
- `packages/creative-engine/` — MJML Templates + AI Visual/Graphic Generation
- `packages/merchant-copilot/` — Merchant-Facing Intelligence
- `packages/journey-orchestrator/` — Adaptive Journeys (replaces linear automations)
- `packages/conversation-engine/` — Customer-Facing Support (V2)
- Rebuild: `packages/analytics/`, `packages/forms-and-popups/`, `packages/product-recommendations/`

---

## Email Design Architecture — The MJML Template System

The current email builder renders block JSON → custom HTML string concatenation → raw HTML. This produces functional but mediocre emails. The fix is architectural, not cosmetic.

**Core principle:** AI does not design emails. AI selects and fills beautiful pre-designed templates with the right content, products, and copy. The beauty comes from human-designed template archetypes. The intelligence comes from AI deciding what goes into them.

### New Rendering Pipeline

```
Campaign purpose + customer segment + brand aesthetic
      → Template Selector (picks archetype)
      → MJML Template (brand-tokenized with content slots)
      → Content Filler (AI copy + product data + processed images)
      → mjml2html renderer
      → Final responsive HTML email
```

### Brand Design Token System

Every template is parameterized with tokens extracted from the merchant's Shopify store:
- **Colors:** primaryBackground, secondaryBackground, accentColor, textPrimary, textSecondary, textMuted
- **Typography:** headingFont, bodyFont, headingWeight, h1Size, h2Size, bodySize, captionSize, lineHeight
- **Spacing:** sectionPadding (40-60px), contentPadding (20-30px)
- **CTA:** ctaStyle (pill/rounded/square/outline), ctaBorderRadius, ctaPadding
- **Image:** imageCornerRadius, productImageBackground
- **Brand:** logoUrl, logoWidth, footerStyle
- **Aesthetic classification:** clean_minimal / bold_graphic / luxury_editorial / warm_organic / playful_colorful / tech_modern / heritage_artisanal / premium_dtc

### 15-20 MJML Template Archetypes (pre-designed, brand-tokenized)

1. **Hero Story** — full-width hero image, big headline, short body, single CTA
2. **Product Spotlight** — single product, large image, feature bullets, CTA
3. **Editorial** — magazine-style with headline, body text, inline images
4. **Product Grid** — 2x2 or 3x1 product layout with prices
5. **Urgency/Sale** — bold announcement, countdown, product + discount
6. **Social Proof** — review highlight, customer photo, testimonial
7. **Minimalist Note** — text-forward, looks like personal email
8. **Visual Journey** — step-by-step with numbered sections and images
9. **Celebration/Milestone** — celebratory design, personal stats, reward
10. **Comparison** — side-by-side product, feature table
11. **Restock/Replenish** — simple reminder with product image and quick-buy
12. **Abandoned Cart** — cart contents, product images, single strong CTA
13. **Welcome** — brand intro, value prop, what to expect
14. **Thank You/Post-Purchase** — order confirmation + warm brand touch
15. **Seasonal/Holiday** — themed design with seasonal color palette

### Product Image Processing Pipeline (NO AI-generated product images, ever)

```
Raw Shopify product image
  → Background removal (rembg / remove.bg API)
  → Smart cropping + centering
  → Brand-colored background application
  → Shadow/depth effect
  → Optional overlay (discount badge, "NEW" tag, price, star rating)
  → Multi-size export (hero 600x300, card 280x280, WhatsApp 400x400,
    grid 270x270, thumb 100x100)
  → CDN upload + cache
```

### When AI Image Generation IS Used (only ~15% of emails)

- Seasonal/holiday header backgrounds
- Lifestyle/texture backgrounds (products composited onto them from real photos)
- Abstract/pattern backgrounds
- **NEVER for:** product images, people/models, brand-specific elements
- Prompts always built from BrandDesignTokens with constraints: "no text, no logos, no products, explicit color palette, professional commercial photography style"

### Quality Checks on Every Generated Email

- **Typography:** heading 2x+ body size, body 15-17px, line-height 1.5-1.7, max 2 fonts
- **Color:** max 3 colors, contrast ratio ≥ 4.5:1, no pure #000 (use #1A1A1A)
- **Spacing:** section padding ≥ 40px, content padding ≥ 20px, CTA 30px+ padding above/below
- **Images:** consistent sizing, processed backgrounds, ≤200KB, alt text
- **Layout:** single column on mobile, max 600px width, CTA above fold
- **Brand:** logo present, accent color on CTA, tokens applied correctly

### New Dependencies

`mjml`, `sharp`, `@napi-rs/canvas`, `rembg` (Python subprocess)

---

## Sprint 1 (Weeks 1-2): Customer State Engine + Autonomy Foundation

**Goal:** Unified per-customer state + AI action approval system.

### 1A. Database Models (Migration: `add_customer_state_and_autonomy`)

**File:** `packages/database/prisma/schema.prisma`

Add 5 new models:
- `CustomerState` — unified per-customer state (lifecycleStage, churnRisk, intentState, channelPreference, optimalSendWindow, communicationFatigue, discountSensitivity, supportState, trustScore, vipLevel, campaignEligibility)
- `AutonomyConfig` — per-store, per-category tier settings (autopilot/copilot/advisor + confidence threshold)
- `ActionQueue` — AI-proposed actions awaiting review (type, status, urgencyScore, confidenceScore, reasoning, estimatedRevenue, payload, expiresAt)
- `Guardrail` — merchant-configured rules (max_discount, max_sends_per_week, blocked_words, quiet_hours, etc.)
- `CustomerFatigueLog` — per-customer per-channel send tracking (channel, messageType, sentAt)

Add relations to existing `Store` and `Customer` models. Add `onboardingCompletedAt DateTime?` to `Store` model.

### 1B. Customer State Package

**New package:** `packages/customer-state/`

Files to create:
- `src/types.ts` — CustomerState interface with all 16 dimensions from master plan
- `src/state-engine.ts` — `computeCustomerState()`: aggregates data from existing RfmScore, CustomerLifetimeValue, MessageLog, Order, Conversation models into unified state. `updateStateOnEvent()`: incremental update on new events
- `src/lifecycle-classifier.ts` — `classifyLifecycleStage()`: visitor → subscriber → first_buyer → repeat → loyal → champion → at_risk → lost (uses order count, recency, RFM segment)
- `src/intent-detector.ts` — `detectIntent()`: browsing/considering/ready_to_buy/needs_help/inactive (from browse events, cart activity, support state)
- `src/channel-preference.ts` — `computeChannelPreference()`: per-channel engagement scores from MessageLog open/click rates
- `src/fatigue-tracker.ts` — `checkFatigue()`: query CustomerFatigueLog for recent sends, return per-channel counts + boolean isOverLimit
- `src/reorder-predictor.ts` — `predictReorder()`: per-product repurchase timing from order history intervals
- `src/index.ts` — exports

**Reuses existing:**
- `customer-intelligence/rfm/` — RFM scoring feeds into state
- `customer-intelligence/ltv/` — LTV/churn feeds into state
- `CustomerSegmentHistory` model — segment transitions feed lifecycle

### 1C. Autonomy Engine Package

**New package:** `packages/autonomy-engine/`

Files to create:
- `src/types.ts` — AutonomyTier, ActionCategory, ActionStatus, ProposedAction interfaces
- `src/autonomy-config.ts` — `getAutonomyTier(storeId, category)`, `setAutonomyTier()` — reads/writes AutonomyConfig
- `src/action-queue.ts` — `proposeAction()`: creates ActionQueue record with urgency/confidence scores. `listPendingActions()`, `approveAction()`, `rejectAction()`, `autoExecuteAction()`
- `src/approval-workflow.ts` — `routeAction(action, tier, confidence)`: decides execute/queue/suggest based on tier + confidence threshold
- `src/urgency-scorer.ts` — `scoreUrgency()`: time-decay urgency calculation
- `src/confidence-scorer.ts` — `scoreConfidence()`: confidence based on action type + historical success rate
- `src/index.ts` — exports

### 1D. Customer State Updater Worker

**New worker:** `apps/workers/src/workers/customer-state-updater.worker.ts`
**New queue:** `CUSTOMER_STATE` in config.ts

Event-driven: triggered by order/click/open/support events. Calls `computeCustomerState()` or `updateStateOnEvent()` from customer-state package.

**Integration points:**
- `shopify-webhook.worker.ts` — after order/customer events, queue CUSTOMER_STATE update
- `automation-runner.worker.ts` — after send, queue CUSTOMER_STATE update (fatigue)
- `send.worker.ts` — after campaign send, queue CUSTOMER_STATE update (fatigue)
- Resend webhook handler — after open/click events, queue CUSTOMER_STATE update

### 1D-Note: Widget Browse Events (Future Dependency)

The Customer State Engine's intentState and product affinity dimensions require browse events (page views, product views, cart activity) from the merchant's Shopify storefront. Currently `apps/widget/` is a stub.

For Sprint 1, intentState will be derived from available data (orders, email engagement, support). Full browse event tracking will be added when the widget is built (Sprint 6 for popups, Sprint 10 for on-site concierge). When widget browse events become available, the customer-state-updater worker should be extended to ingest them.

**This is NOT a blocker for Sprint 1.**

### 1E. API Routers

**New router:** `apps/api/src/routers/autonomy.ts`
- `getConfig` — list all autonomy configs for store
- `updateConfig` — set tier for a category
- `listActions` — paginated action queue with filters (status, type, urgency)
- `approveAction` — approve + execute
- `rejectAction` — reject with reason
- `bulkApprove` — approve multiple actions
- `getActionById` — single action detail

**New router:** `apps/api/src/routers/guardrails.ts`
- `list` — all guardrails for store
- `create` — add new guardrail rule
- `update` — modify rule
- `delete` — remove rule
- `validate` — test a proposed action against all rules

Register both in `apps/api/src/routers/_app.ts`

### 1F. UI Changes

**New page:** `apps/web/src/app/(dashboard)/settings/autonomy/page.tsx`
- Per-category tier selector (grid of categories × autopilot/copilot/advisor)
- Confidence threshold slider per category
- Default from master plan's autonomy matrix

**New page:** `apps/web/src/app/(dashboard)/settings/guardrails/page.tsx`
- CRUD for guardrail rules
- Rule types: max_discount, max_sends_per_week, blocked_words, quiet_hours, spending_caps, segment_exclusions, channel_preferences, collision_avoidance

**Modify:** `apps/web/src/components/layout/Sidebar.tsx` — add sub-nav under Settings

### 1G. Agent Tools

Add to `packages/agent-core/src/tools/`:
- `get_customer_state.ts` — Fetch unified CustomerState for a customer. Used when merchant asks "tell me about customer X"
- `configure_autonomy.ts` — Change autonomy tier for a category. Used when merchant says "put cart recovery on autopilot"
- `manage_guardrails.ts` — View/edit guardrail rules. Used when merchant says "set max discount to 15%"
- `review_action_queue.ts` — List pending actions. Used when merchant asks "what's waiting for me?"
- `approve_action.ts` — Approve/reject a queued action. Used when merchant says "approve the win-back campaign"

Register all tools in agent-core tool registry (`tools/index.ts`).

---

## Sprint 2 (Weeks 3-4): Communication Governor + Fatigue Management

**Goal:** Prevent spam before enabling proactive campaigns.

### 2A. Communication Governor Package

**New package:** `packages/communication-governor/`

Files to create:
- `src/types.ts` — GovernorDecision (allow/block/delay + reason), FatigueConfig, QuietHoursConfig
- `src/fatigue-manager.ts` — `checkFatigue(customerId, channel, storeId)`: query CustomerFatigueLog, enforce per-customer per-channel limits (default: 3 email/week, 1 WhatsApp/week, 2 SMS/week). Returns allow/block + remaining quota
- `src/channel-arbitrator.ts` — `arbitrateChannel(customerId, channels[])`: prevent duplicate sends across channels within timeframe. If customer got WhatsApp 2h ago, block SMS for same campaign
- `src/quiet-hours.ts` — `checkQuietHours(customerId, timezone?)`: timezone-aware send window enforcement (default: 10pm-7am). Uses CustomerState.optimalSendWindow if available
- `src/collision-detector.ts` — `checkCollision(customerId, storeId)`: no 2 campaigns to same customer in 48h. Queries MessageLog for recent campaign sends
- `src/support-suppressor.ts` — `checkSupportState(customerId)`: suppress marketing if customer has open support issue or recent complaint (uses CustomerState.supportState)
- `src/cooldown-manager.ts` — `checkCooldown(customerId, type)`: post-discount cooldown (14 days), post-complaint cooldown (7 days)
- `src/governor.ts` — `checkAllRules(customerId, storeId, channel, messageType)`: runs all checks in sequence, returns first block or allow
- `src/index.ts` — exports

### 2B. Integration into Messaging Pipeline

**Modify:** `apps/workers/src/workers/automation-runner.worker.ts`
- Before each send node, call `governor.checkAllRules()`. If blocked, log suppression in MessageLog (status="suppressed", reason), skip to next node or suppress journey

**Modify:** `apps/workers/src/workers/send.worker.ts`
- Before each recipient send, call `governor.checkAllRules()`. If blocked, mark CampaignRecipient as suppressed, continue to next

**Modify:** `packages/messaging/src/index.ts`
- Add optional `preCheck` hook in sendMessage() that campaign/automation workers can wire to governor

### 2C. Fatigue Logging

**Modify:** `apps/workers/src/workers/automation-runner.worker.ts` and `send.worker.ts`
- After successful send, create CustomerFatigueLog entry (customerId, storeId, channel, messageType)

### 2D. Guardrail Validation Worker

**New worker:** `apps/workers/src/workers/guardrail-validator.worker.ts`
**New queue:** `GUARDRAIL_CHECK` in config.ts

Pre-send validation: checks proposed message against all active Guardrail rules for store.

---

## Sprint 3A (Weeks 5-6): Creative Engine + Email Design System

**Goal:** Beautiful, brand-consistent email generation without human designers.

### 3A-1. Database Models (Migration: `add_creative_and_product_cycles`)

Add to `packages/database/prisma/schema.prisma`:
- `BrandVisualProfile` — storeId (unique), primaryColors (Json), accentColors (Json), fontFamily, logoUrl, logoVariants (Json), photographyStyle, visualTone, layoutPreference, bannedElements (Json), brandDesignTokens (Json — full token set), aestheticClassification (String — one of 8 archetypes)
- `CreativeAsset` — storeId, type (hero_banner/product_card/promo_badge/etc), generationMethod (template/ai_generated/product_composite/overlay), sourcePrompt?, templateId?, imageUrl, thumbnailUrl?, width, height, fileSizeBytes, format, channel, campaignId?, metadata (Json)
- `ProductRepurchaseCycle` — productId, storeId, medianDays, avgDays, sampleSize, confidence, lastCalculated
- `ProcessedProductImage` — productId, storeId, originalUrl, transparentUrl, brandBgUrl, sizes (Json — {hero, card, grid, thumb, whatsapp}), overlayVariants (Json), processedAt

### 3A-2. Creative Engine Package

**New package:** `packages/creative-engine/`

Files to create:
- `src/types.ts` — BrandDesignTokens interface (all token fields), BrandAesthetic enum (8 classifications), CreativeAsset, ChannelSpec, VisualVariant, ProcessedProductImage interfaces
- `src/brand-kit.ts` — `extractBrandKit(storeId)`:
  1. Fetch Shopify theme settings (colors, fonts)
  2. Download and analyse logo (detect light/dark variants)
  3. Sample product images (classify photography style)
  4. Classify brand aesthetic (1 of 8 archetypes)
  5. Generate full BrandDesignTokens
  6. Save as BrandVisualProfile
  - **Reuses:** `ecommerce-integrations/shopify/client.ts` for API calls
- `src/product-image-processor.ts` — `processProductImages(storeId)`:
  1. Download product images from Shopify
  2. Background removal via rembg (Python subprocess) or remove.bg API
  3. Smart crop + center using Sharp
  4. Apply brand-colored background from tokens
  5. Generate shadow/depth effect
  6. Export multi-size variants (hero, card, grid, thumb, whatsapp)
  7. Save as ProcessedProductImage records + CDN upload
- `src/overlay-engine.ts` — Using Sharp + @napi-rs/canvas:
  - `addDiscountBadge(image, "20% OFF", brandTokens)`
  - `addNewTag(image, brandTokens)`
  - `addPriceLabel(image, price, brandTokens)`
  - `addStockBadge(image, "Only 3 left", brandTokens)`
  - `addStarRating(image, rating, brandTokens)`
- `src/template-renderer.ts` —
  - `renderMjmlTemplate(archetypeId, brandTokens, contentSlots)`: loads MJML template, substitutes brand tokens + content, calls mjml2html, returns responsive HTML
  - `listArchetypes()`: returns available template archetypes with descriptions
  - `previewTemplate(archetypeId, brandTokens)`: render with placeholder content for merchant preview
- `src/template-selector.ts` — `selectTemplate(campaignType, customerSegment, brandAesthetic)`: returns best archetype ID. Maps campaign types to archetypes (e.g., win_back + at_risk → Minimalist Note, new_product + champion → Product Spotlight with early access)
- `src/ai-image-generator.ts` — `generateBackground(type, brandTokens)`: ONLY for seasonal/lifestyle backgrounds. Brand-constrained prompts. **Reuses:** `customer-intelligence/images/generate-image.ts` (Flux/DALL-E providers)
- `src/channel-formatter.ts` — `formatForChannel(imageUrl, channel)`: resize/optimize per channel specs
- `src/asset-manager.ts` — `storeAsset()`, `getAsset()`, `linkToCampaign()`: manage generated assets
- `src/index.ts` — exports

**New directory:** `packages/creative-engine/templates/`
- 15-20 `.mjml` files, one per archetype (hero-story.mjml, product-spotlight.mjml, minimalist-note.mjml, etc.)
- Each uses `{{token}}` placeholders for brand tokens AND `{{slot}}` placeholders for content
- All templates must pass the quality checks listed in the Email Design Architecture section

### 3A-3. Modify Email Builder to Use MJML

**Modify:** `packages/email-builder/src/render-to-html.ts`
- Add MJML rendering path alongside existing HTML path
- When campaign is AI-generated: use MJML archetype system
- When merchant manually builds in editor: keep existing block → HTML path (but consider migrating to MJML blocks long-term)
- Add: `renderFromArchetype(archetypeId, brandTokens, contentSlots)` function

**New dependency:** Add `mjml` to `packages/email-builder/package.json`

### 3A-4. Workers

New workers:
- `apps/workers/src/workers/brand-kit-extractor.worker.ts` — On store connect + weekly refresh. Calls `extractBrandKit()`. Queue: `BRAND_KIT`
- `apps/workers/src/workers/product-image-processor.worker.ts` — On product sync (triggered after Shopify product webhooks). Calls `processProductImages()`. Queue: `PRODUCT_IMAGE`
- `apps/workers/src/workers/creative-generator.worker.ts` — On demand (from campaign-factory). Generates visual assets. Queue: `CREATIVE_GEN`

**Integration:**
- `shopify-webhook.worker.ts` — after `products/create` or `products/update`, queue `PRODUCT_IMAGE`
- `sync.worker.ts` — after full product sync, queue `PRODUCT_IMAGE` for all products
- Shopify OAuth callback — after store connect, queue `BRAND_KIT`

### 3A-5. Onboarding Integration

When merchant first connects Shopify, the following sequence fires:
1. Shopify sync (existing) — products, customers, orders, collections
2. `BRAND_KIT` queue — extract visual profile from store
3. `PRODUCT_IMAGE` queue — process all product images
4. `RFM_CALCULATION` queue — score all customers (existing)
5. `LTV_CALCULATION` queue — calculate LTV (existing)
6. `BASELINE` queue (Sprint 4) — capture metrics snapshot
7. Store Intelligence Report — comprehensive analysis (Sprint 4)

**Merchant-facing onboarding steps:**
1. "We're analysing your store..." — progress bar showing sync/analysis steps
2. Brand review — show extracted visual profile, let merchant adjust
3. Autonomy configuration — per-category tier selector with recommended defaults (Sprint 1)
4. Guardrails setup — quick config of max discount, send frequency, quiet hours (Sprint 1)
5. Store Intelligence Report — "Here's what we found" (Sprint 4)
6. Recommended actions — "Here are 5 things Allo can do right now" with one-click approval (Sprint 3B)
7. Mission Control — merchant lands on their personalised dashboard

**Modify:** `apps/api/src/routers/stores.ts` — connectShopify procedure should queue steps 2-3 after sync

**New UI:** `apps/web/src/app/(dashboard)/onboarding/brand-review/page.tsx`
- Shows extracted brand tokens: colors (swatches), fonts, logo, aesthetic classification
- Merchant can adjust: swap colors, change font, override aesthetic, add banned elements
- "Looks good" button saves BrandVisualProfile and continues onboarding

---

## Sprint 3B (Weeks 7-8): Proactive Campaign Engine

**Goal:** AI creates campaigns with beautiful visuals without human input.

### 3B-1. Campaign Engine Package

**New package:** `packages/campaign-engine/`

Files to create:
- `src/types.ts` — CampaignOpportunity, CampaignDraft, RevenueEstimate, OpportunityType enum (at_risk_winback, repurchase_window, new_arrival, low_stock, seasonal, vip_milestone, cross_sell, re_engagement)
- `src/opportunity-scanner.ts` — `scanOpportunities(storeId)`: scans segments + CustomerState for actionable opportunities. Returns prioritized list. Checks:
  - At-risk customers approaching churn cliff (from CustomerState.churnRisk)
  - Products within repurchase window (from ProductRepurchaseCycle)
  - New products not yet promoted
  - Low stock items with interested customers
  - Upcoming holidays/seasons (from calendar-awareness)
  - VIP milestones (customer crossed LTV threshold)
  - Cross-sell opportunities (from purchase patterns)
  - Cold subscribers who never purchased
- `src/campaign-factory.ts` — `generateCampaignDraft(opportunity)`:
  1. Select template archetype (via `creative-engine/template-selector`)
  2. Generate copy in brand voice (via `customer-intelligence/email` generation — existing)
  3. Select products to feature (from opportunity data)
  4. Get processed product images (from ProcessedProductImage)
  5. Generate campaign visuals if needed (via creative-engine)
  6. Render email via MJML (via `creative-engine/template-renderer`)
  7. Create EmailTemplate record + CreativeAsset records
  8. Route through autonomy-engine (autopilot → auto-send, copilot → ActionQueue, advisor → insight only)
- `src/calendar-awareness.ts` — `getUpcomingEvents(storeId, daysAhead)`: holidays, seasons, brand-specific dates. **Reuse:** `customer-intelligence/context/festivity-calendar.ts`
- `src/inventory-aware.ts` — `checkInventoryConflicts(storeId)`: cross-reference stock levels with planned automations/campaigns. Alert if product in active campaign has <5 stock
- `src/revenue-estimator.ts` — `estimateRevenue(opportunity, segmentSize)`: predict revenue from segment size × historical conversion rate × average order value. Returns range (low/mid/high)
- `src/performance-learner.ts` — `learnFromResults(campaignId)`: after campaign completes, analyze open/click/conversion by template archetype, copy style, products, segment. Update preferences for future generation
- `src/index.ts` — exports

### 3B-2. Workers

New workers:
- `apps/workers/src/workers/opportunity-scanner.worker.ts` — Scheduled every 2h. Calls `scanOpportunities()`, queues each opportunity to `CAMPAIGN_FACTORY`. Queue: `OPPORTUNITY_SCAN`
- `apps/workers/src/workers/campaign-factory.worker.ts` — On-demand. Calls `generateCampaignDraft()`. Queue: `CAMPAIGN_FACTORY`
- `apps/workers/src/workers/product-cycle-analyzer.worker.ts` — Daily. Calculates ProductRepurchaseCycle per product from order history intervals. Queue: `PRODUCT_CYCLES`

New queues in config.ts: `OPPORTUNITY_SCAN`, `CAMPAIGN_FACTORY`, `PRODUCT_CYCLES`

### 3B-3. API & UI

**Extend router:** `apps/api/src/routers/autonomy.ts`
- `listActions` should return campaign drafts with: email HTML preview, visual thumbnails, reasoning text, estimated revenue range, confidence score, urgency countdown, template archetype used

**New page:** `apps/web/src/app/(dashboard)/actions/page.tsx` — Action Queue
- Card-based list of AI-drafted campaigns
- Each card shows: campaign name, target segment + count, reasoning ("Why this, why now"), estimated revenue range, confidence badge, urgency countdown timer, email preview thumbnail
- Actions: Approve (sends/schedules), Edit (opens in email builder with prefilled content), Reject (with reason), Dismiss
- Filters: status (pending/approved/rejected/expired), type, urgency
- Bulk approve for low-risk items

### 3B-4. Agent Tools

Add to `packages/agent-core/src/tools/`:
- `generate_campaign_visual` — wraps creative-engine to create visuals on demand
- `estimate_campaign_revenue` — wraps revenue-estimator
- `generate_product_showcase` — wraps product-image-processor + overlay-engine
- `generate_visual_variants` — creates A/B visual variants for split testing

---

## Sprint 4 (Weeks 9-10): Merchant Copilot + Briefing System

**Goal:** Build merchant trust, demonstrate AI value.

### 4A. Database Models (Migration: `add_briefings`)

Add:
- `MerchantBriefing` — type (daily/weekly/alert), content (JSON), deliveredVia, readAt
- `StoreBaseline` — storeId (unique), capturedAt, metrics (JSON snapshot at onboarding)

### 4B. Merchant Copilot Package

**New package:** `packages/merchant-copilot/`

Files to create:
- `src/types.ts` — Briefing, StoreIntelligenceReport, BaselineMetrics interfaces
- `src/briefing-generator.ts` — `generateDailyBriefing(storeId)`: compiles overnight activity + pending actions + insights into narrative format. Queries: MessageLog (sends), ActionQueue (pending), AgentObservation (alerts), Order (revenue), Campaign (performance)
- `src/notification-router.ts` — `deliverBriefing(briefing, preferences)`: send via WhatsApp/email/in-app based on merchant preferences. Uses existing messaging package
- `src/store-intelligence.ts` — `generateStoreReport(storeId)`: comprehensive first-run analysis. Customer counts, segment distribution, retention cliff detection, product repurchase rates, brand voice summary, recommended automations
- `src/baseline-capture.ts` — `captureBaseline(storeId)`: snapshot all KPIs (revenue, customer count, churn rate, open rates, etc.) for before/after comparison
- `src/mission-control.ts` — `getMissionControlData(storeId)`: "What happened / What matters / What needs approval / What Allo did" prioritized by revenue impact
- `src/performance-reporter.ts` — `generateMonthlyReport(storeId)`: AI-managed campaign revenue, activity summary, before/after metrics
- `src/index.ts` — exports

### 4C. Workers

- `apps/workers/src/workers/briefing-generator.worker.ts` — **Daily** (per merchant timezone): generates and delivers morning briefing
- `apps/workers/src/workers/baseline-capture.worker.ts` — **On-connect**: captures metrics snapshot
- `apps/workers/src/workers/weekly-report.worker.ts` — **Sunday night**: generates weekly intelligence report

New queues: `MERCHANT_BRIEFING`, `BASELINE`, `WEEKLY_REPORT`

### 4D. Mission Control UI

**Major redesign:** `apps/web/src/app/(dashboard)/dashboard/page.tsx`

Replace current dashboard with Mission Control layout:
- "Since you were last here" narrative section
- "Needs your attention" (action queue items with urgency)
- "What Allo did" (recent AI actions log)
- "Today's opportunities" (from opportunity scanner)
- KPI cards remain but with before/after baseline comparison
- Morning briefing card (latest briefing content)

**New router:** `apps/api/src/routers/briefings.ts`
- `latest` — most recent briefing
- `list` — paginated briefing history
- `markRead` — mark briefing as read
- `preferences` — notification channel preferences

### 4E. Connected Onboarding Flow

The store connect → first dashboard experience must be a coherent sequence. When a merchant connects Shopify:

**Automated sequence (background, ~30 minutes):**
1. Shopify sync — products, customers, orders, collections (existing)
2. Brand kit extraction — colors, fonts, aesthetic, logo (Sprint 3A)
3. Product image processing — all products get background-removed, styled variants (Sprint 3A)
4. RFM scoring — score all customers (existing)
5. LTV calculation — predict all customer values (existing)
6. Baseline capture — snapshot all KPIs (Sprint 4)
7. Store Intelligence Report — comprehensive analysis (Sprint 4)

**Merchant-facing onboarding steps:**
1. "We're analysing your store..." — progress bar showing sync/analysis steps
2. Brand review — show extracted visual profile, let merchant adjust (Sprint 3A)
3. Autonomy configuration — per-category tier selector with recommended defaults (Sprint 1)
4. Guardrails setup — quick config of max discount, send frequency, quiet hours (Sprint 1)
5. Store Intelligence Report — "Here's what we found" (Sprint 4)
6. Recommended actions — "Here are 5 things Allo can do right now" with one-click approval (Sprint 3B)
7. Mission Control — merchant lands on their personalised dashboard

**New page:** `apps/web/src/app/(dashboard)/onboarding/page.tsx` — multi-step onboarding wizard
- Steps: Sync Progress → Brand Review → Autonomy Setup → Guardrails → Intelligence Report → First Actions → Done

**Integration:** After Shopify OAuth callback, redirect to `/onboarding` instead of `/dashboard`. Track onboarding completion via `Store.onboardingCompletedAt`.

### 4F. Agent Tools

Add to `packages/agent-core/src/tools/`:
- `generate_briefing.ts` — Compile and return briefing content
- `root_cause_analysis.ts` — "Why are sales down?" — checks inventory, campaign performance, segment movements, seasonal patterns
- `generate_store_report.ts` — Produce store intelligence summary

---

## Sprint 5 (Weeks 11-12): Adaptive Journey Orchestrator

**Goal:** Transform static automations into intelligent, multi-channel journeys.

### 5A. Database Models (Migration: `add_journeys`)

Add:
- `CustomerJourney` — customerId, journeyType, currentStep, status, channelPath, stepHistory, suppressedAt, suppressReason
- `ABTest` — variable (subject_line/send_time/content/channel), variantA/B, results, winner, status

### 5B. Journey Orchestrator Package

**New package:** `packages/journey-orchestrator/`

Files to create:
- `src/types.ts` — Journey, JourneyStep, JourneyDecision, ChannelSelection interfaces
- `src/journey-engine.ts` — `executeJourneyStep(journeyId)`: adaptive multi-channel execution. Uses CustomerState for decisions. Creates/updates CustomerJourney record
- `src/channel-selector.ts` — `selectChannel(customerId)`: best channel per customer from CustomerState.channelPreference. Checks consent, fatigue, governor
- `src/timing-optimizer.ts` — `getOptimalSendTime(customerId)`: from CustomerState.optimalSendWindow or learned from engagement patterns
- `src/tone-adapter.ts` — `adaptTone(customerId, content)`: adjust tone by lifecycle stage (new=educational, loyal=insider, VIP=exclusive)
- `src/content-personaliser.ts` — `personalise(customerId, content)`: product-specific content based on purchase history, exclude already-owned products
- `src/silence-detector.ts` — `checkSilence(customerId, journeyId)`: if customer hasn't responded to N touchpoints, suppress journey
- `src/ab-testing.ts` — `createTest()`, `assignVariant()`, `recordResult()`, `evaluateTest()`
- `src/index.ts` — exports

### 5C. Workers

- `apps/workers/src/workers/journey-stepper.worker.ts` — **On-demand**: execute next step in adaptive journey
- `apps/workers/src/workers/ab-test-evaluator.worker.ts` — **Continuous**: evaluate running A/B tests, declare winners
- `apps/workers/src/workers/send-time-optimizer.worker.ts` — **Nightly**: recalculate per-customer optimal send times

New queues: `JOURNEY_STEP`, `AB_TEST`, `SEND_TIME`

### 5D. Journey UI

**Modify:** `apps/web/src/app/(dashboard)/automations/[id]/page.tsx` and `components/workflow-editor/WorkflowEditor.tsx`
- Upgrade to support adaptive journeys: channel selection nodes, silence detection config, A/B test nodes
- Add journey monitoring: per-customer journey status, step history, channel path visualization

### 5E. Agent Tools

Add to `packages/agent-core/src/tools/`:
- `create_adaptive_journey.ts` — Build a multi-channel sequence from natural language description

---

## Sprint 6 (Weeks 13-14): Forms, Popups + Lead Capture

**Goal:** Top-of-funnel lead capture.

### 6A. Database Models (Migration: `add_forms_popups`)

Add:
- `Form` — storeId, name, fields (JSON), styling (JSON), submitAction, incentiveConfig, status
- `Popup` — storeId, name, formId, trigger (exit_intent/scroll/timer/page_load), triggerConfig, styling, status
- `FormSubmission` — formId, customerId?, data (JSON), source, consentGiven, capturedAt

### 6B. Forms & Popups Package

**Rebuild:** `packages/forms-and-popups/`

Files to create:
- `src/types.ts` — Form, Popup, FormField, TriggerRule, IncentiveConfig interfaces
- `src/form-builder.ts` — `buildForm(config)`: generate HTML/JSON form from config. Field types: text, email, phone, select, checkbox
- `src/popup-engine.ts` — `createPopupConfig(trigger, form, styling)`: trigger rules (exit intent, scroll %, timer, page load)
- `src/incentive-logic.ts` — `generateIncentive(config)`: discount code delivery on signup via Shopify Admin API
- `src/consent-capture.ts` — `captureConsent(submission)`: per-channel opt-in (email, SMS, WhatsApp) with GDPR/DPDP compliance
- `src/embed-generator.ts` — `generateEmbedCode(popupId)`: embeddable JS snippet for Shopify themes
- `src/index.ts` — exports

### 6C. API & UI

**New router:** `apps/api/src/routers/forms.ts`
- CRUD for forms and popups
- Submission tracking
- Embed code generation

**New pages:**
- `apps/web/src/app/(dashboard)/forms/page.tsx` — form/popup list
- `apps/web/src/app/(dashboard)/forms/new/page.tsx` — form builder
- `apps/web/src/app/(dashboard)/forms/[id]/page.tsx` — form detail + submissions

**Widget integration:**
- `apps/widget/` — implement embeddable popup widget (currently stub)

**Integration:** Form submission triggers CustomerState update (consent, channel preferences)

---

## Sprint 7 (Weeks 15-16): Analytics Dashboard + Learning Loop

**Goal:** Close the feedback loop. AI learns from results, merchants see proof of value.

### 7A. Analytics Package

**Rebuild:** `packages/analytics/`

Files to create:
- `src/types.ts` — extend existing types with new interfaces
- `src/revenue-attribution.ts` — Multi-touch attribution (first-click, last-click, linear). **Extend existing:** OrderAttribution model already does last-click
- `src/channel-breakdown.ts` — Revenue per channel from MessageLog + OrderAttribution
- `src/ai-performance.ts` — AI-generated vs manual campaign comparison
- `src/cohort-tracker.ts` — Customer cohort health over time. **Reuse:** existing `rfm.cohorts` endpoint
- `src/roi-calculator.ts` — AI token cost vs revenue generated. **Reuse:** existing `dashboard.tokenUsage` endpoint
- `src/export.ts` — CSV/PDF export from analytics views
- `src/index.ts` — exports

### 7B. Workers

- `apps/workers/src/workers/revenue-forecaster.worker.ts` — **Daily**: 7/30/90-day revenue projections from campaign pipeline + automation performance

New queue: `REVENUE_FORECAST`

### 7C. API & UI

**Modify router:** `apps/api/src/routers/analytics.ts` (currently minimal)
- Add comprehensive endpoints: revenue by channel, AI performance, cohort trends, ROI

**Redesign page:** `apps/web/src/app/(dashboard)/analytics/page.tsx`
- Full analytics dashboard: revenue timeline, channel breakdown, AI vs manual comparison, cohort health, ROI metrics, export buttons

### 7D. Agent Tools

Add to `packages/agent-core/src/tools/`:
- `compare_periods.ts` — Week-over-week, month-over-month comparison of any metric

---

## Sprints 8-10 (V2): Product Recommendations, Proactive Outreach, Support

### Sprint 8 (Weeks 17-18): Product Recommendations
- Rebuild `packages/product-recommendations/` — affinity matrix, collaborative filtering, reorder engine, cross-sell
- New worker: product-recommendation.worker.ts
- Integrate into journey orchestrator (cross-sell step in post-purchase journeys)
- Dynamic product blocks in email builder

### Sprint 9 (Weeks 19-20): Proactive Customer Outreach
- Shipping update proactive messages (Shopify fulfillment webhooks)
- Restock alerts, price drop notifications
- Product cycle repurchase reminders
- Inventory monitor worker (cross-reference stock with planned sends)

### Sprint 10 (Weeks 21-24): Customer-Facing Support (Allo Concierge Phase 2)
- New package: `packages/conversation-engine/` — conversation router, context builder, response generator, escalation engine, knowledge base, support-marketing bridge
- WhatsApp Business API two-way messaging (partially exists in conversation-process worker)
- Support sentiment tracking → CustomerState update
- Enhanced conversation UI in merchant dashboard

---

## Cross-Sprint Integration Points

These connections must be explicitly verified when the receiving sprint is built:

| Source Sprint | Target Sprint | Integration |
|--------------|--------------|-------------|
| 1 (CustomerState) | 2 (Governor) | Governor reads CustomerState.supportState for suppression, CustomerState.communicationFatigue for limits |
| 1 (CustomerState) | 3B (Campaign Engine) | Opportunity scanner reads CustomerState.churnRisk, lifecycleStage, reorderProbability |
| 1 (Autonomy Engine) | 3B (Campaign Engine) | Campaign factory routes drafts through approval-workflow based on autonomy tier |
| 2 (Governor) | 3B (Campaign Engine) | Campaign factory checks governor before scheduling sends |
| 3A (Creative Engine) | 3B (Campaign Engine) | Campaign factory uses template-selector, template-renderer, and processed product images |
| 3A (Brand Kit) | 5 (Journeys) | Journey emails use brand tokens for visual consistency |
| 3A (Product Images) | 5 (Journeys) | Journey product recommendations use processed images |
| 1 (CustomerState) | 5 (Journeys) | Journey orchestrator reads channelPreference, optimalSendWindow, lifecycleStage |
| 2 (Governor) | 5 (Journeys) | Journey stepper checks governor before each send |
| 3A (Brand Kit) | 6 (Forms) | Popup styling uses brand tokens |
| 6 (Forms) | 1 (CustomerState) | Form submission triggers CustomerState update (consent, channel prefs) |
| All send workers | 7 (Analytics) | All sends log data for attribution + performance learning |
| 7 (Learning Loop) | 3B (Campaign Engine) | Performance learner feeds preferences back to campaign factory + template selector |

---

## Package Setup Convention

Every new package follows this structure:
```
packages/{package-name}/
├── package.json         — name: @allohq/{package-name}, main: ./src/index.ts
├── tsconfig.json        — extends ../../packages/tsconfig/base.json
└── src/
    ├── index.ts         — barrel exports
    ├── types.ts         — interfaces and type definitions
    └── {module}.ts      — business logic modules
```

package.json template:
```json
{
  "name": "@allohq/{package-name}",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@allohq/database": "workspace:*"
  }
}
```

Add to consuming apps (api, workers) in their package.json:
```json
"@allohq/{package-name}": "workspace:*"
```

### Worker Setup Convention

Every new worker follows existing pattern in `apps/workers/src/workers/`:
```typescript
import { Worker, Job } from 'bullmq';
import { connection } from '../config';

const worker = new Worker(
  'QUEUE_NAME',
  async (job: Job) => {
    // job processing logic
  },
  { connection }
);
```

Register queue name in `apps/workers/src/config.ts` QUEUES object.

---

## Implementation Order Within Each Sprint

1. **Database first** — Prisma models, migration
2. **Package/business logic** — Core package with types + engine
3. **Workers** — BullMQ workers using the package
4. **tRPC routers** — API endpoints
5. **UI last** — Dashboard pages and components

---

## Verification Per Sprint

| Sprint | Weeks | How to Verify |
|--------|-------|---------------|
| 1 | 1-2 | CustomerState computed from existing data for any customer. Autonomy tier CRUD works. Guardrails save/load. Action queue create/list/approve works. State updater fires on order webhook |
| 2 | 3-4 | Governor blocks sends exceeding per-customer limits. Fatigue logs created after every send. Quiet hours enforced for test timezone. Support suppression blocks marketing for customer with open issue. Collision detector blocks 2nd campaign within 48h |
| 3A | 5-6 | Brand kit extracted from Shopify store with correct colors/fonts. Product images processed with background removal + brand background. MJML template renders with brand tokens → responsive HTML. Template preview shows in onboarding brand review page |
| 3B | 7-8 | Opportunity scanner finds actionable segments. Campaign factory generates draft with MJML-rendered email + processed product images. Draft appears in action queue with reasoning + revenue estimate. Approve action triggers campaign send |
| 4 | 9-10 | Morning briefing generates narrative. Baseline captured on store connect. Mission Control shows prioritised data. Onboarding wizard completes end-to-end. Store Intelligence Report generated |
| 5 | 11-12 | Journey adapts channel based on CustomerState.channelPreference. Silence detection suppresses after N unresponded touches. A/B test assigns variants and records results. Send time uses CustomerState.optimalSendWindow |
| 6 | 13-14 | Form builder creates HTML form. Popup triggers on exit intent in test page. Consent captured per channel. Embed code loads on test Shopify store. Submission creates/updates customer + CustomerState |
| 7 | 15-16 | Multi-touch attribution computed for test orders. AI vs manual campaign comparison shows data. Channel breakdown shows revenue per channel. CSV export downloads. Performance learner updates campaign-factory preferences |

Type-check after each sprint:
```bash
pnpm --filter @allohq/database exec tsc --noEmit
pnpm --filter @allohq/{new-package} exec tsc --noEmit
pnpm --filter @allohq/api exec tsc --noEmit
pnpm --filter @allohq/web exec tsc --noEmit
pnpm --filter @allohq/workers exec tsc --noEmit
```
