# AlloHQ Architecture

## Monorepo Structure (Turborepo + pnpm workspaces)

```
allohq/
├── apps/
│   ├── api/          — tRPC standalone server (port 3001)
│   ├── web/          — Next.js 15.5 dashboard (port 3000)
│   ├── workers/      — BullMQ async job processors
│   └── widget/       — Embeddable storefront widget (stub)
├── packages/
│   ├── database/              — Prisma schema + client (~45 models)
│   ├── messaging/             — Multi-channel send abstraction
│   ├── email-builder/         — Drag-drop email editor + renderer
│   ├── agent-core/            — AI agent tools + orchestration
│   ├── customer-intelligence/ — RFM, LTV, brand voice AI
│   ├── ecommerce-integrations/— Shopify OAuth, sync, webhooks
│   ├── analytics/             — Revenue analytics (stub)
│   ├── forms-and-popups/      — Lead capture (stub)
│   ├── product-recommendations/— ML recommendations (stub)
│   ├── ui/                    — Shared UI utilities (cn helper)
│   ├── tsconfig/              — Shared TypeScript configs
│   └── eslint-config/         — Shared ESLint configs
```

---

## Apps

### `apps/api` — tRPC API Server
- **Runtime**: Standalone Node HTTP server on port 3001
- **Auth**: Clerk JWT verification via `@clerk/backend` `verifyToken`
- **Middleware stack**: `publicProcedure` → `protectedProcedure` (JWT) → `workspaceProcedure` (store access) → `rateLimitedProcedure` (100 req/min sliding window)

**Routers** (13):
| Router | Key Endpoints |
|--------|--------------|
| `stores` | CRUD, connect Shopify, sync status |
| `customers` | list (paginated, filterable by segment), stats, detail |
| `segments` | list, create, preview, detail with members |
| `templates` | list, create, update, duplicate, detail |
| `campaigns` | list, create, send, schedule, stats |
| `automations` | list, create, update, toggle, stats, ROI |
| `dashboard` | overview (KPIs), timeSeries, cohortForecast |
| `intelligence` | brandVoice, cohorts, rfmDistribution |
| `analytics` | revenue, channels, topProducts |
| `ai` | chat (streaming), listChats, listObservations |
| `agent` | agentChat (tool-calling loop), listActions |
| `integrations` | listAvailable, connected, disconnect |
| `settings` | get, update (brand, messaging, notifications) |

**Webhooks** (3):
- `/webhooks/shopify` — Shopify HMAC-verified, queues to BullMQ
- `/webhooks/resend` — Email delivery events → campaign + automation stats
- `/webhooks/unsubscribe` — RFC 8058 one-click List-Unsubscribe POST

---

### `apps/web` — Next.js Dashboard
- **Framework**: Next.js 15.5 with Turbopack, App Router
- **Auth**: `@clerk/nextjs` with middleware-protected routes
- **State**: tRPC React Query hooks (no Redux/Zustand)
- **Styling**: Tailwind CSS with custom Warm Cream theme, glassmorphism cards

**Dashboard Routes** (15 sections):
```
/(dashboard)/
├── dashboard/        — KPI cards, sparklines, cohort chart, AI panel
├── customers/        — Table with RFM badges, segment filter, search
│   └── [id]/         — Customer detail with timeline
├── segments/         — Segment cards with member counts
│   └── [id]/         — Segment members table
├── intelligence/     — Hub for brand voice, cohorts, RFM
│   ├── brand/        — Brand voice configuration
│   ├── cohorts/      — Cohort analysis visualization
│   └── rfm/          — RFM distribution charts
├── templates/        — Email template grid
│   ├── new/          — Email builder (drag-drop)
│   └── [id]/edit/    — Template editor
├── campaigns/        — Campaign list with status badges
│   ├── new/          — Campaign creation wizard
│   └── [id]/         — Campaign detail + analytics
├── automations/      — Automation list with toggles
│   ├── new/          — Visual workflow builder
│   └── [id]/         — Automation detail + stats
├── analytics/        — Revenue charts, channel breakdown
├── agent/            — AI agent chat interface
├── conversations/    — Customer conversation threads
├── integrations/     — Integration marketplace
│   └── shopify/      — Shopify OAuth + sync status
└── settings/         — Brand, messaging, notification config
```

