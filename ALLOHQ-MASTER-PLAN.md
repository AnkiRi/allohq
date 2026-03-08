# AlloHQ — Master Plan v2.0
## The Autonomous Relationship Platform for Commerce Brands

---

## 1. What AlloHQ Is

AlloHQ is not marketing automation software. It is an **autonomous relationship platform** that sits between a brand and every individual customer across the full lifecycle — from first visit to advocacy.

**The one-sentence promise:**
> Allo gives every customer a private, always-on concierge — and gives every merchant an AI retention-and-support team that works continuously, proactively, and economically.

**The core insight:** Today's tools (Klaviyo, Omnisend, Intercom, Gorgias) execute. Humans still have to think. Humans identify which customers matter, detect risk and opportunity, decide what to say, where to say it, when to say it, create the campaign, review performance, adjust segments, coordinate support context, avoid over-messaging, and handle edge cases. That breaks at scale. With 10,000 customers, no human team can deeply track each person, adapt timing per customer, or coordinate support context with marketing.

**The showroom analogy:** If 10,000 people walk into a giant showroom, can there be 10,000 personal concierges who attend them, analyse their behaviour, and whether they buy or not, continue to engage with them personally without overselling — with great communication over weeks, months, years? AlloHQ is that concierge. It works 24/7/365, does detailed analysis on behaviour and buying patterns, maintains the highest level of privacy and personalisation, and creates value for both the customer and the merchant.

**What AlloHQ replaces:**
- Retention Lead / Head of Customer Retention
- CRM Manager / Lifecycle Marketer
- Campaign Coordinator + Junior Copywriter
- Graphic Designer / Creative Lead (for campaign visuals, banners, product showcases)
- Support Lead (partially, then fully)
- Analyst for routine retention insights
- Channel specialist

**Positioning (external):** "Run retention and support with a fraction of the team" or "Your AI retention and support team" — not "remove your retention lead."

---

## 2. The Three Products in One: Allo Brain, Allo Operator, Allo Concierge

AlloHQ is architecturally and conceptually three products that work as one system. Merchants can adopt all three or start with one.

### Allo Brain — The Intelligence Layer
Analyses customers, store data, behaviour, risk, intent, revenue opportunities. This is the "thinking" layer.

**What it does:**
- Maintains a continuously-updated Customer State Engine for every customer
- Calculates RFM scores, LTV, churn probability, purchase cycles
- Detects anomalies (churn spikes, revenue drops, inventory velocity changes)
- Classifies customer intent (gift buyer vs self-purchaser, window shopper vs deliberate buyer)
- Identifies revenue opportunities (cross-sell, repurchase timing, segment milestones)
- Generates the Morning Briefing and weekly intelligence reports
- Forecasts revenue from pipeline (pending campaigns + automation sequences)
- Learns from outcomes — what worked, what didn't, for which customers

**The Customer State Engine — Core Primitive:**
Every customer has continuously-updated state across these dimensions:

| Dimension | Description |
|-----------|-------------|
| Identity | Known/unknown, profile completeness |
| Consent State | Per-channel opt-in status (email, SMS, WhatsApp, RCS) |
| Lifecycle Stage | Visitor → Subscriber → First Buyer → Repeat → Loyal → Champion → At Risk → Lost |
| RFM / LTV | Recency, Frequency, Monetary scores + predicted lifetime value |
| Churn Risk | Probability of churning, days since expected reorder |
| Product Affinity | Categories, specific products, price sensitivity |
| Discount Sensitivity | Response to discounts vs content vs exclusive access |
| Support State | Open issues, sentiment, recent complaints |
| Intent State | Browsing, considering, ready to buy, needs help |
| Communication Fatigue | Recent sends by channel, engagement trend |
| Channel Preference | Which channel gets highest engagement (learned over time) |
| Preferred Send Window | Optimal time to reach this customer (learned) |
| Trust Score | Engagement trend, response rate, complaint history |
| Campaign Eligibility | What campaigns this customer qualifies for right now |
| VIP / Protection Level | Whether customer gets premium treatment thresholds |
| Reorder Probability | Likelihood and timing of next purchase per product |

This state drives every decision. Not campaigns. Not segments. Customer state.

### Allo Operator — The Execution Layer
Creates and executes campaigns, flows, support actions, alerts, AND the creative assets needed for all of them. This is the "doing" layer.

**What it does:**
- Generates campaigns proactively (the "Campaign Factory" — continuously generates ready-to-send campaigns)
- **Generates all creative assets** — hero images, product showcases, promotional banners, WhatsApp visuals, popup graphics, social proof cards — all brand-consistent, without human designer involvement
- Executes multi-channel journeys (email → WhatsApp → SMS, adaptive based on response)
- Manages the Action Queue (campaigns awaiting merchant approval)
- Runs A/B tests automatically (subject lines, content, timing, channel, AND visuals)
- Enforces guardrails (max discount, send frequency, blocked words, quiet hours, brand visual guidelines)
- Manages the Communication Governor (prevents over-messaging, channel conflicts, support-state suppression)
- Handles proactive outreach (shipping updates, restock alerts, repurchase reminders)
- Coordinates timing across all channels for each customer

### Allo Creative — The Visual Generation Layer
Generates all visual assets required for campaigns, emails, popups, and customer-facing messages. This is the "designing" layer — embedded within the Operator but significant enough to call out.

**What it generates:**
- **Email creatives:** Hero banners, product feature images, sale announcement graphics, seasonal themed headers, lifestyle imagery that matches brand aesthetic
- **Product showcase graphics:** Clean product-on-background compositions, multi-product grids, before/after visuals, comparison layouts
- **Promotional visuals:** Discount overlays on product images ("20% OFF"), flash sale banners, countdown graphics, limited stock urgency badges
- **WhatsApp/RCS rich media:** Product cards with pricing, visual order confirmations, styled restock alerts, mini-catalogs
- **Popup/form visuals:** Lead capture popup backgrounds, incentive graphics ("Get 15% off — join now"), seasonal popup themes
- **Social proof graphics:** Review highlight cards, "X customers bought this" badges, UGC-style compositions
- **Brand-consistent everything:** Every visual respects the merchant's brand kit (colors, logo, typography, photography style)

**How it works (Technical approach):**
1. **Brand Kit Extraction** — On store connect, AI analyses the Shopify store's logo, colour palette, typography, product photography style, and visual tone (minimal, bold, playful, luxury, etc.). Stored as a BrandVisualProfile.
2. **Template-Based Generation** — For structured layouts (product grids, pricing cards, comparison tables), use HTML/CSS rendered to image via Puppeteer/Sharp. Fast, consistent, pixel-perfect, brand-coloured.
3. **AI Image Generation** — For hero banners, lifestyle imagery, seasonal themes, and creative that needs to feel "designed" — use AI image generation APIs (DALL-E 3, Flux, Ideogram) with brand-informed prompts.
4. **Product Image Processing** — Background removal, consistent resizing, shadow/reflection effects, overlay text/badges on product images using Sharp/Canvas.
5. **Smart Composition** — Combine product images + text overlays + brand elements into ready-to-use campaign visuals. The AI knows to put the product on the left if there's a CTA on the right, to use the brand's accent colour for sale badges, etc.
6. **A/B Visual Testing** — Automatically generate 2 visual variants per campaign for split testing (e.g., lifestyle hero vs product-focused hero, warm tones vs cool tones).

**Channel-specific creative specs:**
| Channel | Format | Specs |
|---------|--------|-------|
| Email hero | PNG/JPG | 600px wide, 2:1 or 3:1 ratio, <200KB |
| Email product card | PNG | 280px wide, 1:1 ratio |
| WhatsApp image | JPG | 1024x1024 max, <5MB |
| RCS rich card | JPG/PNG | 1440x720 recommended |
| SMS (MMS) | JPG | 640x640 max, <500KB |
| Popup background | PNG | 600x400 or 500x600, <300KB |
| Social proof card | PNG | 400x400, <150KB |

### Allo Concierge — The Conversation Layer
Talks to customers across WhatsApp, email, on-site widget, and support surfaces. This is the "speaking" layer.

**What it does (Phase 1 — Proactive Outreach):**
- Shipping delay notifications before customer asks
- Delivery confirmations with satisfaction check-in
- Restock alerts for interested customers
- Repurchase reminders timed to product cycles
- Post-purchase education and onboarding
- VIP recognition moments (milestone celebrations, early access)

**What it does (Phase 2 — Full Support):**
- Order status inquiries (instant, context-aware)
- Returns and exchanges (policy-aware, LTV-aware treatment)
- Product questions (answered from store data, not hallucinated)
- Size/fit/variant guidance
- Complaint handling with intelligent escalation
- The Support → Marketing Bridge: customer complains → suppress promos for 7 days → send recovery campaign after cooldown

---

## 3. The Autonomy Model: Merchant-Configurable Trust Levels

Merchants choose their comfort level per action category. This serves both the solo founder who wants set-and-forget AND the 5-person team that wants control.

### Three Tiers

