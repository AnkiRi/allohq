# AlloHQ

> The most beautiful e-commerce marketing automation platform

A stunning competitor to Klaviyo and Omnisend, built specifically for consumer brands and DTC e-commerce stores.

## 🚀 Key Features

- **Multi-Channel Marketing** - Email, SMS, WhatsApp, and RCS in one unified platform
- **E-Commerce Native** - Deep Shopify, WooCommerce, and BigCommerce integrations
- **Beautiful Glassmorphic UI** - Premium, modern design that stands out
- **AI-Powered** - Smart product recommendations, predictive analytics, automated copy generation
- **Revenue-Focused** - Track dollars per campaign, not just opens and clicks

## 📦 Monorepo Structure

This is a Turborepo monorepo with the following structure:

```
allohq/
├── apps/
│   ├── web/                    # Next.js 15 merchant dashboard
│   ├── api/                    # Node.js + tRPC backend API
│   ├── workers/                # Background job processors
│   └── widget/                 # Embeddable forms/popups widget
├── packages/
│   ├── ui/                     # Glassmorphic component library
│   ├── database/               # Prisma schema & migrations
│   ├── email-builder/          # Drag-drop email editor
│   ├── automation-engine/      # Workflow automation
│   ├── analytics/              # Revenue analytics
│   ├── messaging/              # Multi-channel messaging
│   ├── ecommerce-integrations/ # Shopify, WooCommerce, etc.
│   ├── product-recommendations/# AI recommendations
│   ├── customer-intelligence/  # RFM, LTV, cohorts
│   ├── forms-and-popups/       # Lead capture widgets
│   ├── tsconfig/               # Shared TypeScript configs
│   └── eslint-config/          # Shared linting configs
```

## 🛠️ Tech Stack

- **Frontend:** Next.js 15, React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Node.js 20+, tRPC, Prisma, PostgreSQL, Redis, BullMQ
- **Auth:** Clerk
- **Deployment:** Vercel (frontend), Railway (backend), Neon (database), Upstash (Redis)

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL
- Redis

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local

# Run database migrations
pnpm --filter database db:migrate

# Start development servers
pnpm dev
```

### Development

```bash
# Run all apps in dev mode
pnpm dev

# Run specific app
pnpm --filter web dev
pnpm --filter api dev

# Build all apps
pnpm build

# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```

## 📝 License

Proprietary - All Rights Reserved

## 🎯 Roadmap

- [x] Phase 0: Foundation & monorepo setup
- [ ] Phase 1: Shopify integration
- [ ] Phase 2: Customer intelligence & RFM
- [ ] Phase 3: Email builder with product blocks
- [ ] Phase 4: E-commerce automations
- [ ] Phase 5: Forms & popups
- [ ] Phase 6: Multi-channel messaging
- [ ] Phase 7: Revenue analytics
- [ ] Phase 8: AI product recommendations
- [ ] Phase 9: Campaign management
- [ ] Phase 10: Additional integrations
- [ ] Phase 11: Polish & launch
