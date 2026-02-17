# Implementation Plan: E-Commerce Marketing Automation Platform

## Context

Building a beautiful competitor to **Klaviyo and Omnisend** specifically for **consumer brands and e-commerce stores**, with key differentiators:

1. **Multi-channel support** - Email, SMS, WhatsApp, RCS in one unified platform
2. **Stunning glassmorphic/neumorphic UI** - Most beautiful interface in the category
3. **AI-powered features** - Product recommendations, predictive analytics, smart segmentation
4. **E-commerce native** - Deep integrations with Shopify, WooCommerce, BigCommerce
5. **Revenue-focused** - Track dollars per campaign, not just opens/clicks

**Market Context:**
- **Klaviyo & Omnisend** - Leading e-commerce marketing platforms ($800M+ ARR combined)
- **Yuma.ai** - E-commerce AI for customer service
- **HubSpot** - General CRM (not e-commerce specific, too complex for DTC brands)
- **Alta, Pocus, Reevo** - B2B sales tools (different market entirely)

**Target Customers:**
- Direct-to-consumer (DTC) brands on Shopify
- E-commerce stores on WooCommerce, BigCommerce
- Consumer product brands selling online
- Fast-growing Shopify stores ($100K - $50M revenue)

**User Requirements:**
- Frontend: Next.js + React + TypeScript
- Backend: Node.js + TypeScript
- Design: Glassmorphic/neumorphic aesthetic (soft shadows, frosted glass, depth)
- Features: E-commerce integrations, product catalog, order data, revenue analytics, automations, WhatsApp and RCS support

**Starting Point:** Empty directory - greenfield project

---

## Recommended Approach

### Architecture: Turborepo Monorepo

A monorepo structure is ideal for this e-commerce platform because:
- Shared TypeScript types between frontend and backend
- Unified design system across merchant dashboard and customer-facing widgets
- Easy code sharing for e-commerce platform adapters (Shopify, WooCommerce, etc.)
- Reusable product recommendation and customer intelligence packages
- Better developer experience

**Project Structure:**

```
allohq/
├── apps/
│   ├── web/                    # Next.js 15 frontend (merchant dashboard)
│   ├── api/                    # Node.js backend API
│   ├── workers/                # Background jobs (email sends, data sync, analytics)
│   └── widget/                 # Customer-facing forms/popups widget (embeddable)
├── packages/
│   ├── ui/                     # Glassmorphic/neumorphic component library
│   ├── database/               # Prisma schema, migrations
│   ├── email-builder/          # Drag-drop email editor with product blocks
│   ├── automation-engine/      # Workflow automation logic
│   ├── analytics/              # Revenue analytics & attribution
│   ├── messaging/              # Multi-channel messaging (Email/SMS/WhatsApp/RCS)
│   ├── ecommerce-integrations/ # Shopify, WooCommerce, BigCommerce adapters
│   ├── product-recommendations/# AI-powered product recommendation engine
│   ├── customer-intelligence/  # RFM, LTV, cohort analysis, predictive analytics
│   ├── forms-and-popups/       # Email/SMS capture forms and popups
│   ├── tsconfig/               # Shared TypeScript configs
│   └── eslint-config/          # Shared linting configs
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

---

## Technology Stack

### Frontend (Merchant Dashboard)
- **Framework:** Next.js 15 (App Router) + React 18 + TypeScript
- **Styling:** Tailwind CSS with custom glassmorphic utilities
- **Components:** Radix UI (headless primitives) + custom glassmorphic wrappers
- **Animation:** Framer Motion for smooth glassmorphic effects
- **State:** TanStack Query (server state) + Zustand (global state)
- **Forms:** React Hook Form + Zod validation
- **Charts:** Recharts or Tremor for beautiful revenue analytics
- **Email Builder:** Custom drag-drop with react-email + dnd-kit + product blocks
- **Workflow Builder:** React Flow for visual automation builder
- **Package Manager:** pnpm (fast, efficient for monorepos)

### Backend
- **Runtime:** Node.js 20+ with TypeScript
- **API:** tRPC for end-to-end type safety (alternative: Fastify REST)
- **Database:** PostgreSQL with Prisma ORM
- **Caching:** Redis for sessions, real-time data, job queues, rate limiting
- **Jobs:** BullMQ for async operations (email sends, data sync, LTV calculations)
- **Validation:** Zod (shared schemas with frontend)
- **E-commerce SDKs:**
  - `@shopify/shopify-api` - Shopify Admin API + webhooks + OAuth
  - `@woocommerce/woocommerce-rest-api` - WooCommerce REST API
  - `@bigcommerce/api-client` - BigCommerce API
  - `square` - Square for payment data
- **AI/ML:**
  - `openai` - GPT-4 for email copy generation, subject line optimization
  - `@xenova/transformers` - Product recommendations (collaborative filtering)
- **Messaging:**
  - `nodemailer` - Email abstraction
  - `mjml` + `react-email` - Email template rendering
  - `@aws-sdk/client-ses` - AWS SES for sending
  - `twilio` - SMS & WhatsApp Business API
  - Google RCS Business Messaging SDK

### Authentication
- **Provider:** Clerk (beautiful pre-built UI, multi-tenancy, SSO support)
- **Alternative:** Next-Auth v5 if more control needed

### Infrastructure
- **Frontend Hosting:** Vercel (Next.js optimized)
- **Backend Hosting:** Railway or Render (Node.js + workers)
- **Database:** Neon or Supabase (managed PostgreSQL with connection pooling)
- **Redis:** Upstash (serverless Redis)
- **Storage:** AWS S3 or Cloudflare R2 (product images, email templates)
- **CDN:** Cloudflare (customer-facing widget)
- **Monitoring:** Sentry (errors) + PostHog (product analytics) + Axiom (logs)

---

## Database Schema (E-Commerce Focused)

**Using Prisma with PostgreSQL:**

```typescript
// Core
- users                   // Team members (merchants)
- workspaces              // Multi-tenancy (one per brand)
- stores                  // Connected e-commerce stores