**Autopilot** ("Just handle it")
- AI acts immediately, merchant sees daily/weekly recap
- Best for: Solo founders, proven action types, routine operations
- Example: AI sends win-back email to 12 at-risk customers at 2am → merchant sees "12 sent, 3 re-engaged" in morning briefing

**Co-pilot** ("Prepare it, I'll approve")
- AI prepares everything, queues with urgency scores and time-decay
- Best for: Small teams, new action types, higher-stakes decisions
- Example: "I've prepared a flash sale for 847 customers. Approve by 2pm for optimal timing. Expected revenue: $3,200-$4,800"

**Advisor** ("Suggest, I'll build")
- AI surfaces insights and recommends actions, merchant executes
- Best for: Larger teams with existing workflows, brand-sensitive categories
- Example: "Champions segment dropped 15% this month. Recommend VIP early-access campaign. Want me to draft one?"

### Per-Category Autonomy Matrix

| Action Category | Default | Can Be Set To |
|----------------|---------|---------------|
| Cart abandonment recovery | Co-pilot | Any |
| Repurchase reminders | Co-pilot | Any |
| Win-back sequences | Co-pilot | Any |
| Post-purchase education | Autopilot | Any |
| Shipping/delivery updates | Autopilot (always) | Autopilot only |
| Cross-sell campaigns | Co-pilot | Any |
| New campaign ideas | Co-pilot | Any |
| Discounts > 10% | Co-pilot | Co-pilot or Advisor |
| VIP communications | Co-pilot | Any |
| Segment reassignment | Autopilot | Any |
| Support responses (Phase 2) | Autopilot for simple, Co-pilot for complex | Any |
| Brand voice changes | Advisor | Advisor or Co-pilot |

### Confidence-Based Auto-Send
Within Co-pilot mode, the AI has a confidence score for each action. Merchants can set a threshold: "Auto-send anything above 85% confidence, queue everything else." This creates a natural progression — as the AI proves itself, merchants raise the threshold or switch categories to Autopilot.

---

## 4. User Stories — Merchant POV

### 4.1 Merchant as Founder/CXO (Persona: Priya, $400K skincare brand, solo)

**Story M1: First Day — Store Intelligence Report**
Priya connects Shopify. Within 30 minutes, AlloHQ tells her things about her business she didn't know:
- "2,847 customers. 312 Champions (11%), 891 At Risk (31%)"
- "Average order value: ₹4,500. Top 10% spend ₹12,000+"
- "Retention cliff at day 45 — customers who don't reorder by day 45 have 82% churn probability"
- "Vitamin C Serum has 47% repurchase rate at 60-day intervals"
- "Brand voice detected: warm, educational, science-backed"
- "Brand visual profile extracted: minimal photography style, warm cream palette (#F5E6D3, #2D1B4E), clean layout preference. I'll use this for all campaign visuals"
- "5 recommended automations with expected revenue impact"
- Baseline metrics captured for before/after comparison

**Story M2: Morning Briefing**
Priya opens AlloHQ at 8am. She doesn't see charts to interpret — she sees a narrative:
- "Yesterday: ₹28,000 revenue (up 12% vs last Tuesday). 3 campaigns sent. Best performer: win-back sequence (8.4% conversion)"
- "Overnight: 23 win-back emails sent to customers approaching churn cliff. 4 already clicked through"
- "Revenue from AI-managed campaigns in last 24h: ₹8,400"
- "Alert: Vitamin C Serum has 12 units left. 47 customers due for repurchase this week. Restock or pause automation?"
- "New insight: Customers who buy Product A then Product B within 30 days have 3x higher LTV. Cross-sell automation draft ready"
- "3 campaigns queued for your review"
- Delivered via: in-app dashboard + WhatsApp message (configurable)

**Story M3: The AI Spots What Humans Miss**
Micro-insights the AI surfaces that no human would find:
- "Sarah M. has spent ₹60,000 across 7 orders but hasn't ordered in 52 days (her average is 35 days). She's your #4 customer. Sending her a personal check-in — not a sale, just 'we miss you'"
- "23 customers bought the holiday gift set in December, none reordered. Likely gift-buyers, not self-purchasers. Holding off win-back emails, sending 'treat yourself' angle instead"
- "Instagram ad customers have 40% lower LTV than organic. SMS subscribers convert 2.3x better than email-only. Recommend shifting budget toward SMS capture"
- "Tuesdays at 10am generate 31% higher open rates than your current Thursday 2pm sends. Adjusting all scheduled campaigns"
- "3 customers left 1-star reviews this week. Flagged for personal outreach before they churn — draft emails ready"

**Story M4: Campaign Factory — Never Start From a Blank Page**
Priya never thinks "what should I send this week." The AI's campaign generation loop runs continuously:
1. Scans segments for actionable opportunities
2. Cross-references product catalog (stock, new arrivals, trending)
3. Checks calendar (holidays, brand dates, product launches)
4. Checks recent send history (avoid fatigue)
5. Generates campaign with content, subject line, product selection
6. **Generates all visuals** — hero banner, product showcase images, promotional badges, WhatsApp cards — all brand-consistent, no designer needed
7. Estimates revenue impact
8. Queues based on autonomy tier with urgency tag

