# BuildOS Platform Documentation

## 🏗️ You Are Here: Monorepo Root

This folder contains **cross-cutting concerns** that affect multiple apps/packages.

For **app-specific documentation**:

- Web App (Vercel): `/apps/web/docs/`
- Worker Service (Railway): `/apps/worker/docs/`

For **package documentation**:

- Shared Types: `/packages/shared-types/docs/`
- Supabase Client: `/packages/supabase-client/docs/`
- Twilio Service: `/packages/twilio-service/docs/`

## What's in This Folder

- `/architecture/` - System-wide architecture, data flows, ADRs
- `/business/` - Business strategy, war room, communications guides
- `/marketing/` - Brand, growth, social media, customer segments, investors
- `/blogs/` - Content marketing, founder stories, user guides
- `/philosophy/` - Product philosophy and psychological foundations
- `/user-guide/` - End-user documentation and feature guides
- `/writing/` - Writing resources and techniques
- `/operations/` - Monorepo DevOps, CI/CD, monitoring, environment variables
- `/integrations/` - Shared integrations (Supabase, Stripe)
- `/research/` - Cross-cutting research

## 📝 Documentation Standards

**IMPORTANT:** Before creating any documentation, read:
- **[Documentation Guidelines](DOCUMENTATION_GUIDELINES.md)** ⭐ - Where to put docs, naming conventions, required formats

**Key Rules:**
- ✅ Research documents → `/thoughts/shared/research/YYYY-MM-DD_HH-MM-SS_topic.md`
- ✅ System architecture → `/docs/architecture/`
- ✅ Web app docs → `/apps/web/docs/`
- ✅ Worker docs → `/apps/worker/docs/`
- ❌ Don't create random docs at root level

## Quick Navigation

### Understanding the System

1. [Monorepo Guide](MONOREPO_GUIDE.md) - Turborepo structure and workflows
2. [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) - How apps deploy and communicate
3. System Architecture - How pieces fit together (coming soon)

### By Task

See [Task Index](TASK_INDEX.md) for navigation by "what you want to do"

### By Deployment Target

- **Web (Vercel)**: `/apps/web/docs/` - User interface, API routes, real-time UI
- **Worker (Railway)**: `/apps/worker/docs/` - Background jobs, email, scheduled tasks

## Environment Variables

For environment configuration, see:
- [Deployment Environment Checklist](operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) - Complete environment setup guide

## Documentation Philosophy

This documentation follows a **deployment topology** structure:

- **App-specific docs** live with their apps (`/apps/web/docs/`, `/apps/worker/docs/`)
- **Shared concerns** live here at the monorepo root (`/docs/`)
- **Package docs** live with their packages (`/packages/*/docs/`)

This structure helps LLM agents and developers quickly determine scope and find relevant documentation.
