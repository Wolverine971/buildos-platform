# BuildOS Documentation Reorganization Plan v2.0

**Date:** October 1, 2025
**Status:** Planning Phase
**Scope:** Monorepo-aware documentation restructuring for LLM optimization

---

## Executive Summary

This plan reorganizes BuildOS platform documentation to reflect its **Turborepo monorepo architecture** with two independently deployed applications (Web → Vercel, Worker → Railway) and shared packages. The current structure has 31+ root-level markdown files and doesn't clearly distinguish between app-specific and cross-cutting documentation.

**Key Principle:** **Documentation follows deployment topology.**

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Problems with Current Structure](#problems-with-current-structure)
3. [Design Principles for LLM Optimization](#design-principles-for-llm-optimization)
4. [Proposed Structure](#proposed-structure)
5. [File Migration Plan](#file-migration-plan)
6. [Navigation Aids for LLMs](#navigation-aids-for-llms)
7. [Implementation Plan](#implementation-plan)
8. [Validation Strategy](#validation-strategy)

---

## Current State Analysis

### Monorepo Structure

```
buildos-platform/
├── /apps/
│   ├── /web/              # SvelteKit app → Vercel
│   │   └── /docs/         # 250+ files, well-organized
│   └── /worker/           # Node.js worker → Railway
│       └── /docs/         # EMAIL_SETUP.md only
├── /packages/
│   ├── /shared-types/     # Shared TypeScript types
│   ├── /supabase-client/  # Database client
│   ├── /twilio-service/   # SMS service
│   └── /config/           # Shared config
└── /*.md                  # 31 ROOT-LEVEL FILES (problem!)
```

### Root-Level Documentation Files (31 files)

**Deployment & Infrastructure:**

- VERCEL_CONFIGURATION_GUIDE.md
- VERCEL_DEPLOYMENT_FIX.md
- DEPLOYMENT_ENV_CHECKLIST.md
- READY_TO_DEPLOY.md

**Conventions:**

- SVELTEKIT_ENV_CONVENTIONS.md

**Active Migrations:**

- PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md
- PHASE_2_FIXES_SUMMARY.md
- PHASE_2_INTEGRATION_TEST_PLAN.md
- TYPE_UPDATE_PROGRESS.md
- TYPEFIX_PLAN.md
- IMPLEMENTATION_PROGRESS.md

**Completed Migrations:**

- MIGRATION_FIX_SUMMARY.md
- MIGRATION_QUICK_START.md
- POST_MIGRATION_STEPS.md

**Feature Specifications:**

- calendar-ingestion-integration-plan.md
- calendar-analysis-implementation-status.md
- calendar-ingestion-buildos-implementation.md
- calendar-cleanup-phase-regeneration-analysis.md
- calendar-analysis-bugs-investigation.md
- calendar-analysis-task-improvement-research.md
- daily-brief-exponential-backoff-spec.md
- build-os-prep-braindump-llm-call-plan.md
- build-os-onboarding-revamp.md

**Notification System:**

- NOTIFICATION_SYSTEM_CHECKPOINT.md
- NOTIFICATION_SYSTEM_DOCS_MAP.md
- NOTIFICATION_SYSTEM_IMPLEMENTATION.md
- URGENT_NOTIFICATION_BUG.md
- generic-stackable-notification-system-spec.md

**Integrations:**

- twillio-integration-plan.md (typo in filename)
- twilio-integration-plan-updated.md

### Existing Documentation Locations

**Web App (`/apps/web/docs/`):**

- Well-organized with ~250+ files
- Folders: design/, prompts/, business/, marketing/, technical/, user-guide/, etc.
- Has start-here.md navigation hub
- Organized but doesn't distinguish app-specific vs monorepo concerns

**Worker (`/apps/worker/docs/`):**

- Only has EMAIL_SETUP.md
- Severely underdocumented
- Railway deployment docs in worker root (RAILWAY_DEPLOYMENT.md)

**Packages:**

- `/packages/shared-types/TYPE_SYSTEM_UPDATE_2025-09-27.md`
- Minimal documentation

---

## Problems with Current Structure

### 1. **Deployment Ambiguity**

- Unclear which docs apply to web (Vercel) vs worker (Railway)
- VERCEL\_\* docs at root, but they're web-specific
- No clear worker documentation

### 2. **Monorepo Invisibility**

- Documentation doesn't reflect Turborepo structure
- Shared packages underdocumented
- Cross-app concerns (Supabase, shared types) scattered

### 3. **LLM Navigation Challenges**

- No clear entry points for LLM agents
- Ambiguous file locations (root vs app-specific)
- Missing task-based navigation
- No deployment topology map

### 4. **File Pollution**

- 31 files at monorepo root
- Most are app-specific but appear global
- Migration docs mixed with feature specs

### 5. **Package Documentation**

- Shared packages lack usage guides
- No clear patterns for package consumers
- Twilio integration docs at root instead of in package

---

## Design Principles for LLM Optimization

### 1. **Hierarchical Organization**

Clear parent/child relationships that reflect system architecture.

### 2. **Deployment-Aligned Structure**

Documentation matches deployment topology:

- Web (Vercel) → `/apps/web/docs/`
- Worker (Railway) → `/apps/worker/docs/`
- Cross-cutting → `/docs/`

### 3. **Contextual Proximity**

Related documents grouped together by feature/concern.

### 4. **Navigation Maps**

Index files at every level with clear descriptions and links.

### 5. **Semantic Categorization**

Purpose-driven folders (features, operations, integrations, etc.).

### 6. **Temporal Separation**

Active work separated from completed/archived work.

### 7. **Discovery Aids**

README.md files explain folder purpose, structure, and key documents.

### 8. **Task-Based Access**

Documentation organized by "what you want to do" not just "what exists".

### 9. **Scope Clarity**

Every document clearly indicates its scope (web, worker, shared, or monorepo).

### 10. **Deployment Topology**

System architecture diagrams showing how apps interact and where they deploy.

---

## Proposed Structure

### Complete Directory Structure

```
buildos-platform/                           # MONOREPO ROOT
│
├── CLAUDE.md                               # Monorepo-aware AI guide
├── README.md                               # Project overview
├── turbo.json                              # Turborepo config
│
├── /docs/                                  # 🌐 CROSS-CUTTING DOCUMENTATION
│   ├── README.md                           # Navigation hub for monorepo
│   ├── INDEX.md                            # Complete file listing
│   ├── MONOREPO_GUIDE.md                  # Turborepo workflows
│   ├── DEPLOYMENT_TOPOLOGY.md             # System architecture & deployment map
│   ├── TASK_INDEX.md                      # Task-based navigation
│   ├── CONTEXT_LAYERS.md                  # Documentation by abstraction level
│   │
│   ├── /architecture/                      # System-wide architecture
│   │   ├── README.md
│   │   ├── SYSTEM_OVERVIEW.md             # How web + worker + packages interact
│   │   ├── DATA_FLOW.md                   # Cross-app data flows
│   │   ├── /decisions/                    # ADRs affecting multiple apps
│   │   └── /diagrams/                     # Architecture diagrams
│   │
│   ├── /business/                          # Business strategy (keep existing)
│   │   ├── README.md
│   │   ├── /strategy/
│   │   ├── /war-room/
│   │   └── /marketing/
│   │
│   ├── /operations/                        # DevOps for entire monorepo
│   │   ├── README.md
│   │   ├── /ci-cd/                        # Turborepo, GitHub Actions
│   │   ├── /monitoring/                   # Cross-app monitoring
│   │   └── /environment/                  # Shared env vars
│   │       └── DEPLOYMENT_ENV_CHECKLIST.md
│   │
│   ├── /integrations/                      # Shared integrations
│   │   ├── README.md
│   │   ├── /supabase/                     # Database (shared by all apps)
│   │   └── /stripe/                       # Payments (if used by both)
│   │
│   └── /research/                          # Cross-cutting research
│       ├── README.md
│       └── /shared/                        # Research affecting multiple apps
│
├── /apps/web/                              # 🌐 WEB APPLICATION
│   ├── CLAUDE.md                           # Web app AI guide
│   ├── README.md                           # Web app overview
│   │
│   └── /docs/                              # Web app documentation
│       ├── README.md                       # Web app docs hub
│       ├── ARCHITECTURE.md                # Web-specific architecture
│       │
│       ├── /features/                      # Web app features
│       │   ├── README.md
│       │   ├── /brain-dump/               # Brain dump UI + processing
│       │   │   ├── README.md
│       │   │   └── build-os-prep-braindump-llm-call-plan.md
│       │   ├── /calendar-integration/     # Calendar UI + sync
│       │   │   ├── README.md
│       │   │   ├── calendar-ingestion-integration-plan.md
│       │   │   ├── calendar-analysis-implementation-status.md
│       │   │   ├── calendar-ingestion-buildos-implementation.md
│       │   │   ├── calendar-cleanup-phase-regeneration-analysis.md
│       │   │   ├── calendar-analysis-bugs-investigation.md
│       │   │   └── calendar-analysis-task-improvement-research.md
│       │   ├── /notifications/            # Notification system
│       │   │   ├── README.md
│       │   │   ├── NOTIFICATION_SYSTEM_CHECKPOINT.md
│       │   │   ├── NOTIFICATION_SYSTEM_DOCS_MAP.md
│       │   │   ├── NOTIFICATION_SYSTEM_IMPLEMENTATION.md
│       │   │   ├── URGENT_NOTIFICATION_BUG.md
│       │   │   └── generic-stackable-notification-system-spec.md
│       │   ├── /onboarding/               # User onboarding
│       │   │   ├── README.md
│       │   │   └── build-os-onboarding-revamp.md
│       │   └── /dashboard/                # Dashboard features
│       │       └── README.md
│       │
│       ├── /api/                           # Web API endpoints
│       │   ├── README.md
│       │   ├── /endpoints/                # Endpoint documentation
│       │   └── /schemas/                  # Request/response schemas
│       │
│       ├── /components/                    # Svelte components
│       │   ├── README.md
│       │   ├── DESIGN_SYSTEM.md          # Design system guide
│       │   └── SVELTE5_PATTERNS.md       # Svelte 5 patterns
│       │
│       ├── /development/                   # Web development guides
│       │   ├── README.md
│       │   ├── /conventions/
│       │   │   └── SVELTEKIT_ENV_CONVENTIONS.md
│       │   ├── /guides/
│       │   └── /testing/
│       │
│       ├── /operations/                    # Web deployment & ops
│       │   ├── README.md
│       │   ├── /deployment/
│       │   │   ├── VERCEL_CONFIGURATION_GUIDE.md
│       │   │   ├── VERCEL_DEPLOYMENT_FIX.md
│       │   │   ├── DEPLOYMENT_CHECKLIST.md
│       │   │   └── READY_TO_DEPLOY.md
│       │   ├── /monitoring/
│       │   └── /runbooks/
│       │
│       ├── /migrations/                    # Web-specific migrations
│       │   ├── README.md
│       │   ├── /active/
│       │   │   ├── PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md
│       │   │   ├── PHASE_2_FIXES_SUMMARY.md
│       │   │   ├── PHASE_2_INTEGRATION_TEST_PLAN.md
│       │   │   ├── TYPE_UPDATE_PROGRESS.md
│       │   │   ├── TYPEFIX_PLAN.md
│       │   │   └── IMPLEMENTATION_PROGRESS.md
│       │   └── /completed/
│       │       ├── MIGRATION_FIX_SUMMARY.md
│       │       ├── MIGRATION_QUICK_START.md
│       │       └── POST_MIGRATION_STEPS.md
│       │
│       ├── /integrations/                  # Web-specific integrations
│       │   ├── README.md
│       │   ├── /google-calendar/          # Calendar (web-driven)
│       │   └── /stripe/                   # Stripe (if web-only)
│       │
│       ├── /prompts/                       # LLM prompts (existing)
│       │   ├── README.md
│       │   └── /brain-dump/
│       │
│       └── /research/                      # Web-specific research
│           ├── README.md
│           └── /investigations/
│
├── /apps/worker/                           # ⚙️ WORKER SERVICE
│   ├── CLAUDE.md                           # Worker AI guide
│   ├── README.md                           # Worker overview
│   │
│   └── /docs/                              # Worker documentation
│       ├── README.md                       # Worker docs hub
│       ├── ARCHITECTURE.md                # Worker architecture
│       ├── RAILWAY_DEPLOYMENT.md         # Railway deployment guide
│       │
│       ├── /features/                      # Worker features
│       │   ├── README.md
│       │   ├── /daily-briefs/             # Daily brief generation
│       │   │   ├── README.md
│       │   │   └── daily-brief-exponential-backoff-spec.md
│       │   ├── /queue-system/             # BullMQ/Queue management
│       │   │   └── README.md
│       │   ├── /scheduler/                # Cron jobs
│       │   │   └── README.md
│       │   └── /email-delivery/           # Email sending
│       │       └── README.md
│       │
│       ├── /api/                           # Worker API endpoints
│       │   ├── README.md
│       │   └── /endpoints/                # Worker-specific endpoints
│       │
│       ├── /development/                   # Worker development
│       │   ├── README.md
│       │   ├── /conventions/
│       │   └── /testing/
│       │
│       ├── /operations/                    # Worker deployment & ops
│       │   ├── README.md
│       │   ├── /deployment/
│       │   │   └── RAILWAY_DEPLOYMENT_GUIDE.md
│       │   ├── /monitoring/
│       │   └── /runbooks/
│       │
│       ├── /integrations/                  # Worker-specific integrations
│       │   ├── README.md
│       │   ├── /email/                    # Email service (Nodemailer)
│       │   │   └── EMAIL_SETUP.md
│       │   └── /twilio/                   # SMS (if worker-managed)
│       │       └── README.md
│       │
│       └── /research/                      # Worker-specific research
│           └── README.md
│
└── /packages/                              # 📦 SHARED PACKAGES
    ├── /shared-types/
    │   ├── README.md                       # Usage guide
    │   ├── CHANGELOG.md                   # Version history
    │   └── /docs/
    │       ├── README.md
    │       └── TYPE_SYSTEM_UPDATE_2025-09-27.md
    │
    ├── /supabase-client/
    │   ├── README.md                       # Client usage
    │   └── /docs/
    │       ├── README.md
    │       ├── SETUP.md
    │       └── PATTERNS.md
    │
    ├── /twilio-service/
    │   ├── README.md                       # Service usage
    │   └── /docs/
    │       ├── README.md
    │       ├── USAGE.md
    │       └── /implementation/
    │           ├── twilio-integration-plan.md
    │           └── twilio-integration-plan-updated.md
    │
    └── /config/
        └── README.md                       # Shared config
```

---

## File Migration Plan

### Phase 1: Root → Monorepo `/docs/`

**Cross-cutting environment documentation:**

```bash
DEPLOYMENT_ENV_CHECKLIST.md → /docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md
```

**New files to create:**

```bash
/docs/README.md                    # Monorepo docs navigation hub
/docs/INDEX.md                     # Complete file listing
/docs/MONOREPO_GUIDE.md           # Turborepo workflows
/docs/DEPLOYMENT_TOPOLOGY.md      # System architecture map
/docs/TASK_INDEX.md               # Task-based navigation
/docs/CONTEXT_LAYERS.md           # Documentation levels
/docs/architecture/README.md      # Architecture docs hub
/docs/operations/README.md        # Operations docs hub
```

### Phase 2: Root → Web App `/apps/web/docs/`

**Operations/Deployment:**

```bash
VERCEL_CONFIGURATION_GUIDE.md → /apps/web/docs/operations/deployment/VERCEL_CONFIGURATION_GUIDE.md
VERCEL_DEPLOYMENT_FIX.md → /apps/web/docs/operations/deployment/VERCEL_DEPLOYMENT_FIX.md
READY_TO_DEPLOY.md → /apps/web/docs/operations/deployment/READY_TO_DEPLOY.md
```

**Conventions:**

```bash
SVELTEKIT_ENV_CONVENTIONS.md → /apps/web/docs/development/conventions/SVELTEKIT_ENV_CONVENTIONS.md
```

**Active Migrations:**

```bash
PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md → /apps/web/docs/migrations/active/PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md
PHASE_2_FIXES_SUMMARY.md → /apps/web/docs/migrations/active/PHASE_2_FIXES_SUMMARY.md
PHASE_2_INTEGRATION_TEST_PLAN.md → /apps/web/docs/migrations/active/PHASE_2_INTEGRATION_TEST_PLAN.md
TYPE_UPDATE_PROGRESS.md → /apps/web/docs/migrations/active/TYPE_UPDATE_PROGRESS.md
TYPEFIX_PLAN.md → /apps/web/docs/migrations/active/TYPEFIX_PLAN.md
IMPLEMENTATION_PROGRESS.md → /apps/web/docs/migrations/active/IMPLEMENTATION_PROGRESS.md
```

**Completed Migrations:**

```bash
MIGRATION_FIX_SUMMARY.md → /apps/web/docs/migrations/completed/MIGRATION_FIX_SUMMARY.md
MIGRATION_QUICK_START.md → /apps/web/docs/migrations/completed/MIGRATION_QUICK_START.md
POST_MIGRATION_STEPS.md → /apps/web/docs/migrations/completed/POST_MIGRATION_STEPS.md
```

**Features - Brain Dump:**

```bash
build-os-prep-braindump-llm-call-plan.md → /apps/web/docs/features/brain-dump/build-os-prep-braindump-llm-call-plan.md
```

**Features - Calendar Integration:**

```bash
calendar-ingestion-integration-plan.md → /apps/web/docs/features/calendar-integration/calendar-ingestion-integration-plan.md
calendar-analysis-implementation-status.md → /apps/web/docs/features/calendar-integration/calendar-analysis-implementation-status.md
calendar-ingestion-buildos-implementation.md → /apps/web/docs/features/calendar-integration/calendar-ingestion-buildos-implementation.md
calendar-cleanup-phase-regeneration-analysis.md → /apps/web/docs/features/calendar-integration/calendar-cleanup-phase-regeneration-analysis.md
calendar-analysis-bugs-investigation.md → /apps/web/docs/features/calendar-integration/calendar-analysis-bugs-investigation.md
calendar-analysis-task-improvement-research.md → /apps/web/docs/features/calendar-integration/calendar-analysis-task-improvement-research.md
```

**Features - Notifications:**

```bash
NOTIFICATION_SYSTEM_CHECKPOINT.md → /apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_CHECKPOINT.md
NOTIFICATION_SYSTEM_DOCS_MAP.md → /apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md
NOTIFICATION_SYSTEM_IMPLEMENTATION.md → /apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md
URGENT_NOTIFICATION_BUG.md → /apps/web/docs/features/notifications/URGENT_NOTIFICATION_BUG.md
generic-stackable-notification-system-spec.md → /apps/web/docs/features/notifications/generic-stackable-notification-system-spec.md
```

**Features - Onboarding:**

```bash
build-os-onboarding-revamp.md → /apps/web/docs/features/onboarding/build-os-onboarding-revamp.md
```

**New files to create:**

```bash
/apps/web/docs/README.md                           # Web app docs hub
/apps/web/docs/features/README.md                 # Features index
/apps/web/docs/features/brain-dump/README.md      # Brain dump overview
/apps/web/docs/features/calendar-integration/README.md
/apps/web/docs/features/notifications/README.md
/apps/web/docs/features/onboarding/README.md
/apps/web/docs/operations/README.md               # Operations hub
/apps/web/docs/migrations/README.md               # Migration tracking
```

### Phase 3: Root → Worker `/apps/worker/docs/`

**Features:**

```bash
daily-brief-exponential-backoff-spec.md → /apps/worker/docs/features/daily-briefs/daily-brief-exponential-backoff-spec.md
```

**Move existing worker docs:**

```bash
/apps/worker/EMAIL_SETUP.md → /apps/worker/docs/integrations/email/EMAIL_SETUP.md
/apps/worker/RAILWAY_DEPLOYMENT.md → /apps/worker/docs/RAILWAY_DEPLOYMENT.md (keep at root for visibility)
```

**New files to create:**

```bash
/apps/worker/docs/README.md                        # Worker docs hub
/apps/worker/docs/ARCHITECTURE.md                 # Worker architecture
/apps/worker/docs/features/README.md              # Features index
/apps/worker/docs/features/daily-briefs/README.md
/apps/worker/docs/features/queue-system/README.md
/apps/worker/docs/features/scheduler/README.md
/apps/worker/docs/features/email-delivery/README.md
/apps/worker/docs/operations/README.md            # Operations hub
/apps/worker/CLAUDE.md                            # Worker AI guide
```

### Phase 4: Root → Packages `/packages/*/docs/`

**Twilio Service:**

```bash
twillio-integration-plan.md → /packages/twilio-service/docs/implementation/twilio-integration-plan.md
twilio-integration-plan-updated.md → /packages/twilio-service/docs/implementation/twilio-integration-plan-updated.md
```

**New files to create:**

```bash
/packages/shared-types/README.md                   # Package overview
/packages/shared-types/CHANGELOG.md               # Version history
/packages/shared-types/docs/README.md             # Types documentation

/packages/supabase-client/README.md               # Client usage
/packages/supabase-client/docs/README.md
/packages/supabase-client/docs/SETUP.md
/packages/supabase-client/docs/PATTERNS.md

/packages/twilio-service/README.md                # Service usage
/packages/twilio-service/docs/README.md
/packages/twilio-service/docs/USAGE.md
```

### Phase 5: Update Root CLAUDE.md

Complete rewrite to explain:

1. Monorepo structure
2. App-specific vs cross-cutting documentation
3. Navigation by task/scope
4. Deployment topology
5. Quick access patterns for LLM agents

---

## Navigation Aids for LLMs

### 1. Root `/docs/README.md` - Monorepo Navigation Hub

```markdown
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
- `/business/` - Business strategy, marketing, fundraising
- `/operations/` - Monorepo DevOps, CI/CD, monitoring
- `/integrations/` - Shared integrations (Supabase, Stripe)
- `/research/` - Cross-cutting research

## Quick Navigation

### Understanding the System

1. [Monorepo Guide](MONOREPO_GUIDE.md) - Turborepo structure
2. [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) - How apps deploy
3. [System Architecture](architecture/SYSTEM_OVERVIEW.md) - How pieces fit

### By Task

See [Task Index](TASK_INDEX.md) for navigation by "what you want to do"

### By Deployment Target

- **Web (Vercel)**: `/apps/web/docs/`
- **Worker (Railway)**: `/apps/worker/docs/`
```

### 2. `/docs/DEPLOYMENT_TOPOLOGY.md` - Critical for LLMs

```markdown
# Deployment Topology

## System Architecture
```

┌─────────────────────────────────────────────────────────────┐
│ BuildOS Platform │
├─────────────────────────────────────────────────────────────┤
│ │
│ ┌──────────────┐ ┌──────────────┐ │
│ │ Web App │◄────────────►│ Worker │ │
│ │ (Vercel) │ Webhooks │ (Railway) │ │
│ │ SvelteKit │ │ Express │ │
│ └──────┬───────┘ └──────┬───────┘ │
│ │ │ │
│ │ ┌──────────┐ │ │
│ └────────►│ Supabase │◄───────┘ │
│ │ Database │ │
│ └──────────┘ │
│ │
└─────────────────────────────────────────────────────────────┘

```

## Deployment Targets

### Web App → Vercel
- **Code:** `/apps/web/`
- **Docs:** `/apps/web/docs/`
- **URL:** buildos.app
- **Purpose:** User interface, API routes, real-time UI
- **Environment:** Serverless (Vercel Functions)
- **Build Command:** `pnpm build --filter=web`
- **Dependencies:** `shared-types`, `supabase-client`

### Worker → Railway
- **Code:** `/apps/worker/`
- **Docs:** `/apps/worker/docs/`
- **URL:** Railway private URL
- **Purpose:** Background jobs, email delivery, scheduled tasks
- **Environment:** Long-running Node.js process
- **Build Command:** `pnpm build --filter=worker`
- **Dependencies:** `shared-types`, `supabase-client`, `twilio-service`

## Data Flow Examples

[Include specific examples of cross-app communication]
```

### 3. `/docs/TASK_INDEX.md` - Task-Based Navigation

```markdown
# Task-Based Documentation Index

Navigation organized by **what you want to do**, not just what exists.

## Understanding the System

| I want to understand...        | Start Here                                      | Then Read            | Code Location                 |
| ------------------------------ | ----------------------------------------------- | -------------------- | ----------------------------- |
| How brain dumps work           | `/apps/web/docs/features/brain-dump/`           | Implementation files | `/apps/web/src/`              |
| How calendar sync works        | `/apps/web/docs/features/calendar-integration/` | Calendar service     | `/apps/web/src/lib/services/` |
| How daily briefs work          | `/apps/worker/docs/features/daily-briefs/`      | Worker services      | `/apps/worker/src/`           |
| How web and worker communicate | `/docs/DEPLOYMENT_TOPOLOGY.md`                  | Data flow docs       | Both apps                     |

## Implementing Features

| I want to...         | Location                      | Steps                                    |
| -------------------- | ----------------------------- | ---------------------------------------- |
| Add a web feature    | `/apps/web/docs/features/`    | 1. Create spec 2. Implement 3. Test      |
| Add a background job | `/apps/worker/docs/features/` | 1. Define type 2. Create handler 3. Test |
| Add shared types     | `/packages/shared-types/`     | 1. Add type 2. Build 3. Update apps      |

## Deployment

| Target            | Guide                                     | Checklist                     |
| ----------------- | ----------------------------------------- | ----------------------------- |
| Web to Vercel     | `/apps/web/docs/operations/deployment/`   | VERCEL_CONFIGURATION_GUIDE.md |
| Worker to Railway | `/apps/worker/docs/RAILWAY_DEPLOYMENT.md` | Railway checklist             |
| Environment setup | `/docs/operations/environment/`           | DEPLOYMENT_ENV_CHECKLIST.md   |

## Debugging

| Issue Type          | Check              | Location                                 |
| ------------------- | ------------------ | ---------------------------------------- |
| Web app broken      | Vercel logs        | `/apps/web/docs/operations/runbooks/`    |
| Worker jobs failing | Railway logs       | `/apps/worker/docs/operations/runbooks/` |
| Database issue      | Supabase dashboard | `/docs/integrations/supabase/`           |
```

### 4. `/apps/web/docs/README.md` - Web App Hub

```markdown
# Web App Documentation

## 🌐 Deployment Target: Vercel

This is **web app-specific** documentation (`/apps/web`).

**For worker docs**, see `/apps/worker/docs/`
**For shared concerns**, see `/docs/`

## What This App Does

- User-facing UI (brain dumps, projects, calendar, dashboard)
- SvelteKit API routes (SSE streaming, CRUD operations)
- Real-time updates via Supabase subscriptions
- Google Calendar integration (frontend + API)
- Stripe payments (optional, via ENABLE_STRIPE flag)

## Tech Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes syntax)
- **Database:** Supabase (via `@packages/supabase-client`)
- **Auth:** Supabase Auth + Google OAuth
- **Deployment:** Vercel (serverless functions)
- **Shared Packages:** `shared-types`, `supabase-client`

## Documentation Structure

| Folder           | Contents                    | Key Documents                       |
| ---------------- | --------------------------- | ----------------------------------- |
| `/features/`     | Feature specs and designs   | brain-dump, calendar, notifications |
| `/api/`          | API endpoint documentation  | endpoints, schemas, examples        |
| `/components/`   | UI component docs           | design system, Svelte 5 patterns    |
| `/development/`  | Dev guides and conventions  | testing, patterns, setup            |
| `/operations/`   | Deployment and ops          | Vercel config, runbooks, monitoring |
| `/migrations/`   | Migration tracking          | active migrations, completed        |
| `/integrations/` | Third-party services        | Google Calendar, Stripe             |
| `/prompts/`      | LLM prompt templates        | brain dump prompts                  |
| `/research/`     | Research and investigations | bug analysis, experiments           |

## Quick Start for LLM Agents

### Understanding a Feature

1. Read spec: `/features/[feature-name]/README.md`
2. Check implementation: `/apps/web/src/lib/components/[feature]/`
3. Review API: `/api/endpoints/[feature].md`

### Adding a Feature

1. Create spec: `/features/[new-feature]/README.md`
2. Document API changes: `/api/endpoints/[new-feature].md`
3. Implement in: `/apps/web/src/`
4. Update this README with new feature

### Debugging

1. Check research: `/research/investigations/`
2. Review runbook: `/operations/runbooks/`
3. Check Vercel logs

## Related Documentation

- **System-wide**: `/docs/architecture/`
- **Worker service**: `/apps/worker/docs/`
- **Shared types**: `/packages/shared-types/`
```

### 5. `/apps/worker/docs/README.md` - Worker Hub

```markdown
# Worker Service Documentation

## ⚙️ Deployment Target: Railway

This is **worker service-specific** documentation (`/apps/worker`).

**For web app docs**, see `/apps/web/docs/`
**For shared concerns**, see `/docs/`

## What This Service Does

- Background job processing (BullMQ with Supabase queue)
- Daily brief generation and email delivery
- Scheduled tasks via cron jobs
- Asynchronous operations offloaded from web

## Tech Stack

- **Framework:** Node.js + Express
- **Queue:** BullMQ (Supabase-based, no Redis)
- **Database:** Supabase (via `@packages/supabase-client`)
- **Email:** Nodemailer
- **SMS:** Twilio (via `@packages/twilio-service`)
- **Deployment:** Railway
- **Shared Packages:** `shared-types`, `supabase-client`, `twilio-service`

## Documentation Structure

| Folder           | Contents             | Key Documents                         |
| ---------------- | -------------------- | ------------------------------------- |
| `/features/`     | Worker features      | daily-briefs, queue-system, scheduler |
| `/api/`          | Worker API endpoints | job status, queue management          |
| `/development/`  | Dev guides           | conventions, testing                  |
| `/operations/`   | Deployment and ops   | Railway config, runbooks              |
| `/integrations/` | External services    | email (Nodemailer), Twilio            |
| `/research/`     | Investigations       | performance analysis                  |

## Quick Start for LLM Agents

### Understanding Worker Jobs

1. Read feature spec: `/features/[job-type]/README.md`
2. Check handler: `/apps/worker/src/jobs/[job].ts`
3. Review queue config: `/apps/worker/src/services/queue/`

### Adding a Background Job

1. Define job type: `/packages/shared-types/src/queue.ts`
2. Create handler: `/apps/worker/src/jobs/[new-job].ts`
3. Document: `/features/[new-job]/README.md`
4. Test: Write job tests

### Debugging Jobs

1. Check Railway logs
2. Review runbook: `/operations/runbooks/`
3. Check queue status: Worker API `/api/queue/status`

## Related Documentation

- **System-wide**: `/docs/architecture/`
- **Web app**: `/apps/web/docs/`
- **Shared types**: `/packages/shared-types/`
```

### 6. Updated Root `CLAUDE.md`

````markdown
# CLAUDE.md - BuildOS Platform (Turborepo Monorepo)

## 🏗️ Monorepo Structure Overview

BuildOS is a **Turborepo monorepo** with two independently deployed applications and shared packages.

### Apps (Independently Deployable)

1. **`/apps/web`** - SvelteKit web application
   - **Deployment:** Vercel (serverless)
   - **Documentation:** `/apps/web/docs/`
   - **CLAUDE Guide:** `/apps/web/CLAUDE.md`
   - **Purpose:** User UI, API endpoints, real-time updates
   - **Tech:** SvelteKit 2 + Svelte 5 (runes)

2. **`/apps/worker`** - Background worker service
   - **Deployment:** Railway (long-running)
   - **Documentation:** `/apps/worker/docs/`
   - **CLAUDE Guide:** `/apps/worker/CLAUDE.md`
   - **Purpose:** Background jobs, email, scheduled tasks
   - **Tech:** Node.js + Express + BullMQ

### Packages (Shared Libraries)

1. **`/packages/shared-types`** - Shared TypeScript type definitions
2. **`/packages/supabase-client`** - Supabase database client
3. **`/packages/twilio-service`** - SMS service wrapper
4. **`/packages/config`** - Shared configuration

## 📚 Documentation Navigation

### Primary Documentation Locations

| Scope              | Location             | Purpose                                        |
| ------------------ | -------------------- | ---------------------------------------------- |
| **Monorepo-wide**  | `/docs/`             | Cross-cutting concerns, architecture, business |
| **Web App**        | `/apps/web/docs/`    | Web UI, SvelteKit patterns, Vercel deployment  |
| **Worker Service** | `/apps/worker/docs/` | Background jobs, Railway deployment            |
| **Packages**       | `/packages/*/docs/`  | Package-specific usage guides                  |

### Essential Starting Points

1. **New to BuildOS?** → `/docs/README.md` (monorepo navigation hub)
2. **Understanding architecture?** → `/docs/DEPLOYMENT_TOPOLOGY.md`
3. **Working on web features?** → `/apps/web/docs/README.md`
4. **Working on worker jobs?** → `/apps/worker/docs/README.md`
5. **Looking for specific task?** → `/docs/TASK_INDEX.md`

## 🎯 Context for LLM Agents

### Determining Scope

**Ask yourself:** "Which app does this affect?"

- **Web-only** (UI, API routes, frontend features) → `/apps/web/docs/`
- **Worker-only** (background jobs, email, cron) → `/apps/worker/docs/`
- **Both apps** (architecture, database, shared types) → `/docs/`
- **Package** (shared code) → `/packages/[package-name]/docs/`

### Quick Access by Task

#### "I want to understand how [feature] works"

| Feature       | Primary Docs                                    | Secondary Docs                             |
| ------------- | ----------------------------------------------- | ------------------------------------------ |
| Brain dumps   | `/apps/web/docs/features/brain-dump/`           | `/apps/web/src/lib/components/brain-dump/` |
| Calendar sync | `/apps/web/docs/features/calendar-integration/` | `/docs/architecture/DATA_FLOW.md`          |
| Daily briefs  | `/apps/worker/docs/features/daily-briefs/`      | `/apps/worker/src/services/dailyBrief/`    |
| Notifications | `/apps/web/docs/features/notifications/`        | Component code                             |

#### "I want to add a feature"

- **Web feature:** Start with `/apps/web/docs/features/README.md`
- **Worker job:** Start with `/apps/worker/docs/features/README.md`
- **Shared type:** Start with `/packages/shared-types/`

#### "I want to deploy"

- **Web to Vercel:** `/apps/web/docs/operations/deployment/`
- **Worker to Railway:** `/apps/worker/docs/RAILWAY_DEPLOYMENT.md`
- **Environment vars:** `/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md`

#### "I want to debug an issue"

- **Web issue:** Check `/apps/web/docs/operations/runbooks/` + Vercel logs
- **Worker issue:** Check `/apps/worker/docs/operations/runbooks/` + Railway logs
- **Database issue:** Check `/docs/integrations/supabase/`

## 🚀 Development Commands

### Monorepo Commands (from root)

```bash
# Install dependencies
pnpm install

# Start all apps
pnpm dev

# Start specific app
pnpm dev --filter=web
pnpm dev --filter=worker

# Build all
pnpm build

# Build specific app
pnpm build --filter=web
pnpm build --filter=worker

# Test all
pnpm test

# Typecheck all
pnpm typecheck
```
````

### App-Specific Commands

**Web App** (`cd apps/web`):

```bash
pnpm dev:split    # Dev with type checking (recommended)
pnpm dev:fast     # Dev without type checking
pnpm test:llm     # LLM tests (costs money)
```

**Worker** (`cd apps/worker`):

```bash
pnpm dev          # Development mode
pnpm test         # Run tests
```

## 💡 Best Practices for LLM Agents

1. **Always identify scope first** - Determine if change affects web, worker, or both
2. **Read the README** - Every major folder has a README explaining its purpose
3. **Follow the task index** - Use `/docs/TASK_INDEX.md` for common operations
4. **Check deployment topology** - Understand where code runs before modifying
5. **Update documentation** - When adding features, update relevant README files
6. **Cross-reference** - Link related docs across apps when appropriate

## 📖 Detailed App Guides

For comprehensive app-specific guidance:

- **Web App**: See `/apps/web/CLAUDE.md`
- **Worker Service**: See `/apps/worker/CLAUDE.md`

---

_This is the monorepo-level guide. For app-specific details, see individual app CLAUDE.md files._

````

---

## Implementation Plan

### Step 1: Create Directory Structure (No file moves yet)

```bash
# Monorepo /docs/ structure
mkdir -p /docs/architecture/decisions
mkdir -p /docs/architecture/diagrams
mkdir -p /docs/operations/ci-cd
mkdir -p /docs/operations/monitoring
mkdir -p /docs/operations/environment
mkdir -p /docs/integrations/supabase
mkdir -p /docs/integrations/stripe
mkdir -p /docs/research/shared

# Web app structure
mkdir -p /apps/web/docs/features/brain-dump
mkdir -p /apps/web/docs/features/calendar-integration
mkdir -p /apps/web/docs/features/notifications
mkdir -p /apps/web/docs/features/onboarding
mkdir -p /apps/web/docs/features/dashboard
mkdir -p /apps/web/docs/operations/deployment
mkdir -p /apps/web/docs/operations/monitoring
mkdir -p /apps/web/docs/operations/runbooks
mkdir -p /apps/web/docs/migrations/active
mkdir -p /apps/web/docs/migrations/completed
mkdir -p /apps/web/docs/development/conventions
mkdir -p /apps/web/docs/development/guides
mkdir -p /apps/web/docs/development/testing
mkdir -p /apps/web/docs/research/investigations

# Worker structure
mkdir -p /apps/worker/docs/features/daily-briefs
mkdir -p /apps/worker/docs/features/queue-system
mkdir -p /apps/worker/docs/features/scheduler
mkdir -p /apps/worker/docs/features/email-delivery
mkdir -p /apps/worker/docs/operations/deployment
mkdir -p /apps/worker/docs/operations/monitoring
mkdir -p /apps/worker/docs/operations/runbooks
mkdir -p /apps/worker/docs/integrations/email
mkdir -p /apps/worker/docs/integrations/twilio
mkdir -p /apps/worker/docs/development/conventions
mkdir -p /apps/worker/docs/development/testing

# Package structure
mkdir -p /packages/shared-types/docs
mkdir -p /packages/supabase-client/docs
mkdir -p /packages/twilio-service/docs/implementation
````

### Step 2: Generate All Navigation/README Files

Generate in this order:

1. `/docs/README.md` (monorepo hub)
2. `/docs/MONOREPO_GUIDE.md`
3. `/docs/DEPLOYMENT_TOPOLOGY.md`
4. `/docs/TASK_INDEX.md`
5. `/docs/CONTEXT_LAYERS.md`
6. `/docs/INDEX.md` (complete file listing)
7. `/apps/web/docs/README.md`
8. `/apps/worker/docs/README.md`
9. All feature-level README.md files
10. Package README.md files
11. Updated root `CLAUDE.md`
12. `/apps/web/CLAUDE.md` (app-specific guide)
13. `/apps/worker/CLAUDE.md` (app-specific guide)

### Step 3: Move Files (With Git History Preservation)

Use `git mv` to preserve history:

```bash
# Example moves (use git mv for each)
git mv VERCEL_CONFIGURATION_GUIDE.md apps/web/docs/operations/deployment/
git mv calendar-ingestion-integration-plan.md apps/web/docs/features/calendar-integration/
git mv daily-brief-exponential-backoff-spec.md apps/worker/docs/features/daily-briefs/
# ... (all 31 files)
```

### Step 4: Update Internal Links

After moving files, update all internal markdown links to reflect new locations.

### Step 5: Create Git Commit

```bash
git add .
git commit -m "docs: reorganize documentation for monorepo structure

- Separate web (Vercel) and worker (Railway) documentation
- Create cross-cutting /docs/ for monorepo concerns
- Add navigation aids for LLM agents (README, TASK_INDEX, DEPLOYMENT_TOPOLOGY)
- Move 31 root-level docs to appropriate app/package folders
- Update CLAUDE.md with monorepo-aware guidance
- Preserve git history with git mv"
```

### Step 6: Validation

Run validation checks:

1. All moved files accessible at new locations
2. All internal links resolve correctly
3. No broken references in code
4. README files render correctly
5. LLM can navigate documentation

---

## Validation Strategy

### Automated Checks

```bash
# Check for broken markdown links
find . -name "*.md" -exec markdown-link-check {} \;

# Verify all moved files exist
./scripts/validate-doc-structure.sh

# Check for orphaned documentation references
grep -r "\.md" apps/web/src apps/worker/src --include="*.ts" --include="*.svelte"
```

### Manual Validation

1. **LLM Navigation Test**: Ask Claude to find specific documentation
2. **Developer Test**: New developer follows README to understand system
3. **Deployment Test**: Follow deployment guides to ensure accuracy
4. **Cross-Reference Test**: Verify links between docs work

### Success Criteria

✅ All 31 root files moved to appropriate locations
✅ Zero broken internal links
✅ Every major folder has a README.md
✅ Root CLAUDE.md explains monorepo structure
✅ Task-based navigation works
✅ Deployment topology is clear
✅ LLM can navigate to any documentation in <3 steps

---

## Benefits of This Structure

### For LLM Agents

1. **Clear scope identification** - Immediately know if doc is web, worker, or shared
2. **Deployment-aware** - Understand where code runs before modifying
3. **Task-based navigation** - Find docs by "what to do" not just "what exists"
4. **Reduced ambiguity** - No confusion about which app documentation applies to
5. **Better context** - README files provide context at every level

### For Developers

1. **Logical organization** - Documentation follows code structure
2. **Easier onboarding** - Clear starting points for new developers
3. **Faster debugging** - Runbooks organized by deployment target
4. **Migration tracking** - Clear separation of active vs completed migrations
5. **Package clarity** - Each package has usage documentation

### For Documentation Maintenance

1. **Scoped updates** - Changes to web docs don't affect worker docs
2. **Version tracking** - Easier to track documentation versions per app
3. **Reduced duplication** - Cross-cutting concerns in one place
4. **Clear ownership** - Documentation ownership follows code ownership

---

## Appendix: Complete File Migration Table

| Current Location                                  | New Location                                    | Category           |
| ------------------------------------------------- | ----------------------------------------------- | ------------------ |
| `VERCEL_CONFIGURATION_GUIDE.md`                   | `/apps/web/docs/operations/deployment/`         | Web Ops            |
| `VERCEL_DEPLOYMENT_FIX.md`                        | `/apps/web/docs/operations/deployment/`         | Web Ops            |
| `DEPLOYMENT_ENV_CHECKLIST.md`                     | `/docs/operations/environment/`                 | Monorepo           |
| `READY_TO_DEPLOY.md`                              | `/apps/web/docs/operations/deployment/`         | Web Ops            |
| `SVELTEKIT_ENV_CONVENTIONS.md`                    | `/apps/web/docs/development/conventions/`       | Web Dev            |
| `PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md`          | `/apps/web/docs/migrations/active/`             | Web Migration      |
| `PHASE_2_FIXES_SUMMARY.md`                        | `/apps/web/docs/migrations/active/`             | Web Migration      |
| `PHASE_2_INTEGRATION_TEST_PLAN.md`                | `/apps/web/docs/migrations/active/`             | Web Migration      |
| `TYPE_UPDATE_PROGRESS.md`                         | `/apps/web/docs/migrations/active/`             | Web Migration      |
| `TYPEFIX_PLAN.md`                                 | `/apps/web/docs/migrations/active/`             | Web Migration      |
| `IMPLEMENTATION_PROGRESS.md`                      | `/apps/web/docs/migrations/active/`             | Web Migration      |
| `MIGRATION_FIX_SUMMARY.md`                        | `/apps/web/docs/migrations/completed/`          | Web Migration      |
| `MIGRATION_QUICK_START.md`                        | `/apps/web/docs/migrations/completed/`          | Web Migration      |
| `POST_MIGRATION_STEPS.md`                         | `/apps/web/docs/migrations/completed/`          | Web Migration      |
| `build-os-prep-braindump-llm-call-plan.md`        | `/apps/web/docs/features/brain-dump/`           | Web Feature        |
| `calendar-ingestion-integration-plan.md`          | `/apps/web/docs/features/calendar-integration/` | Web Feature        |
| `calendar-analysis-implementation-status.md`      | `/apps/web/docs/features/calendar-integration/` | Web Feature        |
| `calendar-ingestion-buildos-implementation.md`    | `/apps/web/docs/features/calendar-integration/` | Web Feature        |
| `calendar-cleanup-phase-regeneration-analysis.md` | `/apps/web/docs/features/calendar-integration/` | Web Feature        |
| `calendar-analysis-bugs-investigation.md`         | `/apps/web/docs/features/calendar-integration/` | Web Feature        |
| `calendar-analysis-task-improvement-research.md`  | `/apps/web/docs/features/calendar-integration/` | Web Feature        |
| `NOTIFICATION_SYSTEM_CHECKPOINT.md`               | `/apps/web/docs/features/notifications/`        | Web Feature        |
| `NOTIFICATION_SYSTEM_DOCS_MAP.md`                 | `/apps/web/docs/features/notifications/`        | Web Feature        |
| `NOTIFICATION_SYSTEM_IMPLEMENTATION.md`           | `/apps/web/docs/features/notifications/`        | Web Feature        |
| `URGENT_NOTIFICATION_BUG.md`                      | `/apps/web/docs/features/notifications/`        | Web Feature        |
| `generic-stackable-notification-system-spec.md`   | `/apps/web/docs/features/notifications/`        | Web Feature        |
| `build-os-onboarding-revamp.md`                   | `/apps/web/docs/features/onboarding/`           | Web Feature        |
| `daily-brief-exponential-backoff-spec.md`         | `/apps/worker/docs/features/daily-briefs/`      | Worker Feature     |
| `twillio-integration-plan.md`                     | `/packages/twilio-service/docs/implementation/` | Package            |
| `twilio-integration-plan-updated.md`              | `/packages/twilio-service/docs/implementation/` | Package            |
| `/apps/worker/EMAIL_SETUP.md`                     | `/apps/worker/docs/integrations/email/`         | Worker Integration |

**Total Files to Move:** 31

---

## Next Steps

1. **Review this plan** - Ensure structure makes sense
2. **Approve/modify** - Make any adjustments needed
3. **Execute** - Run implementation steps
4. **Validate** - Run validation checks
5. **Commit** - Create git commit with clear message
6. **Communicate** - Notify team of new structure

---

_End of Documentation Reorganization Plan v2.0_