**Campaign types generated proactively:**
- Repurchase reminders (per-product cycle timing)
- Win-back sequences (personalised to each customer's history)
- Cross-sell ("Customers like you also love...")
- New product announcements (targeted to relevant segments)
- VIP early access (Champions and Loyal only)
- Birthday/anniversary
- Seasonal relevance ("Summer routine update")
- Flash sales (triggered by inventory or revenue targets)
- Post-purchase education
- Re-engagement for cold subscribers
- Inventory urgency ("Almost gone — you showed interest")

**Story M5: Natural Language Command**
Priya talks to the AI and things happen:
- "I just launched a new moisturizer. Campaign for cleanser buyers" → AI creates targeted campaign with product hero image, brand-voiced copy, styled product cards, optimal send time
- "Why are sales down?" → "Your #1 product went out of stock 3 days ago. 43 customers tried to reorder. Back-in-stock notification ready"
- "Send something to VIPs" → One clarifying question, then creates full campaign with visuals and sends
- "Block emails to anyone who complained this month" → Identifies, suppresses, confirms
- "Create a flash sale graphic for 30% off summer collection" → Generates sale banner with product images, discount overlay, brand colours, sized for email + WhatsApp
- "Make the campaign visuals more premium, less salesy" → Regenerates with luxury aesthetic, softer tones, editorial layout
- "Show me what a win-back email would look like for customers who bought the serum" → Generates complete email with hero image, personalised copy, product recommendations, and preview across desktop + mobile

**Story M6: Set and Forget**
After week 1, Priya spends <30 minutes/week while generating more revenue than 10 hours/week on Klaviyo:
- AI continuously refines segments
- A/B tests subject lines, timing, content, AND visuals without being told
- Learns which campaigns work for which segments — including which visual styles drive higher clicks
- Adjusts brand voice and visual style as store evolves
- Scales send frequency based on engagement
- Detects seasonal patterns, prepares campaigns with seasonal creative in advance
- Creates and retires automations based on performance
- Monthly report: "AI-managed campaigns generated ₹84,000 this month across 847 sends"

### 4.2 Merchant as Team Lead (Persona: Marcus, $8M fashion brand, 4-person team)

**Story M7: Team Collaboration & Approval Workflows**
- Multi-user workspace with roles (Admin, Editor, Viewer)
- Approval queue with assign-to-team-member
- Activity log of all AI actions with timestamps
- Comments on campaigns before approval
- SLA escalation: "This campaign is optimal before 2pm. Unreviewed for 3 hours" → notify next person

**Story M8: Custom Guardrails**
Marcus sets rules the AI must follow:
- Max discount: 20%
- Max sends per customer per week: 3 (email), 1 (WhatsApp), 2 (SMS)
- Blocked words: [brand-specific]
- Required elements: legal disclaimer, unsubscribe, brand footer
- Spending caps: max ₹50,000 discount value per week
- Segment exclusions: "Never auto-send to complainers from last 30 days"
- Channel preferences per segment: "VIPs get WhatsApp, everyone else email"
- Quiet hours: No sends 10pm-7am in customer's timezone
- Post-discount cooldown: 14 days before next discount offer
- Campaign collision avoidance: no customer gets 2 campaigns in 48 hours
- Visual guardrails: no stock photography, always include logo, banned colour usage (e.g., "never use red for discount badges — brand uses teal"), minimum product image quality threshold
- Banned visual elements: merchant can flag specific styles ("no clip art", "no gradient backgrounds", "no text-heavy banners")

**Story M9: AI Performance Dashboard**
- AI Revenue Attribution: total from AI-created campaigns + automations
- Activity: campaigns created, emails sent, segments adjusted, anomalies detected
- Before/After: revenue per customer, open rates, churn rate vs pre-AlloHQ baseline
- Channel Performance: revenue per channel
- Customer Health: segment distribution trends over time
- Cost Efficiency: AI token cost vs revenue generated (show 100x+ ROI)
- AI-generated vs manual campaign performance comparison

---

## 5. User Stories — Customer POV (By Lifecycle Stage)

### 5.1 New Visitor (Browsing, Never Bought)

**Customer state:** "I've never bought. I'm browsing."

**Problems:** Too many products, not enough trust, indecision, uncertainty about size/fit/value.

**What AlloHQ does LIVE:**
- Detects browse depth, dwell time, product affinity, hesitation patterns
- Selectively engages — does NOT interrupt too early
- Offers contextual help: product recommendation, size guide, best-seller explanation, comparison
- Determines if popup/incentive/chat-nudge is appropriate based on behaviour signals

**What AlloHQ does in BACKGROUND:**
- Classifies visitor intent and purchase likelihood
- Captures event stream to customer profile
- Decides capture strategy (email popup? WhatsApp opt-in? No capture yet?)

**Principle:** Customer feels "helped," not "marketed to."

### 5.2 New Subscriber (Gave Email/WhatsApp, No Purchase)

**Customer state:** "I signed up but haven't bought."

**Problems:** Still unsure, considering competition, may forget brand, needs education/proof/reassurance.

**What AlloHQ does:**
- Identifies what blocked purchase: price sensitivity, trust gap, product confusion, timing, category education
- Sends personalised nurture flow (not a static drip):
  - Social proof + reviews
  - Founder story / brand mission
  - Product education
  - Use-case framing
  - Incentive ONLY when justified by behaviour signals
- Channel selection based on consent and likely responsiveness
- Watches behaviour after every send, recalculates purchase probability, adapts next message

**This is where AlloHQ beats static flows.** Every message adapts based on what the customer did or didn't do.

### 5.3 Cart Abandoner

**Customer state:** "I wanted something, but didn't finish."

**What AlloHQ does — NOT just "you left items in cart":**

Infers likely reason for abandonment:
- High cart value → price hesitation → social proof + payment plans
- Repeat product views + size page → fit uncertainty → size guide + returns guarantee
- Shipping page exit → delivery/cost concern → free shipping threshold nudge
- Long delay after add-to-cart → comparison shopping → competitive advantage messaging
- Low stock on item → urgency justified → "Only 3 left"
- Premium brand, no prior orders → trust reassurance first

**Multi-channel, behaviour-adaptive sequence:**
- 1 hour: WhatsApp (if opted in) — "Still thinking? Cart saved" — no discount
- 4 hours: Email with cart contents, product images
- 24 hours: If high-value cart, offer free shipping or small discount
- 48 hours: Final attempt with social proof
- After 48 hours: Stop. Add to "browsed but didn't buy" segment

**Additional intelligence:**
- Serial abandoner who always converts → "deliberate buyer," reduce nudges
- Abandoned item goes low-stock → trigger urgency
- Repeat abandoner who never buys → stop sequence earlier (window shopper)
- If customer buys elsewhere in journey → suppress immediately

### 5.4 First-Time Buyer

**Customer state:** "I bought. I'm excited but uncertain."

**Problems:** Order anxiety, delivery impatience, product use uncertainty, post-purchase regret risk.

**What AlloHQ does — product-specific, not generic:**
- Immediately: Order confirmation with personal touch ("Great choice! This serum works best on damp skin after cleansing")
- Day 2: How-to email with auto-generated product hero image, usage tips, application video, what to expect in week 1
- Day 5: WhatsApp check-in with product image card: "How's the serum treating your skin?" (conversational, feels human)
- Day 14: "Most customers start seeing results now. Here's what to look for..." — with visual timeline graphic
- Day 25: Data-driven cross-sell with styled product pairing image: "Pairs with Niacinamide Moisturizer — 2x better results. 15% off"
- Day 55: Repurchase reminder with product image + "Reorder" CTA based on THIS product's cycle

**Principles:**
- Timing based on THIS customer's behaviour, not fixed schedule
- Content AND visuals match product purchased (not generic stock imagery)
- Channel selection based on where customer is most responsive
- Every visual is brand-consistent (colours, fonts, photography style from BrandVisualProfile)
- If customer ignores first 2 touchpoints, AI backs off frequency
- Goal: turn first purchase into second purchase faster

### 5.5 Repeat Customer

**Customer state:** "I know the brand."

**What AlloHQ does:**
- Remembers purchase history — never recommends what they already own
- Adjusts tone: less educational, more insider/VIP
- Switches to preferred channel (learned from engagement patterns)
- Personalised recommendations based on their specific usage patterns
- Knows reorder cadence per product, sends reminders at the right time
- Identifies opportunities: refill, upgrade, complementary SKU, bundle, subscription
- Detects silent churn: customer is drifting below their usual frequency

### 5.6 High-Value / VIP Customer

**Customer state:** "I spend a lot and expect premium treatment."

**What AlloHQ does:**
- First access to new products (48h before launch)
- Higher discount tiers (but discounts are rare — VIPs value exclusivity over savings)
- WhatsApp-first communication (feels personal/exclusive)
- Never receives mass-blast campaigns — only personalised, relevant communication
- Milestone celebrations: "6 months with us! Here's your journey..."
- Surprise and delight: unexpected free sample, handwritten-style thank you
- If ANY issue (delayed shipping, wrong item) → flagged for immediate attention
- Stricter communication thresholds (less noise, higher relevance)

### 5.7 At-Risk Customer

**Customer state:** "I've stopped engaging or repurchasing."

**What AlloHQ does — escalating, respectful sequence:**
1. Day 40 (5 past usual): Soft check-in via preferred channel. "Hope you're loving your routine! Need advice?" — NO discount, no selling
2. Day 50: Relevant content push. "5 summer skincare tips for your skin type" — no selling, re-engagement
3. Day 58: Personalised offer. "Running low? 10% off your reorder" — targeted, modest
4. Day 70: Honest message. "It's been a while. If something wasn't right, we'd love to hear about it" — empathetic, opens dialogue
5. Day 90+: Reduce to monthly light touchpoints. Don't spam a lost customer

**Critical: The AI knows when to stop.** If customer doesn't respond to 4 touchpoints, it stops pushing. Aggressive sequences that send 8 emails in 2 weeks actively harm the brand. The AI respects silence.

**Diagnoses likely churn reason:** found alternatives, bad experience, no longer needs product, product mismatch, just forgot. Strategy changes based on diagnosis.

**Economic awareness:** Compares save likelihood vs CAC economics. Avoids wasting send budget on truly dead cohorts.

### 5.8 Customer Needing Support (Phase 2)

**Customer state:** "I need an answer now."

**What AlloHQ does:**
- Immediately identifies customer + order + issue context
- Responds in 3 seconds on WhatsApp with exact information
- Treatment calibrated by customer value:
  - Champion (₹45,000 spent, 12 orders) → immediate replacement/refund, no hoops, merchant flagged
  - First-time, low-value → standard policy, helpful but not exceptional
- Escalation that's actually smart: when AI can't resolve, it briefs merchant with full context (customer history, what was said, what AI tried, recommended resolution)
- The human picks up mid-conversation with full context, not from scratch

**The Support → Marketing Bridge (the biggest market gap):**
- Customer complains about shipping → AI resolves → customer automatically suppressed from promos for 7 days → after 7 days, recovery campaign: "We hope we made things right"
- Support interaction directly influences marketing journey
- This is something Klaviyo + Intercom/Gorgias literally cannot do because they don't share intelligence

---

## 6. The Three Operating Modes

### Mode 1: Merchant Live (Dashboard / App / WhatsApp)

AlloHQ acts as: Chief of Staff + Retention Lead + Support Lead + Analyst.

**What the merchant sees (Mission Control, not a dashboard):**
- What happened since last login
- What matters right now (ranked by revenue impact / urgency)
- What Allo already did
- What Allo wants approval on
- What needs human intervention
- What upside is available today

**"Do This Now" Alerts with time-decay:**
- "Flash sale from competitor started. 156 of your customers follow them. Counter-offer ready — 90-minute window"
- "Biggest customer (₹56,000 LTV) submitted support ticket about damaged product. Draft response ready — personal follow-up recommended"
- "Cart recovery window for 28 high-intent shoppers closing within 45 minutes"
- "Shipping delay complaints rose 18%. Suppressed upsells for affected cohort"

**UX principle:** Merchant feels "I don't need to navigate software. I operate the business through prompts + approvals."

### Mode 2: Customer Live (On Store / WhatsApp / Email)

AlloHQ acts as: Concierge + Product Advisor + Support Rep + Memory Layer.

**Possible live actions:**
- Answer product questions
- Help choose (size, variant, comparison)
- Assist checkout
- Recover abandonment
- Answer support queries
- Reassure post-purchase
- Guide returns/exchanges
- Recommend relevant products

**Decision tree for every interaction:**
1. Do nothing (often the best action)
2. Nudge
3. Answer
4. Suggest
5. Escalate
6. Suppress future comms

**Restraint matters.** Often the best action is no action. That restraint builds trust.

### Mode 3: Background Autonomous (24/7, No Human)

**This is where the moat gets built.**

| Process | Frequency | What It Does |
|---------|-----------|-------------|
| Customer Behaviour Scan | Every 1h | Detect anomalies, purchase pattern deviations, engagement drops per individual customer |
| Customer State Refresh | With every event | Update the Customer State Engine dimensions in real-time |
| Campaign Opportunity Scanner | Every 2h | Find segments/individuals with actionable opportunities, draft campaigns |
| Segment Refresh | Every 4h | Re-evaluate dynamic segments, detect movements, fire entry/exit triggers |
| Churn Predictor | Every 6h | Update churn probability for every customer, flag emergencies |
| Proactive Anomaly Detection | Every 6h | Churn spikes, revenue drops, inventory velocity, campaign underperformance, return rates |
| Send Time Optimizer | Nightly | Recalculate optimal send times per customer from recent engagement |
| Product Cycle Analyzer | Daily | Update repurchase cycle predictions per product |
| Revenue Forecaster | Daily | 7/30/90-day revenue projections from pipeline |
| Campaign Performance Learner | After each campaign | Analyse results, update models for subject lines, content, timing |
| Brand Voice Evolver | Weekly | Re-analyse recent communications, refine brand voice model |
| Brand Visual Profile Refresh | Weekly | Re-scan store for visual changes (new logo, colour updates, photography style shifts) |
| Product Image Processor | On product sync | Process new product images: background removal, consistent styling, multiple sizes |
| Creative Performance Learner | After each campaign | Track which visual styles get higher click rates per segment; feed into future generation |
| Inventory Monitor | Every 2h | Cross-reference stock with upcoming automations, flag conflicts |
| Morning Briefing Generator | Daily (merchant timezone) | Compile overnight activity + pending actions + insights |
| Weekly Intelligence Report | Sunday night | Projected revenue, cohort health, segment trends, strategic recommendations |
| Communication Governor | Before every send | Check per-customer fatigue, enforce frequency limits, channel conflicts |
| Support Conversation Summariser | Continuous | Flag escalations, detect patterns, feed into retention logic |
| A/B Test Evaluator | Continuous | Evaluate running tests, declare winners, apply learnings |

---

## 7. The Six Danger Zones (Design Defences)

### 1. Spam Risk
AI finds too many "opportunities" and over-communicates.
**Defence:** Communication Governor as first-class system. Per-customer fatigue tracking. Strict frequency limits. Channel conflict prevention. "Less is more" as a design principle.

### 2. Incorrect Confidence
AI sounds right but is wrong. Trust collapses instantly.
**Defence:** Confidence scoring on every action. Explainability ("here's why I recommend this"). Approval thresholds. Conservative defaults — when in doubt, queue for review.

### 3. Support Hallucination
Customer-facing AI invents order status, policies, or product details.
**Defence:** Retrieval-only for factual answers (order data from Shopify, policy from store docs). Scoped actions. Escalation when confidence is low. Never generate information — only retrieve and format.

### 4. Premium Brand Damage
Over-personalisation, over-discounting, or off-brand visuals feel cheap and damage brand perception.
**Defence:** Brand guardrails for copy AND visuals. Discount caps. Tone controls. BrandVisualProfile enforced on every generated asset. VIP customers get exclusivity, not discounts. Merchant reviews AI's brand voice AND visual interpretation during onboarding. Merchants can flag "banned elements" (no stock photos, no emoji, no bold red text, etc.). AI-generated images always respect photography style, colour palette, and visual tone from the brand kit.

### 5. Channel Fragmentation
Email, WhatsApp, SMS, site, support sending conflicting or redundant messages.
**Defence:** Unified Communication Governor. Single customer view across all channels. Campaign collision avoidance. Support-state suppression.

### 6. Operational Opacity
Merchant doesn't know what AI did or why.
**Defence:** Complete action log with audit trail. Every AI action tagged with reasoning. "AI did this because..." explanations in review queue. Monthly transparency report.

### 7. AI Creative Quality
AI-generated visuals look generic, cheap, or "obviously AI" — damaging brand perception.
**Defence:** Template-based generation for structured layouts (product grids, pricing cards) — these are pixel-perfect and controllable. AI image generation reserved for hero/lifestyle imagery only, with strict brand kit enforcement. Product images are always real (from Shopify catalog) — never AI-generated products. Merchant reviews visual style during onboarding and can override. Every generated asset is cached and reusable. Fallback to clean text-only layouts if visual quality score is below threshold. A/B test visual variants to learn what the audience actually clicks on.

---

## 8. Compliance Architecture

### Privacy Frameworks
GDPR (EU), DPDP Act (India), CCPA (California) all apply to global Shopify stores.

**Consent architecture:**
- Per-channel consent tracking (email, SMS, WhatsApp, RCS) — stored in Customer State Engine
- Consent captured at form/popup submission with explicit channel selection
- Double opt-in support for email (GDPR)
- WhatsApp opt-in compliant with Meta Business policies
- Right to deletion: customer data purge across all systems
- Data portability: export customer data on request
- Consent audit trail: when, where, how consent was given/withdrawn

### AI Transparency
- EU AI Act compliance: when customer interacts with support, they can ask "am I talking to AI?" and get an honest answer
- WhatsApp Business policies: business profile clearly identifies automated responses where required
- AI does NOT pretend to be a specific human — it represents the brand as a team

---

## 9. Architecture — Current State

### What Exists Today (Working)

```
allohq/
├── apps/
│   ├── api/          — tRPC standalone server (port 3001), 13 routers, Clerk JWT auth
│   ├── web/          — Next.js 15.5 dashboard, 15 route sections, glassmorphic UI
│   ├── workers/      — 14 BullMQ workers, 16 queues
│   └── widget/       — Embeddable storefront widget (stub)
├── packages/
│   ├── database/              — Prisma + PostgreSQL, ~45 models, pgvector
│   ├── messaging/             — Multi-channel: Email (Resend), SMS/WhatsApp/RCS (Twilio/Gupshup)
│   ├── email-builder/         — 14+ block types, AI generation, merge tags, HTML rendering
│   ├── agent-core/            — 12+ tools, multi-chat, 6 proactive detectors
│   ├── customer-intelligence/ — RFM scoring, LTV prediction, brand voice, cohort analysis
│   ├── ecommerce-integrations/— Shopify OAuth, full sync, webhooks, real-time updates
│   ├── analytics/             — Revenue analytics (stub)
│   ├── forms-and-popups/      — Lead capture (stub)
│   ├── product-recommendations/— ML recommendations (stub)
│   └── ui/                    — Shared utilities
```

**Completed phases:** Foundation, Shopify Integration, Customer Intelligence, Email Builder, Automations, Multi-Channel Messaging, Campaign Management, AI Agent System.

**Key existing capabilities:**
- Full Shopify sync with webhooks
- RFM/LTV/Segment engine with change detection
- Block-based email builder with AI generation
- Node-based automation workflows (trigger → delay → condition → send)
- Multi-channel messaging (email, SMS, WhatsApp, RCS)
- AI agent with 12+ tools, multi-chat, proactive observations
- Campaign CRUD with scheduling
- Glassmorphic dashboard UI with responsive design

### Architecture Gaps
1. **AI is reactive** — responds when asked, doesn't generate work products proactively
2. **No Customer State Engine** — intelligence is scattered across RFM, LTV, segments (not unified)
3. **No autonomy/approval system** — no concept of AI-drafted actions awaiting merchant review
4. **No Communication Governor** — no per-customer fatigue tracking or send limits
5. **No customer-facing conversations** — model exists but no actual channel
6. **No merchant notification layer** — can't reach merchant outside dashboard
7. **Automations are linear** — trigger → fixed sequence, not adaptive to customer response
8. **No product recommendations** — package is empty stub
9. **No forms/popups** — lead capture not built
10. **Analytics are thin** — no dedicated page, no channel breakdown, no multi-touch attribution

---

## 10. Architecture — Future State

### Conceptual Shift
**From:** Tool-driven AI assistant (tools exist, agent uses them when asked)
**To:** State-driven autonomous system (state updates continuously → policy decides actions → orchestrator executes → analytics close the loop)

### New Architecture Primitives

```
┌─────────────────────────────────────────────────────────────┐
│                    ALLO BRAIN                                │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Customer State    │  │ Store State       │                │
│  │ Engine            │  │ Engine            │                │
│  │                   │  │                   │                │
│  │ Per-customer:     │  │ Inventory         │                │
│  │ - lifecycle stage │  │ Revenue trends    │                │
│  │ - RFM/LTV        │  │ Segment health    │                │
│  │ - churn risk      │  │ Campaign pipeline │                │
│  │ - channel pref    │  │ Support load      │                │
│  │ - fatigue state   │  │ Anomalies         │                │
│  │ - intent          │  │ Opportunities     │                │
│  │ - support state   │  │                   │                │
│  └────────┬─────────┘  └────────┬──────────┘                │
│           │                      │                           │
│           └──────────┬───────────┘                           │
│                      ▼                                       │
│         ┌────────────────────────┐                           │
│         │ Decision / Policy      │                           │
│         │ Engine                 │                           │
│         │                        │                           │
│         │ "What should happen    │                           │
│         │  for this customer     │                           │
│         │  right now?"           │                           │
│         └────────────┬───────────┘                           │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    ALLO OPERATOR                             │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Autonomy Engine   │  │ Communication    │                │
│  │                   │  │ Governor         │                │
│  │ Check tier:       │  │                  │                │
│  │ - autopilot?      │  │ Fatigue check    │                │
│  │ - copilot?        │  │ Channel conflict │                │
│  │ - advisor?        │  │ Support suppress │                │
│  │                   │  │ Quiet hours      │                │
│  │ Check confidence  │  │ Collision avoid  │                │
│  │ Check guardrails  │  │                  │                │
│  └────────┬─────────┘  └────────┬──────────┘                │
│           │                      │                           │
│  ┌────────┴──────────────────────┴──────────┐                │
│  │ Creative Engine                           │                │
│  │                                           │                │
│  │ Brand kit → Template render / AI generate │                │
│  │ Product compose → Channel format          │                │
│  │ Visual A/B variants                       │                │
│  └────────────────────┬──────────────────────┘                │
│                       ▼                                      │
│         ┌────────────────────────┐                           │
│         │ Orchestration Engine   │                           │
│         │                        │                           │
│         │ Journey execution      │                           │
│         │ Campaign scheduling    │                           │
│         │ A/B test management    │                           │
│         │ Multi-channel routing  │                           │
│         └────────────┬───────────┘                           │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    ALLO CONCIERGE                            │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Outbound          │  │ Inbound          │                │
│  │                   │  │ (Phase 2)        │                │
│  │ Email             │  │                  │                │
│  │ SMS               │  │ WhatsApp support │                │
│  │ WhatsApp          │  │ Email support    │                │
│  │ RCS               │  │ On-site widget   │                │
│  │ Push (future)     │  │ Escalation       │                │
│  └───────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  LEARNING / FEEDBACK LOOP                    │
│                                                             │
│  Events → Attribution → Performance Analysis → Model Update │
│  → Better decisions next time                               │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  MERCHANT COPILOT LAYER                      │
│                                                             │
│  Mission Control Dashboard                                  │
│  Morning Briefing                                           │
│  Approval Queue                                             │
│  Natural Language Chat                                      │
│  WhatsApp/Email Notifications to Merchant                   │
│  Performance Reports                                        │
│  Guardrail Configuration                                    │
└─────────────────────────────────────────────────────────────┘
```

### New Package Structure

```
packages/
├── customer-state/            — NEW: Unified Customer State Engine
│   ├── state-engine.ts        — Core state calculation and update
│   ├── lifecycle-classifier.ts— Visitor → Subscriber → Buyer → ... → Lost
│   ├── intent-detector.ts     — Purchase intent scoring
│   ├── channel-preference.ts  — Per-customer channel learning
│   ├── fatigue-tracker.ts     — Per-customer communication fatigue
│   ├── reorder-predictor.ts   — Per-product repurchase timing
│   └── types.ts               — CustomerState type definition
│
├── decision-engine/           — NEW: Policy + Decision System
│   ├── policy-engine.ts       — "What should happen for this customer now?"
│   ├── opportunity-scanner.ts — Continuous opportunity detection
│   ├── revenue-estimator.ts   — Predict revenue impact of proposed actions
│   ├── guardrails.ts          — Merchant-configured rules validation
│   ├── confidence-scorer.ts   — Confidence for each proposed action
│   └── action-prioritiser.ts  — Rank actions by urgency × impact × confidence
│
├── autonomy-engine/           — NEW: Merchant Trust + Approval System
│   ├── autonomy-config.ts     — Per-merchant, per-category tier settings
│   ├── action-queue.ts        — Queue of AI-proposed actions
│   ├── approval-workflow.ts   — Route actions by tier + confidence
│   ├── urgency-scorer.ts      — Time-decay urgency on pending actions
│   └── escalation.ts          — SLA-based escalation for overdue approvals
│
├── communication-governor/    — NEW: Anti-Spam + Channel Coordination
│   ├── fatigue-manager.ts     — Per-customer frequency enforcement
│   ├── channel-arbitrator.ts  — Prevent channel conflicts
│   ├── support-suppressor.ts  — Suppress marketing during support issues
│   ├── quiet-hours.ts         — Timezone-aware send windows
│   ├── collision-detector.ts  — No two campaigns to same customer in 48h
│   └── cooldown-manager.ts    — Post-discount, post-complaint cooldowns
│
├── journey-orchestrator/      — NEW: Replaces Linear Automations
│   ├── journey-engine.ts      — Adaptive multi-channel journey execution
│   ├── channel-selector.ts    — Best channel per customer per message
│   ├── timing-optimizer.ts    — Per-customer optimal send time
│   ├── tone-adapter.ts        — Tone by lifecycle stage (new → loyal → VIP)
│   ├── content-personaliser.ts— Product-specific content per customer
│   ├── silence-detector.ts    — Know when to stop contacting
│   └── ab-testing.ts          — Automated experimentation on journeys
│
├── merchant-copilot/          — NEW: Merchant-Facing Intelligence
│   ├── briefing-generator.ts  — Daily/weekly digest compilation
│   ├── notification-router.ts — WhatsApp/email/in-app to merchant
│   ├── mission-control.ts     — "What matters right now" prioritisation
│   ├── store-intelligence.ts  — Initial store analysis report
│   ├── baseline-capture.ts    — Snapshot metrics at onboarding for before/after
│   └── performance-reporter.ts— Monthly AI performance reports
│
├── conversation-engine/       — NEW (Phase 2): Customer-Facing Support
│   ├── conversation-router.ts — Route inbound to AI or merchant
│   ├── context-builder.ts     — Full customer context for every conversation
│   ├── response-generator.ts  — Retrieval-based answers (not hallucinated)
│   ├── escalation-engine.ts   — Smart escalation with full brief
│   ├── support-marketing-bridge.ts — Feed support signals into retention
│   └── knowledge-base.ts      — Store policies, product info, FAQs
│
├── campaign-engine/           — NEW: Proactive Campaign Generation
│   ├── campaign-factory.ts    — Continuous campaign opportunity → draft pipeline
│   ├── calendar-awareness.ts  — Holidays, seasons, brand-specific dates
│   ├── inventory-aware.ts     — Stock levels influence campaign decisions
│   └── performance-learner.ts — Learn from past campaign results
│
├── creative-engine/           — NEW: AI Visual/Graphic Generation
│   ├── brand-kit.ts           — Extract and store brand visual profile (colors, fonts, photo style, logo)
│   ├── template-renderer.ts   — HTML/CSS → image for structured layouts (product grids, pricing cards, comparison tables)
│   ├── ai-image-generator.ts  — AI image generation for hero banners, lifestyle imagery, seasonal themes (DALL-E/Flux/Ideogram)
│   ├── product-composer.ts    — Product image processing: background removal, resizing, shadow/reflection, overlays
│   ├── overlay-engine.ts      — Text overlays, discount badges, urgency labels, CTA buttons on images
│   ├── channel-formatter.ts   — Resize/optimize for email, WhatsApp, RCS, SMS (MMS), popup specs
│   ├── visual-ab-tester.ts    — Generate visual variants for A/B testing
│   ├── asset-manager.ts       — Store, retrieve, cache generated assets (CDN integration)
│   └── types.ts               — BrandVisualProfile, CreativeAsset, ChannelSpec types
│
├── product-recommendations/   — REBUILD: Was empty stub
│   ├── affinity-matrix.ts     — "Bought X, also bought Y"
│   ├── collaborative-filter.ts— Cluster-based recommendations
│   ├── reorder-engine.ts      — Product-specific repurchase timing
│   ├── cross-sell.ts          — Next-best-product per customer
│   └── trending.ts            — "Trending in category" logic
│
├── forms-and-popups/          — BUILD: Was empty stub
│   ├── form-builder.ts        — Field types, validation, styling
│   ├── popup-engine.ts        — Trigger rules (exit intent, scroll, timer)
│   ├── incentive-logic.ts     — Discount code delivery on signup
│   ├── consent-capture.ts     — Per-channel opt-in with GDPR compliance
│   ├── ab-testing.ts          — Form/popup variant testing
│   └── embed-generator.ts     — Embeddable code for Shopify themes
│
├── analytics/                 — REBUILD: Was empty stub
│   ├── revenue-attribution.ts — Multi-touch attribution (first, last, linear)
│   ├── channel-breakdown.ts   — Revenue per channel
│   ├── ai-performance.ts      — AI-generated vs manual comparison
│   ├── cohort-tracker.ts      — Customer cohort health over time
│   ├── roi-calculator.ts      — AI cost vs revenue generated
│   └── export.ts              — CSV/PDF export
│
├── database/                  — EXTEND with new models
├── messaging/                 — KEEP (already well-built)
├── email-builder/             — EXTEND: integrate creative-engine for auto-generated visuals in email blocks
├── agent-core/                — EXTEND with new tools
├── customer-intelligence/     — KEEP, feed into customer-state
└── ecommerce-integrations/    — KEEP (Shopify solid)
```

### New Database Models (Key Additions)

```prisma
// Customer State Engine
model CustomerState {
  id                    String   @id @default(cuid())
  customerId            String   @unique
  storeId               String
  lifecycleStage        String   // visitor, subscriber, first_buyer, repeat, loyal, champion, at_risk, lost
  churnRisk             Float    // 0-1 probability
  churnRiskUpdatedAt    DateTime
  intentState           String   // browsing, considering, ready_to_buy, needs_help, inactive
  channelPreference     Json     // { email: 0.7, whatsapp: 0.9, sms: 0.3 }
  optimalSendWindow     Json     // { timezone: "Asia/Kolkata", bestHours: [10, 14, 19] }
  communicationFatigue  Json     // { email: { lastSent, countThisWeek }, whatsapp: {...} }
  discountSensitivity   Float    // 0-1
  supportState          String   // clear, open_issue, recent_complaint, escalated
  trustScore            Float    // 0-1
  vipLevel              String   // standard, silver, gold, platinum
  campaignEligibility   Json     // list of eligible campaign types
  lastStateUpdate       DateTime
  customer              Customer @relation(fields: [customerId], references: [id])
  store                 Store    @relation(fields: [storeId], references: [id])
  @@index([storeId, lifecycleStage])
  @@index([storeId, churnRisk])
}

// Autonomy + Approval
model AutonomyConfig {
  id        String @id @default(cuid())
  storeId   String
  category  String // routine_campaigns, proactive_outreach, discounts, vip_comms, etc.
  tier      String // autopilot, copilot, advisor
  settings  Json   // category-specific settings (e.g., confidence threshold for auto-send)
  store     Store  @relation(fields: [storeId], references: [id])
  @@unique([storeId, category])
}

model ActionQueue {
  id             String    @id @default(cuid())
  storeId        String
  type           String    // campaign, automation, outreach, alert
  status         String    // pending, approved, rejected, expired, auto_executed
  urgencyScore   Float
  confidenceScore Float
  expiresAt      DateTime?
  reasoning      String    // "Why I recommend this"
  estimatedRevenue Float?
  payload        Json
  createdAt      DateTime  @default(now())
  reviewedBy     String?
  reviewedAt     DateTime?
  assignedTo     String?   // team member for review
  store          Store     @relation(fields: [storeId], references: [id])
  @@index([storeId, status])
  @@index([storeId, urgencyScore])
}

// Guardrails
model Guardrail {
  id        String @id @default(cuid())
  storeId   String
  ruleType  String // max_discount, max_sends_per_week, blocked_words, quiet_hours, etc.
  ruleValue Json
  isActive  Boolean @default(true)
  store     Store   @relation(fields: [storeId], references: [id])
  @@index([storeId, ruleType])
}

// Communication Governor
model CustomerFatigueLog {
  id          String   @id @default(cuid())
  customerId  String
  storeId     String
  channel     String
  messageType String   // campaign, automation, proactive, support
  campaignId  String?
  sentAt      DateTime @default(now())
  @@index([customerId, storeId, channel, sentAt])
}

// Product Intelligence
model ProductRepurchaseCycle {
  id              String   @id @default(cuid())
  productId       String
  storeId         String
  medianDays      Int
  avgDays         Float
  sampleSize      Int
  confidence      Float
  lastCalculated  DateTime
  @@unique([productId, storeId])
}

// Adaptive Journeys
model CustomerJourney {
  id            String    @id @default(cuid())
  customerId    String
  storeId       String
  journeyType   String    // post_purchase, win_back, nurture, onboarding, cross_sell
  currentStep   Int
  status        String    // active, completed, suppressed, paused
  channelPath   Json      // ["email", "whatsapp", "email"] — actual channels used
  stepHistory   Json      // log of each step with timing, channel, response
  startedAt     DateTime
  lastStepAt    DateTime?
  completedAt   DateTime?
  suppressedAt  DateTime?
  suppressReason String?  // "silence_detected", "support_issue", "customer_purchased"
  @@index([storeId, status])
  @@index([customerId, status])
}

// A/B Testing
model ABTest {
  id            String    @id @default(cuid())
  storeId       String
  campaignId    String?
  journeyId     String?
  variable      String    // subject_line, send_time, content, channel
  variantA      Json
  variantB      Json
  sampleSizeA   Int       @default(0)
  sampleSizeB   Int       @default(0)
  resultA       Json?
  resultB       Json?
  winner        String?   // "A", "B", "inconclusive"
  status        String    // running, completed, inconclusive
  startedAt     DateTime
  completedAt   DateTime?
  @@index([storeId, status])
}

// Merchant Briefing
model MerchantBriefing {
  id            String    @id @default(cuid())
  storeId       String
  type          String    // daily, weekly, alert
  content       Json
  deliveredVia  String[]  // ["in_app", "whatsapp", "email"]
  readAt        DateTime?
  createdAt     DateTime  @default(now())
  @@index([storeId, type, createdAt])
}

// Store Baseline (for before/after comparison)
model StoreBaseline {
  id              String   @id @default(cuid())
  storeId         String   @unique
  capturedAt      DateTime
  metrics         Json     // snapshot of all KPIs at onboarding
}

// Brand Visual Profile (for creative engine)
model BrandVisualProfile {
  id                String   @id @default(cuid())
  storeId           String   @unique
  primaryColors     Json     // extracted from store: ["#2D1B4E", "#F5E6D3", ...]
  accentColors      Json     // CTA and highlight colours
  fontFamily        String?  // detected primary font
  logoUrl           String?  // stored logo asset
  logoVariants      Json?    // { dark: url, light: url, icon: url }
  photographyStyle  String   // "minimal", "lifestyle", "bold", "luxury", "playful"
  visualTone        String   // "warm", "cool", "neutral", "vibrant"
  layoutPreference  String   // "clean", "dense", "editorial", "product-forward"
  bannedElements    Json?    // merchant overrides: no stock photos, no emoji, etc.
  extractedAt       DateTime
  updatedAt         DateTime @updatedAt
  store             Store    @relation(fields: [storeId], references: [id])
}

// Generated Creative Assets
model CreativeAsset {
  id              String   @id @default(cuid())
  storeId         String
  type            String   // "hero_banner", "product_card", "promo_badge", "whatsapp_card", "popup_bg", "social_proof"
  generationMethod String  // "template", "ai_generated", "product_composite", "overlay"
  sourcePrompt    String?  // AI prompt used (if AI-generated)
  templateId      String?  // template used (if template-based)
  imageUrl        String   // stored asset URL
  thumbnailUrl    String?
  width           Int
  height          Int
  fileSizeBytes   Int
  format          String   // "png", "jpg", "webp"
  channel         String   // "email", "whatsapp", "rcs", "sms_mms", "popup", "universal"
  campaignId      String?  // linked campaign if generated for one
  metadata        Json?    // additional context: products featured, colors used, text overlays
  createdAt       DateTime @default(now())
  store           Store    @relation(fields: [storeId], references: [id])
  @@index([storeId, type])
  @@index([storeId, campaignId])
}
```

### New Workers

| Worker | Queue | Schedule | Purpose |
|--------|-------|----------|---------|
| `customer-state-updater` | CUSTOMER_STATE | Event-driven | Update CustomerState on every order, click, open, support event |
| `opportunity-scanner` | OPPORTUNITY_SCAN | Every 2h | Scan for campaign opportunities, feed to campaign-factory |
| `campaign-factory` | CAMPAIGN_FACTORY | On-demand | Generate campaign drafts from opportunities |
| `send-time-optimizer` | SEND_TIME | Nightly | Recalculate per-customer optimal send times |
| `briefing-generator` | MERCHANT_BRIEFING | Daily | Generate morning briefing per merchant timezone |
| `product-cycle-analyzer` | PRODUCT_CYCLES | Daily | Calculate product repurchase cycles |
| `journey-stepper` | JOURNEY_STEP | On-demand | Execute next adaptive journey step per customer |
| `ab-test-evaluator` | AB_TEST | Continuous | Evaluate running A/B tests, declare winners |
| `revenue-forecaster` | REVENUE_FORECAST | Daily | Project revenue from pipeline |
| `inventory-monitor` | INVENTORY_CHECK | Every 2h | Stock vs automation conflict detection |
| `guardrail-validator` | GUARDRAIL_CHECK | Pre-send | Validate every outgoing message against rules |
| `fatigue-checker` | FATIGUE_CHECK | Pre-send | Per-customer frequency enforcement |
| `weekly-report` | WEEKLY_REPORT | Sunday night | Generate weekly intelligence report |
| `baseline-capture` | BASELINE | On-connect | Snapshot store metrics at onboarding |
| `creative-generator` | CREATIVE_GEN | On-demand | Generate visuals for campaigns, journeys, popups |
| `brand-kit-extractor` | BRAND_KIT | On-connect + weekly | Extract/refresh brand visual profile from store |
| `product-image-processor` | PRODUCT_IMAGE | On-sync | Background removal, resizing, consistent styling for product images |

### Extended Agent Tools (New)

| Tool | Purpose |
|------|---------|
| `analyze_customer_anomaly` | "Why is this customer behaving differently?" |
| `generate_store_intelligence` | Comprehensive store analysis on first connect |
| `estimate_campaign_revenue` | Predict revenue from proposed campaign |
| `detect_purchase_cycles` | Per-product repurchase timing |
| `classify_customer_intent` | Gift buyer, window shopper, deliberate buyer |
| `create_adaptive_journey` | Build multi-channel adaptive sequence |
| `check_inventory_conflicts` | Stock vs planned sends |
| `generate_briefing` | Compile overnight activity |
| `root_cause_analysis` | "Why are sales down?" |
| `compare_periods` | Week-over-week, month-over-month |
| `manage_guardrails` | View/edit merchant rules |
| `review_action_queue` | Show pending AI actions |
| `approve_action` | Approve/reject queued action |
| `configure_autonomy` | Change autonomy tier per category |
| `generate_support_brief` | Full context for escalated support |
| `generate_campaign_visual` | Create hero banner, product card, or promo graphic for a campaign |
| `generate_product_showcase` | Create styled product image with background, overlay, badge |
| `generate_visual_variants` | Create A/B visual variants for split testing |
| `update_brand_visual_profile` | Refresh brand kit from store changes |

---

## 11. Implementation Plan — Phased Sprints

### V1: "AI Retention Operator for Shopify Brands"
Goal: Merchant can connect store and have AI autonomously manage retention within configured guardrails.

#### Sprint 1 (Weeks 1-2): Customer State Engine + Autonomy Foundation
**Why first:** Everything depends on unified customer state and the autonomy system.

**Tasks:**
1. Create `packages/customer-state/` with CustomerState model and state engine
2. Migration: Add CustomerState, AutonomyConfig, ActionQueue, Guardrail, CustomerFatigueLog models
3. Build customer-state-updater worker (listens to order/click/open events, updates state)
4. Build autonomy-config tRPC router (CRUD for per-category tier settings)
5. Build action-queue tRPC router (list, approve, reject, auto-execute)
6. Build guardrails tRPC router (CRUD for merchant rules)
7. Settings UI: Autonomy tier configuration per category
8. Settings UI: Guardrails configuration

#### Sprint 2 (Weeks 3-4): Communication Governor + Fatigue Management
**Why next:** Must prevent spam before enabling proactive campaigns.

**Tasks:**
1. Create `packages/communication-governor/`
2. Build fatigue-manager: per-customer frequency tracking and enforcement
3. Build channel-arbitrator: prevent duplicate sends across channels
4. Build quiet-hours checker: timezone-aware send windows
5. Build collision-detector: no 2 campaigns to same customer in 48h
6. Build support-suppressor: suppress marketing during open support issues
7. Build cooldown-manager: post-discount, post-complaint cooldowns
8. Integrate governor as pre-send check in messaging pipeline
9. Migration: Add CustomerFatigueLog
10. Guardrail validation worker (pre-send)

#### Sprint 3 (Weeks 5-6): Proactive Campaign Engine + Creative Engine
**Why next:** Highest-value feature — AI creating campaigns AND their visuals without human input.

**Tasks:**
1. Create `packages/campaign-engine/`
2. Create `packages/creative-engine/`
3. Build brand-kit-extractor: on store connect, analyse Shopify store for colors, fonts, photography style, logo → BrandVisualProfile
4. Build template-renderer: HTML/CSS → image for structured layouts (product grids, sale banners, pricing cards) using Puppeteer + Sharp
5. Build product-composer: background removal (rembg/remove.bg API), consistent resizing, shadow effects, overlay text/badges on product images
6. Build ai-image-generator: integration with image generation APIs (DALL-E 3 / Flux / Ideogram) for hero banners, lifestyle imagery, seasonal themes — brand-informed prompts using BrandVisualProfile
7. Build overlay-engine: text overlays, discount badges ("20% OFF"), urgency labels ("Only 3 left"), CTA buttons on images
8. Build channel-formatter: resize and optimise generated assets per channel specs (email 600px, WhatsApp 1024px, RCS, MMS, popup)
9. Build opportunity-scanner worker (every 2h): scan segments for actionable opportunities
10. Build campaign-factory: generate campaign drafts WITH visuals from opportunities (leverage existing AI email generation + new creative engine)
11. Build revenue-estimator: predict revenue impact
12. Build calendar-awareness: seasonal/holiday campaign triggers
13. Build inventory-aware module: stock levels influence decisions
14. Route campaigns through autonomy engine (autopilot → send, copilot → queue)
15. Action queue UI: review AI-drafted campaigns with visuals, reasoning, estimated revenue, confidence
16. Campaign approval flow: approve/edit/reject/dismiss
17. Migration: Add BrandVisualProfile, CreativeAsset
18. creative-generator worker + brand-kit-extractor worker + product-image-processor worker

#### Sprint 4 (Weeks 7-8): Merchant Copilot + Briefing System
**Why next:** Builds merchant trust, demonstrates AI value.

**Tasks:**
1. Create `packages/merchant-copilot/`
2. Build briefing-generator worker: daily digest compilation
3. Build notification-router: WhatsApp/email/in-app delivery to merchant
4. Build store-intelligence report (first-run comprehensive analysis)
5. Build baseline-capture: snapshot metrics at onboarding
6. Build Mission Control UI (replaces current dashboard):
   - Narrative summary instead of raw charts
   - "What happened" / "What matters" / "What needs approval" sections
   - Action queue embedded
   - "Do this now" alerts with urgency
7. Settings: merchant notification preferences (channel, frequency, types)
8. Migration: Add MerchantBriefing, StoreBaseline

#### Sprint 5 (Weeks 9-10): Adaptive Journey Orchestrator
**Why next:** Transforms static automations into intelligent, multi-channel journeys.

**Tasks:**
1. Create `packages/journey-orchestrator/`
2. Build journey-engine: adaptive multi-channel execution
3. Build channel-selector: best channel per customer per message (uses CustomerState.channelPreference)
4. Build timing-optimizer: per-customer send time (uses CustomerState.optimalSendWindow)
5. Build tone-adapter: tone by lifecycle stage
6. Build content-personaliser: product-specific content per customer
7. Build silence-detector: auto-suppress after N unresponded touches
8. Journey stepper worker: execute next step based on customer response
9. Migration: Add CustomerJourney
10. Journey builder UI (upgrade existing automation builder)

#### Sprint 6 (Weeks 11-12): Forms, Popups + Lead Capture
**Why next:** Critical for top-of-funnel. Without this, the concierge has no new customers to work with.

**Tasks:**
1. Build `packages/forms-and-popups/`
2. Form builder UI: drag-drop fields, styling, preview
3. Popup builder: trigger rules (exit intent, scroll %, timer, page load)
4. Consent capture with per-channel opt-in (GDPR compliant)
5. Incentive logic: discount code delivery on signup
6. Two-step opt-in: email → SMS/WhatsApp
7. Embed code generator for Shopify themes
8. Form submission tracking → CustomerState update
9. tRPC forms router
10. Database models: Form, Popup, FormSubmission
11. A/B testing for form variants

#### Sprint 7 (Weeks 13-14): Analytics Dashboard + Learning Loop
**Why next:** Close the feedback loop. The AI must learn from results and merchants must see proof of value.

**Tasks:**
1. Rebuild `packages/analytics/`
2. Dedicated analytics dashboard page
3. Revenue attribution: last-click + first-click + linear multi-touch
4. Revenue by channel breakdown
5. AI performance dashboard: AI-generated vs manual comparison
6. Before/after baseline comparison
7. Cohort health trends over time
8. A/B testing framework + evaluator worker
9. Campaign performance learner: feed results back into campaign-factory
10. Monthly AI performance report generator
11. CSV/PDF export from any analytics view
12. Token cost vs revenue ROI calculation

### V2: "AI Retention + Support Teammate"
Goal: Customer-facing AI support that feeds intelligence back into retention.

#### Sprint 8 (Weeks 15-16): Product Recommendations
1. Rebuild `packages/product-recommendations/`
2. Purchase affinity matrix ("bought X, also bought Y")
3. Collaborative filtering by customer cluster
4. Reorder engine: per-product cycle timing
5. Cross-sell logic: next-best-product per customer
6. Dynamic product blocks in email builder
7. Product recommendation worker
8. Integration into journey orchestrator (cross-sell step in post-purchase journeys)

#### Sprint 9 (Weeks 17-18): Proactive Customer Outreach
1. Shipping update proactive messages (Shopify fulfillment webhooks)
2. Delivery confirmation outreach
3. Restock alerts for browsed/wishlisted/abandoned products
4. Price drop notifications
5. Product cycle repurchase reminders (timed to per-customer cycle)
6. Inventory monitor worker: cross-reference stock with planned sends

#### Sprint 10 (Weeks 19-22): Customer-Facing Support (Allo Concierge Phase 2)
1. Create `packages/conversation-engine/`
2. WhatsApp Business API two-way messaging
3. Conversation router: AI handles or escalate
4. Context builder: full customer history for every conversation
5. Response generator: retrieval-based (order data, policy docs, product info — NOT hallucinated)
6. Knowledge base: store policies, FAQs, product info
7. Escalation engine: brief merchant with full context
8. Support → Marketing bridge: auto-suppress promos during/after support issues
9. Support sentiment tracking → CustomerState update
10. Conversation UI in merchant dashboard

### V3: "Autonomous Commerce Relationship OS"
Goal: Near-self-running lifecycle + support with merchant as supervisor.

#### Sprint 11+ (Weeks 23+):
- Reinforcement learning from outcomes
- Dynamic recommendations that evolve with store data
- Competitor/seasonal signal watching
- WooCommerce/BigCommerce integrations
- Agency multi-store management
- Advanced A/B testing (multi-variate)
- Predictive revenue modelling
- Customer-facing on-site concierge widget
- Review platform integrations (Yotpo, Judge.me)
- Loyalty program integrations (Smile.io)

---

## 12. Claude Code Implementation Guide

### How to Use This Document with Claude Code

This document serves as the master reference for every implementation session. When working with Claude Code, follow this approach:

### Session Structure

**Before each sprint, provide Claude Code with:**
1. This master plan document (for context on the full vision)
2. The ARCHITECTURE.md file (for current technical state)
3. The specific sprint section you're working on
4. Any relevant existing code files from the codebase

**Prompt template for starting a sprint:**
```
I'm working on AlloHQ, an autonomous relationship platform for commerce brands.

[Paste relevant section of this master plan]

Here's the current ARCHITECTURE.md: [paste]

We're starting Sprint [N]: [Sprint Name].

The tasks for this sprint are:
[paste sprint tasks]

Let's begin with task 1. Here are the relevant existing files:
[paste or reference existing code]
```

### Implementation Order Within Each Sprint

For each sprint, follow this order:
1. **Database first** — Create Prisma models, run migration
2. **Package/business logic** — Build the core package with types, engine, utilities
3. **Workers** — Build BullMQ workers that use the package
4. **tRPC routers** — API endpoints that expose the functionality
5. **UI last** — Dashboard pages and components

### Key Principles for Claude Code Sessions

1. **One package at a time.** Don't try to build everything in one session. Focus on one package or one worker per session.

2. **Types first.** Always start with TypeScript types/interfaces. This forces clear thinking about the data model before implementation.

3. **Test with existing data.** After building a new package, test it against the existing Shopify-synced data in the database. Don't just build — verify.

4. **Integration points matter.** After each new package, explicitly wire it into the existing system (e.g., new pre-send check → integrate into messaging pipeline).

5. **Preserve what works.** The existing messaging, email-builder, agent-core, and ecommerce-integrations packages are solid. Extend, don't rewrite.

### Sprint-by-Sprint Claude Code Prompts

#### Sprint 1, Session 1: CustomerState Model + Migration
```
We need to add the CustomerState model to the Prisma schema.
Here's the current schema: [paste packages/database/prisma/schema.prisma]
Add these models: CustomerState, AutonomyConfig, ActionQueue, Guardrail, CustomerFatigueLog
Then create and run the migration.
```

#### Sprint 1, Session 2: Customer State Engine Package
```
Create packages/customer-state/ with:
- types.ts — CustomerState interface with all dimensions
- state-engine.ts — Functions to calculate and update state from raw data (orders, RFM scores, message logs)
- lifecycle-classifier.ts — Classify customer lifecycle stage from behaviour data

Use existing data from: RfmScore, CustomerLifetimeValue, MessageLog, Order models.
The state engine should be called whenever an event occurs (order created, email opened, etc.)
```

#### Sprint 1, Session 3: Autonomy Engine Package
```
Create packages/autonomy-engine/ with:
- autonomy-config.ts — Read/write per-merchant, per-category tier settings
- action-queue.ts — Create, list, approve, reject, auto-execute actions
- approval-workflow.ts — Given an action + autonomy tier + confidence, decide: execute, queue, or suggest

This is the gatekeeper for every AI action.
```

#### Sprint 3, Session 1: Brand Kit Extractor
```
Create packages/creative-engine/ with:
- types.ts — BrandVisualProfile interface (primaryColors, accentColors, fontFamily, photographyStyle, visualTone, layoutPreference, bannedElements)
- brand-kit.ts — Extract brand visual profile from Shopify store:
  1. Fetch store logo, favicon
  2. Scrape store homepage for dominant colours (from CSS/images)
  3. Detect photography style from product images (minimal, lifestyle, bold)
  4. Store as BrandVisualProfile in database

Use existing Shopify client from ecommerce-integrations.
This runs on store connect and weekly thereafter.
```

#### Sprint 3, Session 2: Template Renderer + Product Composer
```
In packages/creative-engine/:
- template-renderer.ts — HTML/CSS templates → PNG images using Puppeteer:
  - Product grid template (2x2, 3x1 layouts)
  - Sale banner template (product + discount overlay)
  - Hero banner template (lifestyle image + text overlay)
  - All templates use BrandVisualProfile for colours, fonts
- product-composer.ts — Product image processing using Sharp:
  - Background removal (white bg → transparent)
  - Consistent resizing to standard dimensions
  - Shadow/reflection effects
  - Overlay text (price, discount badge, "New" tag)
- channel-formatter.ts — Resize/optimise for each channel's specs
```

#### Sprint 3, Session 3: AI Image Generation + Campaign Integration
```
In packages/creative-engine/:
- ai-image-generator.ts — Integration with DALL-E 3 / Flux API:
  - Generate hero banners from brand-informed prompts
  - Seasonal/holiday themed imagery
  - Lifestyle images matching brand photography style
  - Always include BrandVisualProfile constraints in prompts
- asset-manager.ts — Store generated assets, link to campaigns, cache for reuse

Then integrate creative-engine into campaign-factory:
- When campaign-factory generates a draft, also generate visuals
- Attach CreativeAsset records to campaigns
- Email builder auto-populates hero block with generated image
```

[Continue this pattern for each session in each sprint]

### File Naming Conventions
- Packages: `packages/[package-name]/src/[module].ts`
- Workers: `apps/workers/src/[worker-name].worker.ts`
- tRPC routers: `apps/api/src/routers/[router-name].ts`
- UI pages: `apps/web/app/(dashboard)/[section]/page.tsx`
- UI components: `apps/web/components/[section]/[Component].tsx`

### Critical Integration Points to Track

After each sprint, verify these connections:

| Sprint | Integration Check |
|--------|------------------|
| 1 | CustomerState updates when orders/events arrive |
| 2 | Every send passes through Communication Governor |
| 3 | Campaign Factory outputs include AI-generated visuals; creative assets stored and linked; brand kit enforced on all generated images |
| 4 | Briefing pulls from Action Queue + recent AI activity |
| 5 | Journeys use CustomerState for channel/timing/tone decisions; journey emails include auto-generated visuals |
| 6 | Form submissions update CustomerState and consent; popup visuals auto-generated from brand kit |
| 7 | Campaign results (including visual A/B tests) feed back into Performance Learner |

---

## 13. Success Metrics

### V1 Success (AI Retention Operator)
- Merchant spends <30 min/week on retention (vs 8-10 hours on Klaviyo)
- AI-attributed revenue visible in dashboard within first week
- 100% of campaigns pass through Communication Governor (zero spam risk)
- Merchant can configure autonomy in <5 minutes
- Morning briefing delivered daily on time
- **Zero campaigns require external design tool** — all visuals generated in-platform, brand-consistent
- **Merchant approval rate >80%** on AI-generated campaigns (copy + visuals) without edits

### V2 Success (Retention + Support)
- 80%+ of support queries resolved without human intervention
- Support signals suppress marketing within 1 minute of complaint
- Zero hallucinated support responses (retrieval-only for factual data)
- Customer satisfaction maintained or improved vs human-only support

### V3 Success (Autonomous Relationship OS)
- AI manages full lifecycle with merchant checking in weekly, not daily
- Revenue per customer increases 20%+ vs pre-AlloHQ baseline
- Churn rate decreases 15%+ vs baseline
- One merchant can run what previously required 3-5 person team

---

## 14. The Moat (Why This Is Hard to Copy)

1. **Data flywheel:** Every send, open, click, purchase, silence teaches the AI. After 6 months, the system knows individual customer rhythms no human could track.

2. **Compound autonomy:** Better results → more merchant trust → more autonomy → faster actions → even better results.

3. **Unified intelligence:** Support and marketing share the same brain. Complaints suppress promos. Good support leads to better retention. No one else has this.

4. **Multi-channel orchestration:** Same AI managing email + SMS + WhatsApp + RCS across marketing and support. Klaviyo can't do WhatsApp support. Intercom can't do RCS marketing.

5. **Revenue proof:** Every action attributed to revenue. Merchants know exactly what the AI earns them. Makes cancellation nearly impossible.

6. **Full-stack creative:** Klaviyo gives you a blank email builder. AlloHQ generates the copy, the visuals, the product images, the banners — all brand-consistent, all channel-optimised. The merchant never opens Canva. This is the difference between a tool and a teammate.

7. **Replace, don't assist:** Klaviyo assists marketers. AlloHQ replaces the need for them. For a $500K brand, that's the difference between hiring a $60K/year marketer AND a $40K/year designer and paying $199/month for AlloHQ.
