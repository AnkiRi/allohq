# AlloHQ V3 Build Plan: From Product to Platform Moat

This plan combines three inputs:
1. Claude Code's honest audit (13 gaps/features identified)
2. The positioning & moat strategy (ethics-first, outcome pricing, cross-store learning)
3. The AI training roadmap (5 levels from LLM reasoning → reinforcement learning)

Organized into 4 sprints. Each sprint has a theme that maps to
a moat-building objective, not just feature completion.

---

## SPRINT 11: "The Product Actually Works" (P0 fixes)

**Theme:** Close every gap that would embarrass you in a demo or
break trust with an early user. No moat matters if the basics are broken.

### 11.1 Settings Page — Full Implementation
Claude Code flagged: guardrails, autonomy tiers, team management,
notification preferences all have routes but no UI.

Build:
- Guardrails management: CRUD for message frequency limits,
  discount caps, quiet hours, banned words
- Autonomy tier configuration: per-category (cart recovery,
  win-back, post-purchase, etc.) with Autopilot/Copilot/Advisor toggle
- Notification preferences: how/when the merchant gets notified
  (email digest, real-time push, in-app only)
- Brand voice settings: tone sliders, vocabulary, banned phrases
  (move from onboarding to settings for ongoing editing)
- Appearance: light/dark/system theme toggle (from UI implementation)
- Integrations status: connected services with disconnect option

### 11.2 Customer Fatigue & Suppression Logic
Claude Code flagged: CustomerFatigueLog model exists but has zero logic.

This IS the ethics moat. Without it, AlloHQ is just another spam tool.

Build:
- Fatigue scoring: track messages sent per customer per channel
  per time window (24h, 7d, 30d)
- Suppression rules: if customer received N+ messages in window,
  suppress additional sends. Log suppression reason.
- Cool-down after negative signals: if customer unsubscribed from
  one channel, suppress ALL channels for X days
- Support suppression: if customer has open support ticket,
  suppress all marketing (this exists in communication-governor
  but verify it actually works end-to-end)
- Fatigue dashboard: in Settings, show "Messages suppressed this
  week: 47" with breakdown by reason. This is a SELLING POINT —
  "Allo prevented 47 messages that would have annoyed your customers"

### 11.3 Conversations Router + Real Inbox UI
Claude Code flagged: Sprint 10 promise but currently hollow.

Build:
- conversations tRPC router: list, getById, reply, resolve, escalate,
  assignToMerchant, getContext
- Inbox UI at /conversations: list view with status filters
  (Active, Escalated, Resolved), search, customer preview
- Conversation detail view: full thread, customer context sidebar
  (CustomerState, orders, recent messages), reply input
- Merchant takeover: button to take over from AI mid-conversation
- AI brief on escalated conversations: what the AI tried, what
  failed, recommended resolution
- Wire to WhatsApp inbound webhook (Gupshup) → conversation-engine
  → inbox

### 11.4 Customer State Machine — Wire the Brain
Claude Code flagged: CustomerState has all the fields but no
business logic or transitions.

Build:
- State transition engine: define rules for lifecycle stage
  transitions (new → active → loyal → champion / at_risk →
  hibernating → lost)
- Transition triggers: purchase events, time-based decay,
  engagement signals, support sentiment
- Transition hooks: when a customer moves to "at_risk", auto-queue
  an intervention. When they move to "champion", auto-queue a
  VIP recognition.
- Expose via API: customerState.getTransitionHistory(customerId)
  — shows the full journey of state changes with timestamps
- Dashboard integration: customer detail page shows state timeline

### 11.5 Store Disconnect Cleanup
- When a store disconnects: cancel all active automations,
  pause all scheduled sends, mark ActionQueue items as cancelled,
  optionally archive or delete store data after 30 days
- Prevent orphaned workers from processing disconnected stores

