<!-- apps/web/README.md -->

# Build OS - Personal Productivity Operating System

## Lets go

**A comprehensive productivity platform with AI-powered insights, project management, and intelligent task automation.**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte-4A4A55?style=for-the-badge&logo=svelte&logoColor=FF3E00)](https://svelte.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Stripe](https://img.shields.io/badge/Stripe-626CD9?style=for-the-badge&logo=Stripe&logoColor=white)](https://stripe.com/)

Build OS transforms how you manage projects and tasks by providing an intelligent, AI-powered productivity operating system. Instead of juggling multiple tools, Build OS provides a unified platform that learns from your work patterns and helps you stay focused on what matters most.

## ✨ Key Features

🧠 **AI-Powered Brain Dump** - Capture thoughts naturally and let AI organize them into actionable tasks
📊 **Intelligent Project Management** - Projects with phases, tasks, and AI-generated insights
📅 **Smart Calendar Integration** - Seamless Google Calendar sync with intelligent scheduling
📧 **Daily AI Briefs** - Automated summaries of your progress and priorities
🔄 **Real-time Collaboration** - Live updates and team synchronization
💰 **Flexible Billing** - 14-day free trial with transparent pricing

## 🏗️ Architecture

### Technology Stack

- **Frontend**: SvelteKit 2.16+ with Svelte 5.33+
- **Database**: Supabase (PostgreSQL) with real-time subscriptions
- **Authentication**: Supabase Auth with Google OAuth
- **Payments**: Stripe with comprehensive billing system
- **AI**: OpenAI integration with local Ollama support
- **Deployment**: Vercel with serverless functions
- **Styling**: TailwindCSS with custom design system

### Performance & Scale

- **Current Capacity**: 500-1,000 active users on free tiers
- **Optimized Capacity**: 20,000-30,000 users with scaling improvements
- **Response Time**: <200ms average API response
- **Uptime**: 99.9% target with Vercel and Supabase

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Supabase account
- Google Cloud account (for OAuth)
- Stripe account (optional, for payments)

### Installation

1. **Clone and install dependencies**

    ```bash
    git clone https://github.com/yourusername/build-os.git
    cd build-os
    pnpm install
    ```

2. **Set up environment variables**

    ```bash
    cp .env.example .env.local
    # Fill in your Supabase and Google OAuth credentials
    ```

3. **Run database migrations**
    - Open Supabase SQL Editor
    - Run migrations in `supabase/migrations/` folder in order

4. **Start development server**
    ```bash
    pnpm run dev:split  # Runs dev server + type checking
    ```

Visit `http://localhost:5173` to see your application.

### Development Commands

```bash
# Development
pnpm run dev          # Start development server
pnpm run dev:fast     # Start dev server (faster, no type checking)
pnpm run dev:split    # Run dev server and type checking concurrently

# Code Quality
pnpm run check        # Run SvelteKit sync and svelte-check
pnpm run lint         # Run ESLint
pnpm run lint:fix     # Auto-fix ESLint issues and format
pnpm run format       # Format code with Prettier
pnpm run test         # Run tests with Vitest

# Build & Deploy
pnpm run build        # Build for production
pnpm run preview      # Preview production build
pnpm run pre-push     # Full CI pipeline (check, test, lint, build)
```

## 💳 Payment System

### Trial-Based Model

- **14-day free trial** for all new users
- **No credit card required** to start
- **7-day grace period** with read-only access after trial
- **$20/month** for Build OS Pro subscription

### Features Included

✅ **Unlimited projects and tasks**
✅ **AI-powered brain dump processing**
✅ **Daily AI-generated briefs**
✅ **Google Calendar integration**
✅ **Real-time collaboration**
✅ **Advanced analytics and insights**
✅ **Priority email support**

### Revenue Management

- Real-time MRR/ARR tracking
- Automated dunning for failed payments
- Invoice generation and management
- Revenue recognition compliance
- Customer subscription lifecycle

## 🔧 Configuration

### Environment Variables

#### Required

```env
# Supabase
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_anon_key
PRIVATE_SUPABASE_SERVICE_KEY=your_service_role_key

# Google OAuth
PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

#### Optional

```env
# Stripe (for payments)
ENABLE_STRIPE=false
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
PUBLIC_STRIPE_PUBLISHABLE_KEY=your_publishable_key

# AI Features
OPENAI_API_KEY=your_openai_api_key

# Security
PRIVATE_CRON_SECRET=your_random_secret
```

### Feature Flags

- `ENABLE_STRIPE=false` - Safely deploy without payment processing
- `AGENTIC_CHAT_BEHAVIORAL_PROFILE_MODE=off|shadow|inject` - Behavioral profile rollout mode (`shadow` is recommended first to run in background without prompt injection)
- `AGENTIC_CHAT_BEHAVIORAL_PROFILE_TIMEOUT_MS=25` - Max lookup time budget (ms) before behavioral profile loading fails open
- Graceful degradation when services are unavailable
- Trial system works independently of payment integration

## 📊 Database Schema

### Core Tables

- **users** - User profiles and subscription status
- **projects** - Project management with phases and context
- **tasks** - Task tracking with AI-powered automation
- **brain_dumps** - AI-processed thought capture
- **daily_briefs** - Automated progress summaries

### Stripe Integration

- **subscription_plans** - Billing plan configuration
- **customer_subscriptions** - User subscription tracking
- **payment_methods** - Secure payment information
- **invoices** - Invoice generation and storage
- **failed_payments** - Dunning process management

### Trial System

- **trial_reminders** - Automated trial notifications
- **user_notifications** - In-app notification system

## 🔒 Security

### Authentication & Authorization

- **Supabase Auth** with Google OAuth integration
- **Row Level Security (RLS)** on all database tables
- **Session management** with automatic token refresh
- **Protected routes** with authentication middleware

### Payment Security

- **Stripe webhook signature verification**
- **PCI compliance** through Stripe's secure infrastructure
- **No local storage** of payment information
- **Encrypted data transmission** for all financial operations

### Data Protection

- **End-to-end encryption** for sensitive data
- **Regular automated backups** via Supabase
- **GDPR compliance** with data export capabilities
- **Audit trails** for all administrative actions

## 📈 Monitoring & Analytics

### Performance Monitoring

- **Error tracking** with Sentry integration
- **Performance insights** via Vercel Analytics
- **Database query optimization** monitoring
- **Real-time uptime tracking**

### Business Metrics

- **Trial conversion rates**
- **Monthly Recurring Revenue (MRR)**
- **Customer churn analysis**
- **Feature usage analytics**
- **Support ticket trends**

## 🚀 Deployment

### Vercel Deployment (Recommended)

1. **Connect GitHub repository** to Vercel
2. **Configure environment variables** in Vercel dashboard
3. **Set up custom domain** (optional)
4. **Enable monitoring** and analytics
5. **Configure cron jobs** for automated tasks

### Database Setup

1. **Create Supabase project**
2. **Run database migrations** in order
3. **Configure Row Level Security**
4. **Set up real-time subscriptions**
5. **Enable database backups**

### Third-Party Services

- **Google Cloud Console** - OAuth and Calendar API
- **Stripe Dashboard** - Payment processing setup
- **Sentry** - Error monitoring (optional)
- **Upstash** - Redis caching (for scaling)

## 📚 Documentation

### For Developers

- [**Web Docs Hub**](./docs/README.md) - Web app documentation home
- [**Navigation Index**](./docs/NAVIGATION_INDEX.md) - Quick links by task
- [**Technical Docs**](./docs/technical/README.md) - Architecture, API, and testing
- [**Deployment Checklist**](./docs/technical/deployment/DEPLOYMENT_CHECKLIST.md) - Production deployment guide

### For Users

- [**API Documentation**](./docs/technical/api/README.md) - API reference and endpoints
- [**Feature Guides**](./docs/features/README.md) - Feature-level documentation
- [**Onboarding Guide**](./docs/features/onboarding/README.md) - Current onboarding flow

## 🤝 Contributing

Contributions should follow the monorepo workflow and documentation in the root [CLAUDE.md](../../CLAUDE.md).

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes** following our code style
4. **Run the test suite** (`pnpm run pre-push`)
5. **Commit your changes** (`git commit -m 'Add amazing feature'`)
6. **Push to the branch** (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

### Code Style

- **TypeScript** for type safety
- **ESLint + Prettier** for code formatting
- **Conventional Commits** for commit messages
- **Component-based architecture** with clear separation of concerns

## 🙋‍♂️ Support

### Community Support

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Community questions and ideas
- **Documentation** - Comprehensive guides and references

### Enterprise Support

- **Priority support** for Build OS Pro subscribers
- **Custom integrations** and enterprise features
- **Dedicated support channel** for mission-critical deployments

### Contact

- **Email**: support@build-os.com
- **Website**: https://build-os.com
- **Status Page**: https://status.build-os.com

---

**Built with ❤️ by the Build OS team**

Transform your productivity. Start your free trial today.