// E-commerce Data (synced from Shopify/WooCommerce/etc.)
- customers               // Customer profiles (email, phone, Shopify customer ID)
- orders                  // Order history (order_id, total, status, items, timestamps)
- order_items             // Line items (product, variant, quantity, price)
- products                // Product catalog (synced, with images, prices, inventory)
- product_variants        // SKUs, sizes, colors, stock levels
- collections             // Product categories/collections
- carts                   // Active shopping carts
- abandoned_carts         // Carts not converted to orders

// Marketing & Growth
- segments                // Customer segments (RFM, purchase behavior, predicted LTV)
- campaigns               // Multi-channel campaigns (email/SMS/WhatsApp/RCS)
- templates               // Reusable email/SMS templates
- forms                   // Email/SMS capture forms (embedded on store)
- popups                  // Exit intent, timed, scroll-triggered popups
- lists                   // Static customer lists

// Automation
- workflows               // Automation flows (abandoned cart, post-purchase, etc.)
- workflow_nodes          // Trigger, delay, condition, send message, add tag nodes
- workflow_executions     // Per-customer workflow runs with state
- workflow_templates      // Pre-built flows (welcome series, win-back, etc.)

// Messaging
- messages                // Individual sent messages (all channels)
- message_events          // Opens, clicks, unsubscribes, conversions
- suppression_list        // Unsubscribed, bounced, complained contacts
- sms_compliance          // TCPA consent records

// Analytics & Intelligence
- events                  // Behavioral tracking (viewed product, added to cart, etc.)
- conversions             // Revenue attribution to campaigns
- revenue_per_campaign    // Aggregated revenue metrics
- customer_lifetime_value // Calculated LTV per customer (updated nightly)
- cohorts                 // Cohort analysis data
- rfm_scores              // Recency, Frequency, Monetary scores per customer
- predicted_churn         // ML-based churn prediction scores
- product_affinity        // Product recommendation data (collaborative filtering)