**Sprint 11 delivers:** A product that doesn't break when real users
touch it. Settings work, conversations work, fatigue prevention works,
customer state actually transitions. This is table stakes.

---

## SPRINT 12: "The AI That Pays for Itself" (Revenue & Moat)

**Theme:** Build the features that prove AlloHQ's value in dollars
and make the ethics-first positioning concrete and measurable.

### 12.1 Outcome-Based Revenue Attribution
This is the foundation for outcome-based pricing (the business model moat).

Build:
- Enhanced MessageLog tracking: add `outcome`, `outcomeRevenue`,
  `outcomeTimestamp`, `customerStateAtSend`, `messageFeatures`
  fields (if not already present)
- Attribution engine: when a purchase happens, attribute it to
  the most recent AI-initiated touchpoint within a 7-day window.
  Multi-touch attribution: first-touch, last-touch, linear split.
- Revenue dashboard widget: "AI-Attributed Revenue This Month: $12,340"
  with breakdown by automation type, campaign, channel
- Cost tracking: AI inference cost per action (already partially
  built). Show ROI: "AI spent $2.41 → generated $12,340 = 5,122x ROI"
- Daily revenue email to merchant: "Yesterday, Allo earned you $890.
  Here's how." — This is the most powerful retention email AlloHQ
  can send to ITS OWN customers.

### 12.2 Predictive Churn Intervention (Autonomous)
Claude Code flagged as biggest AI-native moat.

Build:
- Wire churn risk scores (already in CustomerState) to the
  opportunity scanner
- When churnRisk crosses threshold (e.g., 0.7):
  1. Auto-generate a personalized intervention (not a template —
     AI writes a 1:1 message using purchase history + brand voice)
  2. Select optimal channel from CustomerState.channelPreference
  3. Route through autonomy engine (autopilot → send immediately,
     copilot → queue for approval with context)
  4. Log intervention + track outcome
- Merchant visibility: "Allo detected Sarah K. is about to churn
  (94% risk) and sent a personalized WhatsApp message referencing
  her Merino Wool Sweater purchase. She opened it within 2 hours."
- Track: interventions sent, customers saved, revenue preserved
- Dashboard metric: "Customers Saved From Churn This Month: 23"

### 12.3 Autonomous Revenue Recovery Cards
Claude Code flagged: workers exist but disconnected from UI.

Build:
- Surface cart abandonment, price-drop, restock, and repurchase
  opportunities as "AI caught this" cards in the Home conversation:

  "3 customers abandoned carts worth $2,400 in the last 4 hours.
  I've drafted recovery emails for each. [Approve All] [Review]"

  "Your bestseller (Vitamin C Serum) dropped below 10 units.
  47 customers are due for reorder. Should I pause the restock
  campaign or let it run? [Pause] [Let it run]"

- Each card shows the $ at risk and estimated recovery
- One-click approve sends through the standard pipeline
  (governor → autonomy → channel → send)
- Track: opportunities surfaced, approved, revenue recovered

### 12.4 The "Why" Button
Build the explainability feature that creates trust and wow.

- Add a "Why?" affordance next to every AI recommendation,
  metric, and action
- When clicked, sends a contextual query to the AI agent:
  "Explain why you recommended [X] for [context]"
- AI responds with data-backed reasoning using store data
  and cross-store benchmarks (when available)
- Examples:
  - Next to "15% discount": "Why? → 15% converts at nearly
    the same rate as 20% (12.4% vs 13.1%) but saves 25% margin"
  - Next to "51 hibernating": "Why? → Customers inactive for
    45+ days have 78% probability of never returning based on
    your store's purchase patterns"
  - Next to a send time: "Why? → This customer segment engages
    most on Tuesday mornings based on their open rate history"

### 12.5 "What If" Simulator
Build as a conversation feature in the AI agent:

- Detect "what if" questions in the AI chat
- When detected, the agent runs a simulation using store data:
  - Pull relevant metrics (current revenue, customer counts,
    churn rates, conversion rates)
  - Apply the hypothetical change
  - Estimate impact using stored patterns + cross-store data
  - Present as a structured card with before/after comparison
- Examples:
  - "What if I raised prices 10%?" → model price elasticity
    from past price-change data
  - "What if I stopped emailing hibernating customers?" →
    estimate revenue loss from current recovery rate
  - "What if I ran a 30% sale this weekend?" → estimate revenue
    vs margin impact

**Sprint 12 delivers:** The product proves its value in dollars.
Every merchant can see exactly how much money AlloHQ made them.
The churn intervention works autonomously. The "Why" button makes
every AI decision transparent. This is what you show investors.

---

## SPRINT 13: "The Learning Network" (Data Moat)

**Theme:** Start collecting structured outcome data across stores
and build the cross-store intelligence layer. This is the beginning
of the real moat — the flywheel that gets better with every store.

### 13.1 Outcome Data Pipeline
Start collecting the training data NOW. Every model at Levels 2-5
depends on this structured data.

Build:
- Enhance MessageLog with outcome tracking:
  ```
  outcome: 'opened' | 'clicked' | 'purchased' | 'unsubscribed' | 'ignored'
  outcomeRevenue: Decimal (if purchased)
  outcomeTimestamp: DateTime
  customerStateAtSend: Json (snapshot of CustomerState)
  messageFeatures: Json ({
    channel, messageType, hasDiscount, discountPercent,
    hasProductImage, subjectLineLength, sendHour,
    sendDayOfWeek, templateArchetype, brandTone
  })
  ```
- Outcome attribution worker: runs every hour, matches purchases
  to recent messages using 7-day attribution window
- Webhook listener: track email opens/clicks from Resend webhooks,
  SMS delivery from Twilio, WhatsApp read receipts from Gupshup
- Data quality: validate completeness, flag missing outcomes,
  ensure every send has a corresponding outcome within 7 days

### 13.2 Cross-Store Benchmarks (Anonymous)
Build the aggregation layer that makes every store smarter.

Build:
- Store category classification: during onboarding, classify
  store into category (fashion, beauty, food, electronics,
  home, health, etc.) based on product catalog analysis
- Benchmark aggregation worker (runs weekly):
  - Average open rate by category + channel + message type
  - Average conversion rate by discount level + category
  - Average churn rate by lifecycle stage + category
  - Best performing send times by category
  - Optimal message frequency by category
  - Win-back success rate by timing (days since last purchase)
- Store comparison: "Your open rate (24%) is above fashion
  category average (18%)" — inject into agent context
- Privacy: only aggregate metrics, never individual customer data
  or store identity. Minimum 10 stores per benchmark bucket.
  Opt-in during onboarding with clear explanation.

### 13.3 AI Agent Memory (Persistent)
Claude Code flagged: each chat session is stateless beyond
current conversation.

Build:
- AgentMemory table: storeId, memoryType, content, createdAt
- Memory types:
  - `campaign_outcome`: "Win-back campaign sent March 15 converted
    12% of hibernating customers, $4,200 revenue"
  - `merchant_preference`: "Merchant prefers email over SMS for
    promotions, always wants to review discounts over 20%"
  - `store_pattern`: "Revenue peaks on Tuesdays and Fridays,
    dips on Mondays"
  - `customer_insight`: "Champion segment responds best to
    product education, not discounts"
- Memory writer: after each campaign completes, after each
  significant agent interaction, write a memory
- Memory reader: in context assembly (ai.ts), fetch relevant
  memories and inject into agent context
- The agent should reference past results: "Last time you ran
  a win-back, it converted 12% and generated $4,200. This one
  targets a similar segment — I'd expect comparable results."

### 13.4 Customer Voice Synthesis
The AI reads all support conversations and synthesizes themes.

Build:
- Weekly worker: aggregate all resolved conversations, extract
  common themes using LLM summarization
