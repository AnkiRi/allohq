# Sprints 12-15: Autonomous Revenue Agent

## Vision
Allo never sleeps. The moat is the autonomous revenue loop:
**Data → Insight → Action → Revenue → Attribution → Trust → More Autonomy → Repeat**

---

## Sprint 12: Overnight Operations + Morning Briefing + Revenue Attribution

### 12A: Overnight Operations Daemon
- **New worker:** `overnight-ops.worker.ts` — runs every 2 hours via BullMQ repeatable job
- For each active store:
  - Queries `AutonomyConfig` to determine which categories are `autopilot`
  - For autopilot: directly triggers journeys (cart recovery, win-back, promotional)
  - For copilot/advisor: creates `ActionQueue` entries for merchant review
  - Scans running A/B tests, auto-concludes winners
  - Calls `scanOpportunities` for campaign opportunities
  - Logs every decision to `AgentActivityLog`
- **New model:** `AgentActivityLog` — tracks every autonomous action with type, category, tier, revenue impact
- **New utility:** `packages/agent-core/src/utils/agent-activity-log.ts` — helper to write activity logs

### 12B: Morning Briefing Enhancement
- Enhance `generateDailyBriefing` to include:
  - "Overnight Agent Activity" section from `AgentActivityLog`
  - "Revenue Attributed" section from `OrderAttribution`
  - A/B test status and results
- Dashboard shows latest unread briefing as top card
- Respects store timezone for "since midnight"

### 12C: Revenue Attribution Dashboard
- **Already built:** `OrderAttribution` model, `outcome-attribution.worker.ts` (hourly)
- **New:** Dashboard UI with:
  - Big number: "Allo-attributed Revenue" (sum from `OrderAttribution`)
  - Breakdown by automation category
  - Breakdown by channel
  - ROI multiplier: "For every $1 you pay Allo, you earned $X"
  - Time series sparkline
- **New API endpoints:**
  - `analytics.attributedRevenue` — total, by period, by automation, by channel
  - `dashboard.attributedRevenueSummary` — today, this week, this month

---

## Sprint 13: Real-Time Event Triggers

### 13A: Event Reactor (Centralized Event Processing)
- **New worker:** `event-reactor.worker.ts` — centralized event handler
  - Receives structured events: `{ storeId, eventType, customerId, payload }`
  - Routes to appropriate action based on autonomy tier
  - For autopilot: directly triggers journey/send
  - For copilot/advisor: queues to ActionQueue
  - Logs to `AgentActivityLog`
- Enhanced webhook handler for `inventory_levels/update` (back-in-stock)
- All webhook events now also queue to event-reactor for unified processing

### 13B: Browse Abandonment
- **New model:** `BrowseEvent` — stores product view events from widget
  - Fields: storeId, customerId, sessionId, productId, pageUrl, duration
- **New API:** `events.trackBrowse` — public endpoint for widget to POST browse events
- **New worker:** `browse-abandonment.worker.ts` — runs every 30 minutes
  - Finds customers who viewed products 1-2 hours ago but didn't purchase
  - Cross-references against orders and abandoned checkouts
  - Checks autonomy tier for `browse_abandonment` category
  - Triggers browse abandonment email or queues for review
- Add `browse_abandonment` to automation categories in store activation

### 13C: Predictive Win-Back (Enhancement)
- **Already built:** `churn-intervention.worker.ts` with churn risk scanning
- **Enhancement:** Increase frequency from daily to every 6 hours
- Detect "newly at-risk" customers (churn risk crossed 0.7 threshold recently)
- Log all interventions to `AgentActivityLog`

---

## Sprint 14: Self-Optimizing Agent

### 14A: Auto-Evolving A/B Tests
- When A/B test concludes with a winner:
  1. Apply winning variant to the automation config
  2. Generate next test hypothesis (rotate: subject → send_time → content → discount)
  3. Auto-start for autopilot tiers, queue proposal for copilot/advisor
- **New module:** `packages/campaign-engine/src/ab-test-evolver.ts`
  - `applyWinner(testId)` — updates automation with winning variant
  - `generateNextHypothesis(testId, storeId)` — picks next variable, generates variants
  - `createFollowUpTest(testId, storeId)` — creates and optionally starts next test
- Enhanced `ab-test-evaluator.worker.ts` to call evolver after conclusion

### 14B: Per-Customer Send-Time Optimization
- **Already built:** `send-time-optimizer.ts` with per-customer model
- **Gap:** Journey stepper doesn't use it
- **Enhancement:** Before sending in `journey-stepper.worker.ts`:
  - Check customer's optimal send window
  - If current hour is outside optimal window, re-queue with delay
  - Cap delay at 12 hours
  - Skip for time-sensitive automations (cart recovery, shipping)