**Key Components**:
- `Sidebar` — 12-item nav, responsive (hidden on mobile, overlay when open)
- `TopBar` — Greeting, breadcrumbs, hamburger menu, Cmd+K AI shortcut
- `AlloAIPanel` — Sliding AI chat panel with streaming responses
- `EmailBuilder` — 14+ block types, AI generation, merge tag insertion
- `AutomationBuilder` — Visual node editor (trigger → delay → condition → send)

---

### `apps/workers` — BullMQ Job Processors
- **Runtime**: Node.js with BullMQ + Redis (IORedis)
- **DNS Workaround**: Custom undici Agent with Google DNS for Shopify API calls

**Workers** (14) and **Queues** (16):
| Worker | Queue | Schedule | Purpose |
|--------|-------|----------|---------|
| `sync` | SYNC | on-demand | Full Shopify data sync (products, customers, orders, collections) |
| `rfm` | RFM_CALCULATION | on-demand | RFM quintile scoring for all customers |
| `send` | EMAIL_SEND | on-demand | Multi-channel message dispatch |
| `automation-runner` | AUTOMATION_TRIGGER | on-demand | Execute automation workflows |
| `shopify-webhook` | SHOPIFY_WEBHOOK | on-demand | Process Shopify webhook events |
| `trigger-listener` | TRIGGER_LISTENER | on-demand | Match events to automation triggers |
| `campaign-send` | CAMPAIGN_SEND | on-demand | Batch campaign dispatch |
| `brand-analysis` | BRAND_ANALYSIS | on-demand | AI brand voice extraction |
| `cohort-analysis` | COHORT_ANALYSIS | on-demand | Monthly cohort computation |
| `ltv-calculation` | LTV_CALCULATION | on-demand | Customer lifetime value prediction |
| `agent-execute` | AGENT_EXECUTE | on-demand | AI agent tool execution |
| `agent-observe` | AGENT_OBSERVE | every 6h | Proactive anomaly detection (6 detectors) |
| `segment-change` | SEGMENT_CHANGE | on-demand | Segment entry/exit event processing |
| `abandoned-cart` | ABANDONED_CART_CHECK | every 5min | Mark abandoned checkouts, fire triggers |

---

## Packages

### `packages/database` — Prisma + PostgreSQL
- **~45 models** organized by domain:

| Domain | Models |
|--------|--------|
| **Core** | Store, User, StoreUser |
| **E-commerce** | Product, ProductVariant, Customer, Order, OrderLineItem, Collection, CollectionProduct, AbandonedCheckout |
| **Messaging** | EmailTemplate, Campaign, CampaignRecipient, MessageLog, MessagingProvider |
| **Automation** | Automation, AutomationTrigger, AutomationLog |
| **Intelligence** | RfmScore, CustomerLifetimeValue, CustomerSegmentHistory, BrandProfile, CohortAnalysis |
| **AI** | AiChat, AiMessage, AgentAction, AgentObservation, GeneratedContent, TokenUsage |
| **Attribution** | OrderAttribution |
| **Settings** | NotificationPreference |

- **Extensions**: `pgvector` for AI embeddings

---

### `packages/messaging` — Multi-Channel Abstraction
```
messaging/
├── index.ts          — sendMessage() dispatcher
├── types.ts          — Message, SendResult, Channel interfaces
├── provider.ts       — Multi-provider config (Twilio/Gupshup)
├── validation.ts     — isValidE164(), normalizePhone(), isValidEmail()
├── channels/
│   ├── email/        — Resend API with retry
│   ├── sms/          — Twilio or Gupshup
│   ├── whatsapp/     — Twilio or Gupshup
│   └── rcs/          — Twilio or Gupshup
└── providers/
    ├── twilio.ts     — Twilio REST client
    └── gupshup.ts    — Gupshup HTTP client
```