- Store in a CustomerVoiceReport table: storeId, weekOf, themes,
  sentiment, actionableInsights
- Surface in the daily briefing: "This week, 8 customers mentioned
  slow shipping. 4 asked about a loyalty program. The shipping
  complaints are from US East Coast — check fulfillment partner."
- Make available in AI agent context so it can reference when
  creating campaigns: "Based on customer feedback, I'd avoid
  mentioning fast shipping in this campaign since 8 customers
  complained about delays this week."

### 13.5 SMS/WhatsApp Template Management UI
Claude Code flagged as P2 but needed for multi-channel moat.

Build:
- Template editor for SMS, WhatsApp, RCS at /templates
- Preview per channel (SMS character count, WhatsApp rich media,
  RCS cards)
- Variables: {first_name}, {product_name}, {discount_code}, etc.
- Brand voice integration: AI generates template copy in brand tone
- Testing: send test to merchant's phone before activating

### 13.6 Form Builder UI
Claude Code flagged: list works but create/edit missing.

Build:
- /forms/new: form builder with drag-and-drop fields, popup
  trigger settings (time delay, exit intent, scroll %, page match)
- /forms/[id]: edit existing form
- Form styling: auto-apply BrandVisualProfile tokens
- Consent capture: GDPR-compliant opt-in checkboxes
- Integration: form submissions create CustomerState entries
  and trigger welcome automations

**Sprint 13 delivers:** The data flywheel starts spinning. Every
send generates structured outcome data. Cross-store benchmarks
begin forming. The AI agent remembers past results and references
them. Customer voice feeds back into campaigns. Multi-channel
is fully manageable.

---

## SPRINT 14: "The Intelligence Edge" (Custom Models)

**Theme:** Use the accumulated data to build specialized models
that are faster, cheaper, and better than general LLM calls.
This is where AlloHQ becomes genuinely AI-native.

### 14.1 Churn Prediction Model (Fine-tuned)
By Sprint 14, you should have enough outcome data to train.

Build:
- Training pipeline: extract features from CustomerState at time
  of churn/retention events across all stores
- Features: days since last order, order frequency trend, email
  engagement rate (last 30d), support sentiment score, browse
  frequency, discount sensitivity, channel preference stability
- Model: lightweight classification model (XGBoost or small neural net)
  trained on churn/retained labels
- Deployment: runs daily for every customer, updates CustomerState.churnRisk
- Improvement: compare model predictions vs actual outcomes monthly,
  retrain quarterly
- Replaces: the current heuristic-based churn scoring

### 14.2 Send Time Optimizer Model
Build:
- Training data: all send → open/click events with timestamps,
  customer timezone, day of week
- Model: per-customer optimal send time predictor
- Output: for each customer × channel, predict the hour with
  highest engagement probability
- Deployment: send workers query the model before scheduling,
  adjust send time per recipient
- Replaces: fixed send times or basic timezone adjustment

### 14.3 Subject Line Scorer
Build:
- Training data: all subject lines + open rates + customer segments
- Model: given a subject line + segment, predict open rate
- Usage: AI generates 10-20 subject line variants, scores them
  all instantly, picks the best per segment
- Replaces: manual A/B testing (which takes weeks and tests only
  2 options)
- Show in UI: "Allo tested 15 subject lines and picked the one
  with predicted 34% open rate (vs your manual average of 21%)"

### 14.4 Revenue Forecasting
Build:
- Weekly revenue forecasting model trained on store's historical
  data + seasonal patterns + active automations + customer health
- Display in Home conversation: "I predict next week's revenue at
  $48K-$56K (80% confidence). Upside: win-back campaign Tuesday.
  Risk: revenue dip trend continuing."
- Track accuracy: show past predictions vs actuals
- "Allo predicted $52K. Actual: $51,200. 98.5% accuracy."

### 14.5 A/B Testing UI + Auto-Optimization
Claude Code flagged: model and worker exist but no UI.