// Integrations
- integrations            // Connected services (Shopify, review apps, loyalty programs)
- webhooks                // Webhook configs for real-time sync
- api_keys                // External service credentials (encrypted at rest)
- sync_jobs               // Track data sync status (products, orders, customers)
```

---

## E-Commerce Specific Features (Klaviyo Parity)

### Core E-Commerce Features

1. **Deep Platform Integrations:**
   - Shopify OAuth app with automatic data sync
   - WooCommerce plugin with REST API integration
   - BigCommerce API integration
   - Real-time webhooks for orders, customers, products, carts
   - Automatic product catalog sync (images, prices, inventory)
   - Customer and order history sync

2. **Product Blocks in Emails:**
   - Dynamic product recommendation blocks
   - "You might also like" based on purchase history
   - Recently viewed products
   - Abandoned cart product displays
   - Best sellers by category
   - Personalized product feeds

3. **E-Commerce Segmentation:**
   - RFM analysis (Recency, Frequency, Monetary)
   - Purchase behavior (bought product X, hasn't bought in Y days)
   - Predicted customer lifetime value (LTV)
   - Order count and average order value (AOV)
   - Product category affinity
   - At-risk customers (predicted churn)
   - VIP customers (high LTV)
   - Browse abandonment without purchase

4. **Pre-Built E-Commerce Automations:**
   - Abandoned cart recovery (multi-step with product images)
   - Browse abandonment (viewed but didn't add to cart)
   - Post-purchase thank you series
   - Product review requests
   - Win-back campaigns for inactive customers
   - VIP/loyalty milestone rewards
   - Back-in-stock notifications
   - Price drop alerts
   - Cross-sell/upsell flows
   - Subscription renewal reminders

5. **Forms & Popups (Lead Capture):**
   - Embeddable forms for email/SMS signup
   - Exit intent popups
   - Scroll-triggered popups
   - Timed popups
   - Discount code delivery
   - Two-step opt-in (email → SMS)
   - Mobile-optimized capture
   - A/B testing for forms

6. **Revenue Analytics & Attribution:**
   - Revenue per campaign (not just opens/clicks)
   - Revenue per email sent
   - Customer lifetime value tracking
   - Conversion attribution (which campaign led to purchase)
   - AOV by segment
   - Cohort revenue analysis
   - ROI dashboard
   - Product performance from campaigns

7. **Customer Lifecycle Tracking:**
   - First purchase date
   - Last purchase date
   - Time between purchases
   - Total number of orders
   - Total revenue per customer
   - Predicted next purchase date
   - Churn risk score

8. **Multi-Channel Support:**
   - **Email** - Rich HTML emails with product blocks
   - **SMS** - Transactional + promotional messages
   - **WhatsApp** - Order updates, customer service, promotional (approved templates)
   - **RCS** - Rich media messages with product carousels
   - Unified customer journey across all channels

---

## Design System: Glassmorphic/Neumorphic

### Core Design Principles

**Glassmorphism:**
- Semi-transparent backgrounds (`rgba(255,255,255,0.1)`)
- Backdrop blur (`backdrop-filter: blur(10px)`)
- Subtle border gradients with light transparency
- Layered depth with z-index
- Frosted glass effect for cards and modals
- Light refraction illusion

**Neumorphism:**
- Soft, multi-layered shadows (outset and inset)
- Low contrast, same-color-family backgrounds
- Subtle highlights (#fff) and shadows (#d1d9e6)
- Combined with glassmorphism for depth + elegance
- Avoid pure neumorphism (accessibility issues)

**Color Philosophy:**
- E-commerce friendly: purple/blue gradients (trust, premium)
- Revenue green for positive metrics
- Soft pastels for data visualization
- High contrast text for accessibility
- Dark mode with deeper glass effects

### Tailwind Configuration

```typescript
// tailwind.config.ts
{
  theme: {
    extend: {
      backdropBlur: {
        'glass-sm': '4px',
        'glass': '10px',
        'glass-lg': '20px',
        'glass-xl': '40px',
      },
      boxShadow: {
        'neuro': '8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff',
        'neuro-inset': 'inset 8px 8px 16px #d1d9e6, inset -8px -8px 16px #ffffff',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        'glass-lg': '0 12px 48px 0 rgba(31, 38, 135, 0.5)',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
        'glass-border': 'linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
      },
      colors: {
        'ecommerce': {
          purple: '#8B5CF6',
          blue: '#3B82F6',
          green: '#10B981', // revenue positive
          orange: '#F59E0B', // alerts
        },
      },
    }
  }
}
```

### Component Library Structure

```
packages/ui/src/
├── tokens/
│   ├── colors.ts       # Glassmorphic color palettes
│   ├── shadows.ts      # Neumorphic shadow sets
│   ├── blur.ts         # Backdrop blur values
│   └── gradients.ts    # Subtle gradients
├── components/
│   ├── atoms/
│   │   ├── Button.tsx      # Glassmorphic buttons
│   │   ├── Input.tsx       # Neumorphic inputs
│   │   ├── Card.tsx        # Glass cards
│   │   ├── Badge.tsx       # Status badges
│   │   └── Avatar.tsx      # Customer avatars
│   ├── molecules/
│   │   ├── FormField.tsx   # Form field with label
│   │   ├── DataTable.tsx   # Customer/order tables
│   │   ├── MetricCard.tsx  # Revenue metric cards
│   │   └── ProductCard.tsx # Product display cards
│   └── organisms/
│       ├── Sidebar.tsx         # Navigation sidebar
│       ├── DashboardLayout.tsx # Main layout
│       ├── CampaignBuilder.tsx # Campaign wizard
│       ├── WorkflowCanvas.tsx  # Visual workflow builder
│       └── RevenueChart.tsx    # Revenue analytics chart
```

---

## Implementation Phases (E-Commerce First)

### Phase 0: Foundation (Weeks 1-2)
**Goal:** Set up monorepo, authentication, design system basics

**Tasks:**
1. Initialize Turborepo monorepo structure
2. Set up Next.js 15 app with App Router
3. Set up Node.js API with tRPC
4. Configure Prisma + PostgreSQL (Neon/Supabase)
5. Set up Redis connection (Upstash)
6. Initialize UI package with Tailwind + glassmorphic design tokens
7. Configure Clerk authentication with workspace/organization support
8. Create basic glassmorphic layout (sidebar, top bar, dashboard shell)
9. Set up TypeScript, ESLint, Prettier across workspace
10. Configure Turborepo dev/build pipelines

**Critical Files:**
- `turbo.json` - Turborepo pipeline
- `package.json` + `pnpm-workspace.yaml` - Workspace config
- `apps/web/next.config.js` - Next.js config
- `apps/api/src/index.ts` - tRPC server entry
- `packages/database/prisma/schema.prisma` - Initial schema
- `packages/ui/src/tokens/colors.ts` - Design tokens
- `packages/ui/tailwind.config.ts` - Glassmorphic Tailwind config

**Deliverable:** Working dev environment, authentication, beautiful empty dashboard

---

### Phase 1: Shopify Integration (Weeks 3-4)
**Goal:** Deep Shopify integration with OAuth and data sync

**Tasks:**
1. Create Shopify OAuth app configuration
2. Implement Shopify OAuth flow (install, authorize, store access token)
3. Build Shopify webhook subscription system (orders, customers, products, carts)
4. Create product sync job (fetch all products, variants, images, inventory)
5. Create customer sync job (fetch all customers with order history)
6. Create order sync job (fetch orders with line items)
7. Build real-time webhook handlers for incremental updates
8. Create "Connect Shopify Store" UI flow in dashboard
9. Display synced products, customers, orders in dashboard
10. Handle Shopify app uninstall gracefully

**Key Files:**
- `packages/ecommerce-integrations/src/shopify/oauth.ts`
- `packages/ecommerce-integrations/src/shopify/webhooks.ts`
- `packages/ecommerce-integrations/src/shopify/sync.ts`
- `apps/api/src/routers/shopify.ts`
- `apps/web/src/app/(dashboard)/settings/integrations/shopify/page.tsx`
- `apps/workers/src/shopify-sync-worker.ts`

**Database Schema Updates:**
- Add `stores`, `products`, `product_variants`, `customers`, `orders`, `order_items`, `webhooks`, `sync_jobs` tables

**Deliverable:** Fully functional Shopify integration with real-time data sync

---

### Phase 2: Customer Intelligence & Segmentation (Weeks 5-6)
**Goal:** E-commerce specific customer segmentation and RFM analysis

**Tasks:**
1. Build RFM (Recency, Frequency, Monetary) calculation engine
2. Calculate customer lifetime value (LTV) for each customer
3. Build segment builder UI with e-commerce conditions:
   - "Purchased product X"
   - "AOV greater than $Y"
   - "Last purchase more than Z days ago"
   - "Total orders > N"
   - "In RFM segment: Champions, Loyal, At-Risk, etc."
4. Create dynamic segment evaluation engine
5. Build segment preview with real-time customer counts
6. Create pre-built segments (VIPs, At-Risk, New Customers, etc.)
7. Display customer profile pages with order history, LTV, RFM score
8. Build cohort analysis view (customers grouped by first purchase month)

**Key Files:**
- `packages/customer-intelligence/src/rfm.ts`
- `packages/customer-intelligence/src/ltv.ts`
- `packages/customer-intelligence/src/cohorts.ts`
- `apps/web/src/components/SegmentBuilder.tsx`
- `apps/api/src/routers/segments.ts`
- `apps/web/src/app/(dashboard)/customers/[id]/page.tsx`

**Database Schema Updates:**
- Add `segments`, `rfm_scores`, `customer_lifetime_value`, `cohorts` tables

**Deliverable:** Powerful e-commerce customer segmentation with RFM analysis

---

### Phase 3: Email Builder with Product Blocks (Weeks 7-9)
**Goal:** Drag-and-drop email builder with dynamic product recommendations

**Tasks:**
1. Build drag-and-drop email canvas with dnd-kit
2. Create email component library:
   - Text blocks
   - Image blocks
   - Button blocks
   - **Product blocks** (single product)
   - **Product grid blocks** (2x2, 3x3)
   - **Dynamic product recommendations** (based on purchase history)
   - **Abandoned cart product block**
   - Divider, spacer, social icons
3. Implement rich text editing for text blocks
4. Add image upload and asset management
5. Build product selector (browse product catalog, search)
6. Create merge tags for personalization ({{ first_name }}, {{ last_purchase_date }}, etc.)
7. Build email preview (desktop, mobile, dark mode)
8. Implement template saving and loading
9. Add A/B test variant creator (test subject lines, content)
10. Integrate react-email for HTML rendering
11. Test email rendering across clients (Gmail, Outlook, Apple Mail)

**Key Files:**
- `packages/email-builder/src/EmailEditor.tsx`
- `packages/email-builder/src/components/ProductBlock.tsx`
- `packages/email-builder/src/components/ProductGrid.tsx`
- `packages/email-builder/src/renderer.tsx` (react-email)
- `apps/web/src/app/(dashboard)/campaigns/email/new/page.tsx`
- `packages/email-builder/src/templates/` (pre-built templates)

**Deliverable:** Beautiful email builder with e-commerce product blocks

---

### Phase 4: E-Commerce Automations (Weeks 10-12)
**Goal:** Pre-built automation workflows for e-commerce

**Tasks:**
1. Design workflow schema (nodes, edges, triggers, actions, conditions)
2. Build visual workflow builder with React Flow
3. Create **trigger nodes:**
   - Customer added to list
   - Abandoned cart (30 min, 1 hour, 24 hours)
   - Placed order
   - Product viewed
   - Customer tag added
   - Subscribed to email/SMS
   - Date/time based
4. Create **action nodes:**
   - Send email
   - Send SMS
   - Send WhatsApp message
   - Add customer tag
   - Update customer property
   - Wait/Delay (minutes, hours, days)
   - Add to segment
5. Create **condition nodes:**
   - If/else branching
   - Has purchased product X?
   - AOV greater than $Y?
   - Is in segment Z?
6. Implement workflow execution engine (BullMQ jobs)
7. Create **pre-built workflow templates:**
   - **Abandoned cart recovery** (3-email sequence with product images)
   - **Post-purchase thank you** (1-3 days after order)
   - **Product review request** (7 days after delivery)
   - **Win-back campaign** (30/60/90 days inactive)
   - **Welcome series** (new subscriber, 3-5 emails)
   - **VIP milestone** (when LTV crosses threshold)
   - **Browse abandonment** (viewed product, didn't add to cart)
8. Build workflow testing/simulation mode
9. Add workflow analytics (entry count, conversion rate, revenue attributed)

**Key Files:**
- `apps/web/src/app/(dashboard)/workflows/builder/page.tsx`
- `packages/automation-engine/src/workflow-executor.ts`
- `packages/automation-engine/src/nodes/triggers/`
- `packages/automation-engine/src/nodes/actions/`
- `packages/automation-engine/src/nodes/conditions/`
- `apps/workers/src/workflow-worker.ts`
- `packages/automation-engine/src/templates/abandoned-cart.ts`

**Database Schema Updates:**
- Add `workflows`, `workflow_nodes`, `workflow_executions`, `workflow_templates` tables

**Deliverable:** Full workflow automation system with e-commerce templates

---

### Phase 5: Forms & Popups (Week 13)
**Goal:** Email/SMS capture forms and popups (embeddable on store)

**Tasks:**
1. Build form builder UI (fields, styling, submit button)
2. Create popup builder with triggers:
   - Exit intent
   - Time on page (30s, 60s, etc.)
   - Scroll depth (50%, 75%, etc.)
   - Manual trigger (button click)
3. Design form/popup widget (lightweight, embeddable JavaScript)
4. Add discount code delivery on signup
5. Implement two-step opt-in (email → SMS)
6. Build mobile-optimized popup experiences
7. Create A/B testing for popups (headline, discount amount, etc.)
8. Add GDPR compliance options (checkboxes, privacy policy link)
9. Track form submissions and conversion rates
10. Generate embed code for Shopify theme integration

**Key Files:**
- `apps/widget/src/popup.ts` (embeddable widget)
- `apps/web/src/app/(dashboard)/forms/builder/page.tsx`
- `packages/forms-and-popups/src/renderer.tsx`
- `apps/api/src/routers/forms.ts`

**Database Schema Updates:**
- Add `forms`, `popups`, `form_submissions` tables

**Deliverable:** Embeddable forms and popups for lead capture

---

### Phase 6: Multi-Channel Messaging Infrastructure (Weeks 14-15)
**Goal:** Reliable email, SMS, WhatsApp, RCS sending

**Tasks:**
1. Implement **email provider:**
   - AWS SES integration with `@aws-sdk/client-ses`
   - Nodemailer abstraction layer
   - SendGrid as backup provider
   - MJML + react-email rendering pipeline
   - Bounce, complaint, and unsubscribe handling
   - DKIM, SPF, DMARC setup instructions
2. Implement **SMS provider:**
   - Twilio SMS API integration
   - TCPA compliance (consent tracking)
   - Opt-out handling (STOP, UNSUBSCRIBE keywords)
   - Message segmentation for long messages
   - Rate limiting (prevent spam)
3. Implement **WhatsApp provider:**
   - Twilio WhatsApp Business API
   - Template message approval flow
   - Webhook handling for delivery status and replies
   - Session message support (24-hour window)
4. Implement **RCS provider:**
   - Google RCS Business Messaging SDK
   - Rich card support (images, buttons, carousels)
   - Fallback to SMS when RCS unavailable
5. Create unified messaging service abstraction
6. Build BullMQ job queue for async sending
7. Implement retry logic with exponential backoff
8. Add rate limiting per provider (avoid throttling)
9. Track message status (queued, sent, delivered, bounced, opened, clicked)
10. Build webhook endpoints for delivery status updates

**Key Files:**
- `packages/messaging/src/providers/email.ts`
- `packages/messaging/src/providers/sms.ts`
- `packages/messaging/src/providers/whatsapp.ts`
- `packages/messaging/src/providers/rcs.ts`
- `packages/messaging/src/queue.ts`
- `apps/workers/src/send-worker.ts`
- `apps/api/src/webhooks/twilio.ts`
- `apps/api/src/webhooks/ses.ts`

**Unified Interface:**
```typescript
interface MessageProvider {
  send(message: Message): Promise<MessageResult>;
  getStatus(messageId: string): Promise<MessageStatus>;
  handleWebhook(payload: unknown): Promise<WebhookEvent>;
}
```

**Database Schema Updates:**
- Add `messages`, `message_events`, `suppression_list`, `sms_compliance` tables

**Deliverable:** Production-ready multi-channel messaging infrastructure

---

### Phase 7: Revenue Analytics & Attribution (Weeks 16-17)
**Goal:** Track revenue per campaign, LTV, ROI

**Tasks:**
1. Build event tracking system:
   - Email opened
   - Email clicked
   - Product viewed (from email)
   - Added to cart (from email)
   - Purchased (conversion)
2. Implement conversion attribution logic:
   - Last-click attribution
   - First-click attribution
   - Multi-touch attribution (optional, advanced)
3. Calculate revenue per campaign
4. Calculate revenue per email sent
5. Build **Analytics Dashboard:**
   - Total revenue attributed
   - Revenue by campaign
   - Revenue by channel (email vs SMS vs WhatsApp)
   - AOV by segment
   - Conversion rate by automation
   - Customer LTV trends over time
6. Create **Campaign Performance View:**
   - Opens, clicks, conversions, revenue
   - Revenue per recipient
   - ROI (revenue - cost)
7. Build **Cohort Analysis:**
   - Revenue by acquisition cohort
   - Retention by cohort
8. Add real-time revenue updates via WebSockets
9. Implement date range filtering (last 7 days, 30 days, custom)
10. Create export functionality (CSV, PDF reports)

**Key Files:**
- `packages/analytics/src/attribution.ts`
- `packages/analytics/src/revenue.ts`
- `packages/analytics/src/cohorts.ts`
- `apps/web/src/app/(dashboard)/analytics/page.tsx`
- `apps/web/src/components/RevenueChart.tsx`
- `apps/api/src/routers/analytics.ts`

**Database Schema Updates:**
- Add `events`, `conversions`, `revenue_per_campaign`, `revenue_analytics` tables

**Deliverable:** Full revenue analytics and attribution system

---

### Phase 8: Product Recommendations & AI (Week 18)
**Goal:** AI-powered product recommendations in emails

**Tasks:**
1. Build product affinity matrix (collaborative filtering)
2. Implement recommendation algorithms:
   - "Customers who bought X also bought Y"
   - "Based on your purchase history"
   - "Trending in your favorite category"
   - "Complete the look" (complementary products)
3. Generate personalized product feeds per customer
4. Integrate recommendations into email builder (dynamic blocks)
5. Use GPT-4 for:
   - Email subject line generation
   - Email copy suggestions
   - Product description enhancement
6. A/B test subject lines with AI variants
7. Build "Smart Send Time" (predict best send time per customer)

**Key Files:**
- `packages/product-recommendations/src/collaborative-filtering.ts`
- `packages/product-recommendations/src/affinity.ts`
- `packages/email-builder/src/components/SmartProductBlock.tsx`
- `apps/workers/src/recommendation-worker.ts`

**Database Schema Updates:**
- Add `product_affinity`, `recommendation_cache` tables

**Deliverable:** AI-powered product recommendations and email optimization

---

### Phase 9: Campaign Management & Scheduling (Week 19)
**Goal:** Create, schedule, and send campaigns

**Tasks:**
1. Build campaign creation wizard:
   - Step 1: Choose channel (email, SMS, WhatsApp, RCS)
   - Step 2: Design content (use email builder or SMS composer)
   - Step 3: Select audience (segment or list)
   - Step 4: Schedule or send now
2. Implement campaign scheduler (send now, schedule for later, recurring)
3. Add test send functionality (send to test emails before full campaign)
4. Build campaign preview across channels
5. Create campaign list view (drafts, scheduled, sent, archived)
6. Display campaign metrics (sent, delivered, opened, clicked, revenue)
7. Implement campaign duplication
8. Add campaign templates (pre-built campaigns for common use cases)
9. Build send-time optimization (AI predicts best send time)

**Key Files:**
- `apps/web/src/app/(dashboard)/campaigns/new/page.tsx`
- `apps/web/src/components/CampaignWizard.tsx`
- `apps/api/src/routers/campaigns.ts`
- `apps/workers/src/campaign-scheduler.ts`

**Database Schema Updates:**
- Add `campaigns`, `campaign_sends`, `campaign_templates` tables

**Deliverable:** Full campaign creation and management system

---

### Phase 10: Additional Integrations (Week 20)
**Goal:** Extend beyond Shopify

**Tasks:**
1. **WooCommerce Integration:**
   - REST API authentication
   - Product, customer, order sync
   - Webhook support
2. **BigCommerce Integration:**
   - OAuth flow
   - Data sync
3. **Review Platform Integrations:**
   - Yotpo, Stamped.io, Judge.me
   - Trigger review request workflows
4. **Loyalty Program Integrations:**
   - Smile.io, LoyaltyLion
   - Trigger VIP milestone campaigns
5. **Stripe Integration:**
   - Payment data sync
   - Subscription events
6. Build integration marketplace UI

**Key Files:**
- `packages/ecommerce-integrations/src/woocommerce/`
- `packages/ecommerce-integrations/src/bigcommerce/`
- `apps/web/src/app/(dashboard)/settings/integrations/page.tsx`

**Deliverable:** Multi-platform e-commerce integrations

---

### Phase 11: Polish, Performance & Launch (Weeks 21-22)
**Goal:** Production-ready refinement

**Tasks:**
1. **Performance Optimization:**
   - Code splitting and lazy loading
   - Image optimization
   - Database query optimization (indexes)
   - Redis caching for frequent queries
   - CDN setup for static assets
2. **UI Polish:**
   - Loading skeletons everywhere
   - Error boundaries and graceful error states
   - Empty states with illustrations and CTAs
   - Toast notifications system
   - Keyboard shortcuts (cmd+k for search, etc.)
   - Smooth page transitions
   - Micro-interactions and animations
3. **Onboarding:**
   - New user onboarding flow
   - Shopify connection wizard
   - First campaign creation tutorial
   - Product tour (tooltips, highlights)
4. **Accessibility:**
   - WCAG AA compliance
   - Keyboard navigation
   - Screen reader support
   - Color contrast fixes
5. **Mobile Optimization:**
   - Responsive design refinements
   - Mobile-specific UI adjustments
6. **Testing:**
   - Unit tests for critical functions
   - Integration tests for API routes
   - E2E tests with Playwright (campaign creation → send flow)
   - Load testing (10K emails/hour throughput)
7. **Documentation:**
   - Merchant help center
   - API documentation
   - Shopify app listing content
8. **Launch Prep:**
   - Production environment setup
   - Monitoring and alerting (Sentry, Axiom)
   - Backup strategy
   - Disaster recovery plan

**Deliverable:** Production-ready, polished, beautiful e-commerce marketing platform

---

## Critical Files to Create First

### Foundation (Phase 0)
1. `turbo.json` - Monorepo pipeline
2. `package.json` + `pnpm-workspace.yaml` - Workspace config
3. `packages/database/prisma/schema.prisma` - Database schema
4. `packages/ui/src/tokens/colors.ts` - Design system
5. `apps/web/tailwind.config.ts` - Glassmorphic styles

### E-Commerce Core (Phase 1-2)
6. `packages/ecommerce-integrations/src/shopify/oauth.ts` - Shopify auth
7. `packages/ecommerce-integrations/src/shopify/sync.ts` - Data sync
8. `packages/customer-intelligence/src/rfm.ts` - RFM analysis
9. `packages/customer-intelligence/src/ltv.ts` - LTV calculation

### Messaging (Phases 3-6)
10. `packages/email-builder/src/EmailEditor.tsx` - Email builder
11. `packages/email-builder/src/components/ProductBlock.tsx` - Product blocks
12. `packages/messaging/src/providers/email.ts` - Email sending
13. `packages/automation-engine/src/workflow-executor.ts` - Automation engine

### Analytics (Phase 7)
14. `packages/analytics/src/attribution.ts` - Revenue attribution
15. `packages/analytics/src/revenue.ts` - Revenue calculation

---

## Key Differentiators vs Klaviyo/Omnisend

### 1. **Most Beautiful UI**
- Glassmorphic/neumorphic design (Klaviyo/Omnisend look outdated)
- Smooth Framer Motion animations
- Premium, modern aesthetic

### 2. **Multi-Channel Native**
- WhatsApp Business API integration (Klaviyo doesn't have this)
- RCS support (cutting edge, nobody has this yet)
- Unified customer journey across email/SMS/WhatsApp/RCS

### 3. **AI-Powered**
- GPT-4 email copy generation
- Smart product recommendations
- Predictive analytics (churn, LTV)
- Send-time optimization

### 4. **Better DX for Developers**
- Full TypeScript end-to-end
- Modern tech stack (Next.js 15, tRPC, Prisma)
- Clean codebase

### 5. **Pricing**
- More affordable than Klaviyo (they're expensive for small brands)
- Free tier up to 500 contacts
- Transparent pricing

---

## Revenue Model (Optional)

**Freemium SaaS:**
- **Free:** Up to 500 contacts, 5,000 emails/month
- **Starter ($29/mo):** Up to 2,000 contacts, 20,000 emails/month
- **Growth ($79/mo):** Up to 10,000 contacts, 100,000 emails/month
- **Pro ($199/mo):** Up to 50,000 contacts, 500,000 emails/month
- **Enterprise (Custom):** Unlimited, dedicated support, custom integrations

**Add-ons:**
- SMS ($0.015/message)
- WhatsApp ($0.005-$0.05/message depending on country)
- RCS ($0.01/message)

---

## Success Metrics

### Technical
- First contentful paint < 1.5s
- Time to interactive < 3s
- API response time < 200ms (p95)
- Email send throughput: 10,000/hour
- Uptime: 99.9%

### Business
- Shopify app install rate
- Campaign creation completion rate
- Email deliverability > 95%
- Revenue attributed per merchant > $5,000/month
- Customer NPS > 50

### Design
- Glassmorphic effects render at 60fps
- Lighthouse score > 90
- Zero accessibility violations (WCAG AA)
- Positive design feedback from beta users

---

## Verification & Testing

### Phase 1 (Shopify Integration)
- [ ] Successfully connect Shopify store via OAuth
- [ ] Products sync correctly with images and variants
- [ ] Customers sync with order history
- [ ] Webhooks fire in real-time for new orders
- [ ] Abandoned carts are detected within 30 minutes

### Phase 2 (Customer Intelligence)
- [ ] RFM scores calculate correctly
- [ ] Segments update in real-time when conditions change
- [ ] Customer LTV displays on profile
- [ ] Cohort analysis groups customers by month

### Phase 3 (Email Builder)
- [ ] Drag-and-drop works smoothly
- [ ] Product blocks display correct products
- [ ] Dynamic recommendations pull from product catalog
- [ ] Email renders correctly in Gmail, Outlook, Apple Mail
- [ ] Mobile preview matches actual mobile display

### Phase 4 (Automations)
- [ ] Abandoned cart workflow triggers within 30 min
- [ ] Emails send with correct product images
- [ ] Workflow execution tracks customer state
- [ ] Delays work correctly (24-hour delay = 24 hours)
- [ ] Conditions branch correctly (if/else logic)

### Phase 6 (Messaging)
- [ ] Send test email via AWS SES
- [ ] Send test SMS via Twilio
- [ ] Send test WhatsApp message
- [ ] Webhooks update delivery status
- [ ] Bounces are suppressed automatically

### Phase 7 (Analytics)
- [ ] Revenue attribution works (order → campaign → customer)
- [ ] Dashboard displays revenue per campaign
- [ ] Cohort revenue trends display correctly
- [ ] Export to CSV works

### Final Launch
- [ ] Full flow: Connect Shopify → Create segment → Build email → Launch automation → Track revenue
- [ ] Lighthouse score > 90
- [ ] Zero console errors
- [ ] Mobile responsive on iPhone, Android
- [ ] Load test: 10K emails send within 1 hour

---

## Next Steps

Once approved, we'll begin with **Phase 0: Foundation**:

1. Initialize Turborepo monorepo
2. Set up Next.js + tRPC + Prisma + Redis
3. Configure Clerk authentication
4. Build glassmorphic design system
5. Create empty dashboard shell

Then immediately move to **Phase 1: Shopify Integration** to validate the core value proposition (e-commerce data sync).

This plan will result in a beautiful, production-ready e-commerce marketing automation platform that rivals Klaviyo and Omnisend while offering multi-channel support (WhatsApp, RCS) and a stunning glassmorphic UI.