---

### `packages/email-builder` — Email Editor + Renderer
- **14+ block types**: heading, text, image, button, divider, spacer, social, footer, hero, product-card, columns, code, video, countdown
- **Renderer**: `render-to-html.ts` converts JSON block tree → responsive HTML email with merge tag substitution (`{{variable}}` syntax)
- **AI Generation**: Integrates with `customer-intelligence` for AI-powered email content

---

### `packages/agent-core` — AI Agent System
- **Architecture**: Tool-calling LLM loop (Claude/GPT-4)
- **8 tool categories**, 50+ tools:

| Category | Tools |
|----------|-------|
| `customer-tools` | search, detail, segment members, RFM lookup |
| `campaign-tools` | create, list, send, edit_template, schedule, generate_campaign_template |
| `automation-tools` | create, list, toggle, edit_node |
| `analytics-tools` | revenue, top products, channel breakdown |
| `product-tools` | search, list, inventory |
| `segment-tools` | create, list, preview |
| `store-tools` | info, settings |
| `intelligence-tools` | brand voice, cohort data |

---

### `packages/customer-intelligence` — ML/AI Analytics
- **RFM Scoring**: Quintile-based R/F/M scores → segment mapping (Champions, Loyal, At Risk, Lost, etc.)
- **LTV Prediction**: Historical + predicted lifetime value with churn probability
- **Brand Voice**: AI extraction of brand tone, style, vocabulary from store content
- **Cohort Analysis**: Monthly customer cohort revenue tracking
- **Email Generation**: AI-powered email content generation with brand voice

---

### `packages/ecommerce-integrations` — Shopify
```
shopify/
├── client.ts         — Shopify REST Admin API client
├── oauth.ts          — OAuth 2.0 flow (authorize URL + token exchange)
├── admin.ts          — Admin API helpers
├── webhooks.ts       — HMAC verification + registration
├── constants.ts      — Scopes, webhook topics, API version
├── types.ts          — Shopify resource type definitions
└── sync/
    ├── products.ts   — Full product + variant sync
    ├── customers.ts  — Full customer sync with marketing consent
    ├── orders.ts     — Full order + line item sync
    ├── collections.ts— Collection + product-collection sync
    └── index.ts      — Orchestrated sync pipeline
```

---

## Data Flow

```
Shopify Store
    │
    ├──[OAuth]──→ Store record created
    ├──[Sync Worker]──→ Products, Customers, Orders, Collections synced
    └──[Webhooks]──→ Real-time updates (orders/create, checkouts/*, collections/*)
                         │
                         ├──→ Trigger Listener → Automation Runner → Send Worker
                         │                                              │
                         │                                    ┌─────────┼─────────┐
                         │                                  Email    SMS/WA/RCS  Push
                         │                                 (Resend) (Twilio/     (future)
                         │                                           Gupshup)
                         │
                         └──→ RFM Worker → Segment History → Segment Change Events
                                   │
                                   └──→ LTV Calculation → Customer Intelligence
                                              │
                                              └──→ Agent Observe (6h) → Proactive Alerts
```

---

## Auth Flow

```
Browser → Clerk (sign-in) → JWT issued
   │
   ├──→ Next.js middleware (protects /dashboard/*)
   └──→ tRPC calls with Authorization: Bearer <JWT>
           │
           └──→ API verifyToken() → userId → StoreUser lookup → storeId in context
```

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15.5, React, Tailwind CSS, Framer Motion |
| API | tRPC standalone, Zod validation |
| Auth | Clerk (JWT) |
| Database | PostgreSQL, Prisma ORM, pgvector |
| Queue | BullMQ, Redis (IORedis) |
| Email | Resend API |
| SMS/WhatsApp/RCS | Twilio, Gupshup (multi-provider) |
| AI | Claude/GPT-4 (tool-calling agent) |
| E-commerce | Shopify REST Admin API |
| Monorepo | Turborepo, pnpm workspaces |
| Language | TypeScript (strict) |