Build:
- /automations/[id]/ab-test: create A/B tests on any automation
  step (subject line, send time, discount level, channel)
- Auto-winner: when statistical significance reached, automatically
  promote the winner and retire the loser
- AI-driven testing: the agent can propose A/B tests based on its
  analysis: "I think a 10% discount might work as well as 15% for
  this segment. Want me to set up a test?"

### 14.6 Creative Studio (Visual Generation)
Claude Code flagged as P3 differentiator.

Build:
- /creative: AI-powered visual generation page
- Generate email hero images using brand colors + product photos
- Generate social media assets in brand style
- Generate product lifestyle shots (AI-composed, real product images)
- All generated assets stored in CreativeAsset table, reusable
  across campaigns and automations
- Integration: when AI creates a campaign, it auto-selects or
  generates appropriate creative

**Sprint 14 delivers:** AlloHQ runs custom models that are faster
and better than general LLM calls. Churn prediction is ML-based
not heuristic. Send times are per-customer optimized. Subject lines
are auto-scored. Revenue is forecasted. The product is genuinely
AI-native — not just "SaaS that calls an API."

---

## TRAINING DATA COLLECTION — START NOW

Do NOT wait for Sprint 14 to start collecting. Add these fields
to MessageLog immediately (Sprint 11):

```prisma
model MessageLog {
  // ... existing fields ...

  // Outcome tracking (for future model training)
  outcome            String?    // opened, clicked, purchased, unsubscribed, ignored
  outcomeRevenue     Decimal?   // revenue attributed to this message
  outcomeTimestamp   DateTime?  // when outcome was recorded
  customerStateSnap  Json?      // CustomerState snapshot at send time
  messageFeatures    Json?      // structured features for ML training
}
```

Build the outcome attribution worker in Sprint 12. By the time
you reach Sprint 14, you'll have months of labeled data ready
for model training.

---

## TIMELINE

| Sprint | Theme | Duration | Prerequisite |
|--------|-------|----------|-------------|
| 11 | Product works | 2-3 weeks | Current state |
| 12 | Proves value in $ | 2-3 weeks | Sprint 11 |
| 13 | Data flywheel | 3-4 weeks | Sprint 12 |
| 14 | Custom models | 4-6 weeks | Sprint 13 + enough data |

Total: ~3-4 months to full AI-native platform with custom models.

Sprint 11 is unblocked — start now. Sprint 12 can overlap with
the tail of Sprint 11. Sprint 13 needs outcome data flowing.
Sprint 14 needs months of accumulated data.

---

## HOW THIS MAPS TO THE MOAT HIERARCHY

| Moat | Built in | Strength over time |
|------|----------|-------------------|
| Ethics (governor + fatigue) | Sprint 11 | Immediate — day 1 differentiator |
| Revenue proof (attribution) | Sprint 12 | Immediate — justifies pricing |
| Role replacement | Sprints 11-12 | Grows with usage |
| Per-customer intelligence | Sprint 13 | Compounds monthly |
| Cross-store learning | Sprint 13 | Compounds with every new store |
| Custom models | Sprint 14 | Deepens quarterly with retraining |
| Per-customer RL policies | Post-Sprint 14 | The ultimate moat — years to replicate |

---

## POSITIONING CHECKPOINTS

After Sprint 11: "AlloHQ is the only marketing tool that actively
prevents over-messaging. Your customers' experience comes first."

After Sprint 12: "AlloHQ made our merchants $X in AI-attributed
revenue last month. We only succeed when you succeed."

After Sprint 13: "AlloHQ learns from 500+ stores. Your AI gets
smarter every day — not just from your data, but from patterns
across the entire network."

After Sprint 14: "AlloHQ predicted Sarah would churn 12 days
before it happened, intervened with a personalized message, and
saved $2,400 in lifetime value. No human could do that at scale."