### 14C: Copy Learning Engine
- **New model:** `CopyPerformance` — tracks which copy patterns work per store
  - Fields: storeId, category (subject/cta/tone), pattern (urgency/curiosity/etc.), metricType, metricValue, sampleSize
- **New module:** `packages/campaign-engine/src/copy-learner.ts`
  - `analyzeCopyPatterns(storeId)` — classifies sent subjects/CTAs into patterns, measures performance
  - `getWinningPatterns(storeId)` — returns top performers
  - `generateCopyBrief(storeId)` — produces brief for injection into generation prompts
- **New worker:** `copy-learner.worker.ts` — runs weekly
- Winning patterns fed back into email generation prompts

### 14D: Cross-Store Intelligence
- **Already built:** `StoreBenchmark` model, `benchmark-aggregator.worker.ts`
- **Enhancement:**
  - `getBenchmarkComparison(storeId)` — compares store vs category avg
  - Surface in briefings: "Your cart recovery rate is 12% vs 18% category avg"
  - Use benchmarks to inform new store default configurations

---

## Sprint 15: Conversational Commerce

### 15A: Intent Detection
- **New utility:** `packages/agent-core/src/utils/intent-detector.ts`
  - Pre-processes merchant messages before LLM
  - Detects: create_campaign, flash_sale, send_to_vips, analytics_query, etc.
  - Adjusts tool priority and system context for the LLM

### 15B: Inline Campaign Creation via Chat
- Merchant says "run a flash sale" → Agent:
  1. Generates email content with brand profile
  2. Renders MJML preview HTML
  3. Returns inline preview card in chat
  4. One-click "Approve & Send" or "Edit First"
- **New tool:** `packages/agent-core/src/tools/inline-campaign-tool.ts`
- **New component:** `apps/web/src/components/ai/CampaignPreviewCard.tsx`
- **New API:** `ai.executeChatAction` — approve/reject actions from chat

### 15C: Analytics Q&A
- Merchant asks "why did revenue dip?" → Agent queries data and explains
- **New tools:** `packages/agent-core/src/tools/deep-analytics-tools.ts`
  - `explain_revenue_change` — compares periods, identifies contributing factors
  - `customer_focus_analysis` — ranks customers by retention ROI
  - `automation_performance_comparison` — side-by-side automation metrics
  - `benchmark_comparison` — compare against category peers

---

## Implementation Order

| Phase | Sprint | What | Key Files |
|-------|--------|------|-----------|
| 1 | 12 | Schema migration (AgentActivityLog, BrowseEvent, CopyPerformance) | schema.prisma |
| 1 | 12 | Agent activity log utility | agent-core/src/utils/agent-activity-log.ts |
| 1 | 12 | Overnight ops daemon | workers/overnight-ops.worker.ts |
| 1 | 12 | Enhanced morning briefing | merchant-copilot/briefing-generator.ts |
| 1 | 12 | Revenue attribution API + dashboard UI | analytics.ts, dashboard/page.tsx |
| 2 | 13 | Event reactor worker | workers/event-reactor.worker.ts |
| 2 | 13 | Browse event API + model | api/routers/events.ts |
| 2 | 13 | Browse abandonment worker | workers/browse-abandonment.worker.ts |
| 2 | 13 | Enhanced churn intervention (6hr frequency) | workers/churn-intervention.worker.ts |
| 3 | 14 | A/B test evolver | campaign-engine/ab-test-evolver.ts |
| 3 | 14 | Send-time opt in journey stepper | workers/journey-stepper.worker.ts |
| 3 | 14 | Copy learning engine + worker | campaign-engine/copy-learner.ts |
| 3 | 14 | Cross-store benchmark comparison | campaign-engine/performance-learner.ts |
| 4 | 15 | Intent detector | agent-core/utils/intent-detector.ts |
| 4 | 15 | Inline campaign tool + preview card | agent-core/tools/inline-campaign-tool.ts |
| 4 | 15 | Deep analytics tools | agent-core/tools/deep-analytics-tools.ts |
| 4 | 15 | Chat action execution | api/routers/ai.ts |

## Verification Checklist
- [ ] Overnight ops runs every 2h, triggers autopilot actions, queues copilot actions
- [ ] Morning briefing shows overnight activity + attributed revenue
- [ ] Dashboard shows "Allo-attributed Revenue" with breakdown
- [ ] Browse events tracked, abandonment emails triggered
- [ ] A/B tests auto-evolve (apply winner → start next test)
- [ ] Journey stepper respects per-customer send-time windows
- [ ] Copy patterns tracked and fed back into generation
- [ ] "Create a flash sale" in chat → inline preview → one-click approve
- [ ] "Why did revenue dip?" → data-driven explanation in chat
