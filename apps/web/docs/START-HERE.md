# START HERE - Web App Documentation Guide

**Last Updated:** 2025-10-06
**Documentation Location:** `/apps/web/docs/`

> **🎯 Quick Start:** New to BuildOS web app development? Read [Development Workflow](#development-workflow) then dive into [Common Tasks](#common-tasks).

---

## 📚 What This Guide Covers

This is the **definitive navigation guide** for all BuildOS web app documentation. Use this to:

- Find documentation quickly by role, feature, or technical area
- Understand the documentation structure
- Locate specific topics with cross-references
- Identify gaps and archived content

**For monorepo-wide documentation**, see `/docs/` (architecture, deployment topology, worker service, etc.)
**For web app-specific docs**, you're in the right place: `/apps/web/docs/`

---

## 🗺️ Documentation Structure Overview

```
/apps/web/docs/
├── START-HERE.md           ← You are here
├── README.md               ← Web app overview (tech stack, commands)
│
├── /features/              ← ⭐ Feature specs and implementation guides
│   ├── README.md           (Feature index - START HERE)
│   ├── /brain-dump/        (10 docs - comprehensive)
│   ├── /calendar-integration/ (7 docs - with improvement plans)
│   ├── /notifications/     (6 docs - excellent docs map)
│   ├── /admin-dashboard/   (1 doc - LLM tracking)
│   ├── /onboarding/        (3 docs - assets + flow)
│   ├── /onboarding-v2/     (1 doc - complete guide)
│   ├── /project-export/    (2 docs - export/print)
│   ├── /phase-generation/  (1 doc - scheduling)
│   └── /time-blocks/       (1 doc - time blocks)
│
├── /audits/                ← ⭐ NEW: Feature audits and reviews
│   ├── README.md           (Audit index)
│   ├── CORE_COLUMNS_AUDIT.md (⚠️ Critical gaps)
│   ├── CORE_COLUMNS_IMPLEMENTATION_SUMMARY.md
│   ├── NOTIFICATION_LOGGING_IMPLEMENTATION_COMPLETE.md
│   └── NOTIFICATION_PREFERENCES_REFACTOR_COMPLETE.md
│
├── /technical/             ← Technical deep-dives
│   ├── /architecture/      (11 docs - system design)
│   ├── /api/               (14 docs - 134 endpoints documented)
│   ├── /database/          (3 docs - ⚠️ PLACEHOLDERS - critical gap)
│   ├── /services/          (8 docs - service layer patterns)
│   ├── /components/        (7 docs - design system)
│   ├── /testing/           (4 docs - strategies)
│   ├── /deployment/        (12 docs - runbooks)
│   ├── /development/       (10 docs - patterns)
│   ├── /integrations/      (3 docs - Stripe only)
│   ├── /audits/            (1 doc - brain dump audit)
│   └── /performance/       (1 doc - route optimization)
│
├── /development/           ← Development workflows and processes
│   ├── README.md           (workflow hub)
│   ├── DEVELOPMENT_PROCESS.md (complete dev lifecycle)
│   ├── TESTING_CHECKLIST.md (quality gates)
│   ├── GIT_WORKFLOW.md     (version control)
│   ├── /plans/             (feature implementation plans)
│   └── /templates/         (FEATURE_PLAN_TEMPLATE.md)
│
├── /design/                ← ⭐ Design system and UI patterns
│   ├── README.md           (Design index - START HERE)
│   ├── design-system.md    (comprehensive design guide)
│   ├── /components/        (modal standards, etc.)
│   └── [11 docs total]     (patterns, specs, frameworks)
│
├── /prompts/               ← AI/LLM prompt templates
│   ├── README.md           (navigation + architecture)
│   ├── /brain-dump/        (28 prompt files organized by flow)
│   ├── /calendar-analysis/ (project detection prompts)
│   └── /task-synthesis/    (task reorganization)
│
├── /operations/            ← ⭐ Deployment and operations
│   ├── README.md           (Operations index)
│   └── /deployment/        (3 docs - Vercel configuration)
│
├── /integrations/          ← ⭐ Third-party integrations
│   ├── README.md           (Integration index - 20% complete)
│   └── [5 docs - Stripe]   (⚠️ Missing: Google OAuth, Google Calendar, Twilio, OpenAI)
│
└── /migrations/            ← Active migrations and refactoring
    └── README.md           (Migration index)
```

---

## 🚀 Quick Navigation by Role

### 👨‍💻 I'm a Developer

**Getting Started:**

1. Read: [README.md](README.md) - Web app overview
2. Setup: [/development/README.md](development/README.md) - Development workflow
3. Commands: [Essential Commands](#essential-commands)

**Daily Workflow:**

- Planning: [templates/FEATURE_PLAN_TEMPLATE.md](development/templates/FEATURE_PLAN_TEMPLATE.md)
- Testing: [TESTING_CHECKLIST.md](development/TESTING_CHECKLIST.md)
- Git: [GIT_WORKFLOW.md](development/GIT_WORKFLOW.md)

**Finding Code Patterns:**

- Svelte 5 Runes: [technical/development/svelte5-runes.md](technical/development/svelte5-runes.md)
- SvelteKit Patterns: [technical/development/sveltekit-patterns.md](technical/development/sveltekit-patterns.md)
- Component Patterns: [design/components/modal-standards.md](design/components/modal-standards.md)
- Service Architecture: [technical/services/README.md](technical/services/README.md)

### 🎨 I'm Working on Design/UI

**Start Here:**

1. [design/design-system.md](design/design-system.md) - Complete design system
2. [technical/components/DESIGN_SYSTEM_GUIDE.md](technical/components/DESIGN_SYSTEM_GUIDE.md) - Implementation guide

**Component Standards:**

- [design/components/modal-standards.md](design/components/modal-standards.md)
- [technical/components/MODAL_STANDARDS.md](technical/components/MODAL_STANDARDS.md)
- [design/project-page-patterns.md](design/project-page-patterns.md)

**Design Philosophy:**

- [design/design-principles-checklist.md](design/design-principles-checklist.md)
- [design/context-framework-philosophy.md](design/context-framework-philosophy.md)

### 🏗️ I'm Working on Architecture

**System Architecture:**

1. [technical/architecture/BUILD_OS_MASTER_CONTEXT.md](technical/architecture/BUILD_OS_MASTER_CONTEXT.md) - Complete system overview
2. [technical/architecture/README.md](technical/architecture/README.md) - Architecture docs hub

**Specific Architectures:**

- Brain Dump: [technical/architecture/brain-dump-flow.md](technical/architecture/brain-dump-flow.md)
- Calendar: [technical/architecture/calendar-sync.md](technical/architecture/calendar-sync.md)
- Email: [technical/architecture/email-system.md](technical/architecture/email-system.md)
- Scalability: [technical/architecture/SCALABILITY_ANALYSIS.md](technical/architecture/SCALABILITY_ANALYSIS.md)

### 🧪 I'm Writing Tests

1. [development/TESTING_CHECKLIST.md](development/TESTING_CHECKLIST.md) - Complete testing procedures
2. [technical/testing/strategy.md](technical/testing/strategy.md) - Testing strategy
3. [technical/testing/llm-testing.md](technical/testing/llm-testing.md) - LLM prompt testing
4. [technical/testing/vitest-setup.md](technical/testing/vitest-setup.md) - Vitest configuration

### 🚢 I'm Deploying

**Pre-Deployment:**

1. [technical/deployment/DEPLOYMENT_CHECKLIST.md](technical/deployment/DEPLOYMENT_CHECKLIST.md) - Complete checklist
2. [operations/deployment/READY_TO_DEPLOY.md](operations/deployment/READY_TO_DEPLOY.md) - Readiness verification

**Deployment:** 3. [operations/deployment/VERCEL_CONFIGURATION_GUIDE.md](operations/deployment/VERCEL_CONFIGURATION_GUIDE.md) 4. [technical/deployment/VERCEL_DEPLOYMENT.md](technical/deployment/VERCEL_DEPLOYMENT.md)

**Troubleshooting:**

- [operations/deployment/VERCEL_DEPLOYMENT_FIX.md](operations/deployment/VERCEL_DEPLOYMENT_FIX.md)
- [technical/deployment/runbooks/](technical/deployment/runbooks/) - 9 runbooks for common issues

### 🤖 I'm Working with AI/LLM

**Prompt Engineering:**

1. [prompts/README.md](prompts/README.md) - Complete prompt system navigation
2. [prompts/PROMPT_ARCHITECTURE.md](prompts/PROMPT_ARCHITECTURE.md) - Technical architecture

**Prompt Templates:**

- Brain Dump: [prompts/brain-dump/](prompts/brain-dump/)
- Calendar Analysis: [prompts/calendar-analysis/](prompts/calendar-analysis/)
- Task Synthesis: [prompts/task-synthesis/](prompts/task-synthesis/)

**LLM Services:**

- [technical/services/LLM_USAGE_TRACKING.md](technical/services/LLM_USAGE_TRACKING.md)
- [technical/services/prompt-service.md](technical/services/prompt-service.md)

---

## 📋 Common Tasks

### Task: Understanding a Feature

1. **Check if it exists:** See [Feature Index](#complete-feature-index) below
2. **Read feature README:** `/features/[feature-name]/README.md`
3. **Check architecture:** `/technical/architecture/[feature-name].md`
4. **Review API:** `/technical/api/endpoints/[feature-name].md`
5. **Find components:** `/apps/web/src/lib/components/[feature]/`

**Example: Understanding Brain Dump**

- Start: [features/brain-dump/README.md](features/brain-dump/README.md)
- Architecture: [technical/architecture/brain-dump-flow.md](technical/architecture/brain-dump-flow.md)
- Audit: [technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md](technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md)
- Prompts: [prompts/brain-dump/](prompts/brain-dump/)
- API: [technical/api/endpoints/braindumps.md](technical/api/endpoints/braindumps.md)

### Task: Adding a New Feature

1. **Create plan:** Copy [development/templates/FEATURE_PLAN_TEMPLATE.md](development/templates/FEATURE_PLAN_TEMPLATE.md)
2. **Follow workflow:** [development/DEVELOPMENT_PROCESS.md](development/DEVELOPMENT_PROCESS.md)
3. **Create spec:** `/features/[new-feature]/README.md`
4. **Document architecture:** `/technical/architecture/[new-feature].md`
5. **Implement:** `/apps/web/src/`
6. **Test:** [development/TESTING_CHECKLIST.md](development/TESTING_CHECKLIST.md)
7. **Update this guide:** Add to [Feature Index](#complete-feature-index)

### Task: Debugging an Issue

1. **Check runbooks:** [technical/deployment/runbooks/](technical/deployment/runbooks/)
    - [incident-response.md](technical/deployment/runbooks/incident-response.md)
    - [performance-issues.md](technical/deployment/runbooks/performance-issues.md)
    - [calendar-webhook-failures.md](technical/deployment/runbooks/calendar-webhook-failures.md)
    - [stripe-webhook-failures.md](technical/deployment/runbooks/stripe-webhook-failures.md)
    - [openai-rate-limiting.md](technical/deployment/runbooks/openai-rate-limiting.md)
    - [database-recovery.md](technical/deployment/runbooks/database-recovery.md)

2. **Check git workflow:** [development/GIT_WORKFLOW.md](development/GIT_WORKFLOW.md) - Troubleshooting section

3. **Review technical docs:** `/technical/development/` for specific issues

### Task: Working with APIs

1. **Complete reference:** [technical/api/routes-reference.md](technical/api/routes-reference.md) - All 134 endpoints
2. **By category:** [technical/api/endpoints/](technical/api/endpoints/)
    - [authentication.md](technical/api/endpoints/authentication.md)
    - [braindumps.md](technical/api/endpoints/braindumps.md)
    - [projects.md](technical/api/endpoints/projects.md)
    - [tasks.md](technical/api/endpoints/tasks.md)
    - [calendar.md](technical/api/endpoints/calendar.md)
    - [daily-briefs.md](technical/api/endpoints/daily-briefs.md)
    - [admin.md](technical/api/endpoints/admin.md)
    - [utilities.md](technical/api/endpoints/utilities.md)

3. **API improvements:** [technical/api/API_IMPROVEMENTS_AND_OPTIMIZATIONS.md](technical/api/API_IMPROVEMENTS_AND_OPTIMIZATIONS.md)

### Task: Understanding the Database

⚠️ **Critical Gap:** Database documentation is incomplete (placeholders only)

**What exists:**

- Schema types: `/apps/web/src/lib/database.schema.ts`
- Migrations: `/apps/web/supabase/migrations/`

**What's missing (high priority):**

- [technical/database/schema.md](technical/database/schema.md) - Placeholder
- [technical/database/indexes.md](technical/database/indexes.md) - Placeholder
- [technical/database/rls-policies.md](technical/database/rls-policies.md) - Placeholder

**Workaround:** Read `database.schema.ts` directly for now

### Task: Modifying Brain Dump Processing

**This is complex - follow this order:**

1. **Understand current flow:**
    - [features/brain-dump/README.md](features/brain-dump/README.md)
    - [technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md](technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md)

2. **Check implementation status:**
    - [features/brain-dump/MULTI_BRAINDUMP_STATUS_UPDATE.md](features/brain-dump/MULTI_BRAINDUMP_STATUS_UPDATE.md)
    - [features/brain-dump/PREP_ANALYSIS_IMPLEMENTATION_SUMMARY.md](features/brain-dump/PREP_ANALYSIS_IMPLEMENTATION_SUMMARY.md)

3. **Review prompts:**
    - [prompts/brain-dump/](prompts/brain-dump/)
    - [prompts/README.md](prompts/README.md) - Navigation guide

4. **Code locations:**
    - Processor: `src/lib/utils/braindump-processor.ts`
    - Service: `src/lib/services/braindump.service.ts`
    - API: `src/routes/api/braindumps/stream/+server.ts`

5. **Test changes:**
    - [features/brain-dump/MULTI_BRAINDUMP_TESTING_GUIDE.md](features/brain-dump/MULTI_BRAINDUMP_TESTING_GUIDE.md)
    - Run: `pnpm test:llm` (costs money - uses real OpenAI API)

### Task: Working with Calendar Integration

1. **Feature overview:** [features/calendar-integration/README.md](features/calendar-integration/README.md)
2. **Architecture:** [technical/architecture/CALENDAR_SERVICE_FLOW.md](technical/architecture/CALENDAR_SERVICE_FLOW.md)
3. **Webhooks:** [technical/architecture/CALENDAR_WEBHOOK_FLOW.md](technical/architecture/CALENDAR_WEBHOOK_FLOW.md)
4. **Improvements:** [features/calendar-integration/README.md](features/calendar-integration/README.md#priority-improvements)
5. **Bug fixes:** [features/calendar-integration/PAST_TASKS_BUG_FIX.md](features/calendar-integration/PAST_TASKS_BUG_FIX.md)

---

## 📖 Complete Feature Index

### ✅ Brain Dump System (Most Comprehensive - 10 docs)

**Entry Point:** [features/brain-dump/README.md](features/brain-dump/README.md)

**Key Documents:**

- **Navigation:** [PREP_ANALYSIS_README.md](features/brain-dump/PREP_ANALYSIS_README.md) - Index for all brain dump docs
- **Architecture:** [MULTI_BRAINDUMP_REDESIGN_PLAN.md](features/brain-dump/MULTI_BRAINDUMP_REDESIGN_PLAN.md) - Concurrent processing
- **Implementation:**
    - [PHASE_1_IMPLEMENTATION.md](features/brain-dump/PHASE_1_IMPLEMENTATION.md)
    - [PHASE_2_IMPLEMENTATION.md](features/brain-dump/PHASE_2_IMPLEMENTATION.md)
    - [PREP_ANALYSIS_IMPLEMENTATION_SUMMARY.md](features/brain-dump/PREP_ANALYSIS_IMPLEMENTATION_SUMMARY.md)
- **Testing:** [MULTI_BRAINDUMP_TESTING_GUIDE.md](features/brain-dump/MULTI_BRAINDUMP_TESTING_GUIDE.md)
- **Refactoring:** [PREP_ANALYSIS_REFACTOR_PLAN.md](features/brain-dump/PREP_ANALYSIS_REFACTOR_PLAN.md)

**Features:**

- Stream-of-consciousness input
- Dual processing (context + tasks)
- Preparatory analysis (40-60% token savings)
- Concurrent processing (up to 3 simultaneous)
- Question generation and answering

**Cross-References:**

- Architecture: [technical/architecture/brain-dump-flow.md](technical/architecture/brain-dump-flow.md)
- Audit: [technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md](technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md)
- Prompts: [prompts/brain-dump/](prompts/brain-dump/)
- API: [technical/api/endpoints/braindumps.md](technical/api/endpoints/braindumps.md)
- Components: `/apps/web/src/lib/components/brain-dump/`

---

### ✅ Calendar Integration (7 docs)

**Entry Point:** [features/calendar-integration/README.md](features/calendar-integration/README.md)

**Key Documents:**

- **Improvement Plans:** README includes P1-P5 priority improvements
- **Bug Fixes:** [PAST_TASKS_BUG_FIX.md](features/calendar-integration/PAST_TASKS_BUG_FIX.md)
- **Implementation:** [calendar-ingestion-buildos-implementation.md](features/calendar-integration/calendar-ingestion-buildos-implementation.md)
- **Analysis:** [calendar-analysis-implementation-status.md](features/calendar-integration/calendar-analysis-implementation-status.md)

**Features:**

- Google Calendar OAuth
- Two-way event sync
- LLM-powered project detection
- Webhook notifications
- Per-project calendars
- Conflict detection

**Cross-References:**

- Architecture: [technical/architecture/CALENDAR_SERVICE_FLOW.md](technical/architecture/CALENDAR_SERVICE_FLOW.md)
- Webhooks: [technical/architecture/CALENDAR_WEBHOOK_FLOW.md](technical/architecture/CALENDAR_WEBHOOK_FLOW.md)
- Design: [design/calendar-per-project-architecture.md](design/calendar-per-project-architecture.md)
- Prompts: [prompts/calendar-analysis/](prompts/calendar-analysis/)
- API: [technical/api/endpoints/calendar.md](technical/api/endpoints/calendar.md)

---

### ✅ Notification System (6 docs - Excellent Docs Map)

**Entry Point:** [features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md](features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md) ⭐

**Key Documents:**

- **Navigation Guide:** [NOTIFICATION_SYSTEM_DOCS_MAP.md](features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md) (Exemplary!)
- **Spec:** [generic-stackable-notification-system-spec.md](features/notifications/generic-stackable-notification-system-spec.md) - 1,729 lines
- **Implementation:** [NOTIFICATION_SYSTEM_IMPLEMENTATION.md](features/notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md)
- **QA:** [PHASE_3_MANUAL_QA_CHECKLIST.md](features/notifications/PHASE_3_MANUAL_QA_CHECKLIST.md)
- **Bug Fixes:** [URGENT_NOTIFICATION_BUG.md](features/notifications/URGENT_NOTIFICATION_BUG.md)

**Features:**

- Generic stackable notification system
- Multiple concurrent notifications
- Minimized vs expanded states
- Modal coordination
- Progress tracking (streaming, step-based, binary)
- Svelte 5 Map reactivity patterns

**Implementation Status:**

- Phase 1 (Core): ✅ Complete
- Phase 2 (Brain Dump): ✅ Complete
- Phase 3 (Phase Generation): ✅ Complete
- Phase 4 (Calendar): ⏳ Pending
- Phase 5 (Polish): ⏳ Pending

**Cross-References:**

- Components: `/apps/web/src/lib/components/notifications/`
- Store: `/apps/web/src/lib/stores/notification.store.ts`

---

### ✅ Admin Dashboard (1 doc)

**Entry Point:** [features/admin-dashboard/README.md](features/admin-dashboard/README.md)

**Features:**

- LLM usage tracking
- Cost analytics
- Real-time metrics
- Model/operation breakdowns
- User cost analytics
- Performance monitoring

**Cross-References:**

- Service: [technical/services/LLM_USAGE_IMPLEMENTATION_SUMMARY.md](technical/services/LLM_USAGE_IMPLEMENTATION_SUMMARY.md)
- API: [technical/api/endpoints/admin.md](technical/api/endpoints/admin.md)

---

### ✅ Onboarding & Onboarding V2 (4 docs total)

**Entry Points:**

- [features/onboarding/README.md](features/onboarding/README.md)
- [features/onboarding-v2/README.md](features/onboarding-v2/README.md)

**Onboarding V1:**

- [build-os-onboarding-revamp.md](features/onboarding/build-os-onboarding-revamp.md) - Flow design
- [ONBOARDING_ASSETS_CHECKLIST.md](features/onboarding/ONBOARDING_ASSETS_CHECKLIST.md) - Asset requirements

**Onboarding V2:**

- Complete implementation guide in single document
- 6-step guided flow with auto-accept
- SMS verification (Twilio)
- Email daily brief opt-in
- User archetype selection
- Feature flag: `?v2=true`

**Note:** Relationship between V1 and V2 unclear - may need consolidation

---

### ⚠️ Dashboard (Empty Directory)

**Status:** No documentation exists
**Action Needed:** Document feature or remove directory

---

## 🔧 Complete Technical Documentation Index

### Architecture (11 docs)

**Entry Point:** [technical/architecture/README.md](technical/architecture/README.md)

**Core:**

- [BUILD_OS_MASTER_CONTEXT.md](technical/architecture/BUILD_OS_MASTER_CONTEXT.md) - Complete system overview ⭐
- [brain-dump-flow.md](technical/architecture/brain-dump-flow.md) - Placeholder (see audit)
- [ai-pipeline.md](technical/architecture/ai-pipeline.md) - Placeholder
- [supabase-design.md](technical/architecture/supabase-design.md) - Placeholder
- [calendar-sync.md](technical/architecture/calendar-sync.md) - Placeholder

**Specialized:**

- [CALENDAR_SERVICE_FLOW.md](technical/architecture/CALENDAR_SERVICE_FLOW.md)
- [CALENDAR_WEBHOOK_FLOW.md](technical/architecture/CALENDAR_WEBHOOK_FLOW.md)
- [email-system.md](technical/architecture/email-system.md)
- [system-checkpoint.md](technical/architecture/system-checkpoint.md)
- [SCALABILITY_ANALYSIS.md](technical/architecture/SCALABILITY_ANALYSIS.md)

**Note:** Several placeholder files reference content to be migrated from other docs.

---

### API (14 docs - 134 endpoints documented)

**Entry Point:** [technical/api/README.md](technical/api/README.md)

**Complete Reference:**

- [routes-reference.md](technical/api/routes-reference.md) - All 134 endpoints (auto-generated) ⭐

**Endpoints by Category:** [technical/api/endpoints/](technical/api/endpoints/)

- [authentication.md](technical/api/endpoints/authentication.md)
- [braindumps.md](technical/api/endpoints/braindumps.md) - 9 endpoints with enriched types
- [projects.md](technical/api/endpoints/projects.md)
- [tasks.md](technical/api/endpoints/tasks.md)
- [calendar.md](technical/api/endpoints/calendar.md)
- [daily-briefs.md](technical/api/endpoints/daily-briefs.md)
- [admin.md](technical/api/endpoints/admin.md)
- [utilities.md](technical/api/endpoints/utilities.md)

**Supporting Docs:**

- [summary.md](technical/api/summary.md)
- [types.md](technical/api/types.md)
- [templates.md](technical/api/templates.md)
- [API_IMPROVEMENTS_AND_OPTIMIZATIONS.md](technical/api/API_IMPROVEMENTS_AND_OPTIMIZATIONS.md)
- [COMPRESSION_IMPLEMENTATION.md](technical/api/COMPRESSION_IMPLEMENTATION.md)
- [COMPRESSION_SUMMARY.md](technical/api/COMPRESSION_SUMMARY.md)

---

### Database (3 docs - ⚠️ ALL PLACEHOLDERS)

**Critical Gap:** No actual database documentation exists

**Placeholder Files:**

- [schema.md](technical/database/schema.md) - Should be generated from `database.schema.ts`
- [indexes.md](technical/database/indexes.md) - Performance indexes not documented
- [rls-policies.md](technical/database/rls-policies.md) - Security policies not documented

**Workarounds:**

- Read: `/apps/web/src/lib/database.schema.ts` for schema
- Check: `/apps/web/supabase/migrations/` for DDL

**High Priority Action:** Generate and maintain these docs

---

### Services (8 docs)

**Entry Point:** [technical/services/README.md](technical/services/README.md)

**Documented:**

- [LLM_USAGE_TRACKING.md](technical/services/LLM_USAGE_TRACKING.md) - Complete
- [LLM_USAGE_IMPLEMENTATION_SUMMARY.md](technical/services/LLM_USAGE_IMPLEMENTATION_SUMMARY.md) - Complete

**Placeholders:**

- [brain-dump-service.md](technical/services/brain-dump-service.md)
- [project-service.md](technical/services/project-service.md)
- [calendar-service.md](technical/services/calendar-service.md)
- [prompt-service.md](technical/services/prompt-service.md)

**Service Patterns:**

- Base service architecture
- API service patterns
- Real-time subscriptions
- Error handling
- Caching strategies

---

### Components & Design System (7 docs)

**Entry Points:**

- [technical/components/DESIGN_SYSTEM_GUIDE.md](technical/components/DESIGN_SYSTEM_GUIDE.md) - 558 lines ⭐
- [technical/components/BUILDOS_STYLE_GUIDE.md](technical/components/BUILDOS_STYLE_GUIDE.md)

**Standards:**

- [MODAL_STANDARDS.md](technical/components/MODAL_STANDARDS.md) - 303 lines, comprehensive

**Feature-Specific:**

- [brain-dump/BRAIN_DUMP_UNIFIED_STORE_ARCHITECTURE.md](technical/components/brain-dump/BRAIN_DUMP_UNIFIED_STORE_ARCHITECTURE.md)
- [brain-dump/BRAIN_DUMP_AUTO_ACCEPT_SIMPLE.md](technical/components/brain-dump/BRAIN_DUMP_AUTO_ACCEPT_SIMPLE.md)
- [brain-dump/SHORT_BRAINDUMP_QUESTION_GENERATION_FIX.md](technical/components/brain-dump/SHORT_BRAINDUMP_QUESTION_GENERATION_FIX.md)
- [projects/PROJECT_PAGE_COMPONENT_PATTERNS.md](technical/components/projects/PROJECT_PAGE_COMPONENT_PATTERNS.md)
- [projects/GOOGLE_CALENDARS_FOR_PROJECTS.md](technical/components/projects/GOOGLE_CALENDARS_FOR_PROJECTS.md)

**Design System Coverage:**

- Color system (semantic mappings, dark mode)
- Typography and spacing
- Component patterns (cards, buttons, forms, modals)
- Animations and transitions
- Accessibility guidelines
- Mobile-first responsive design

---

### Testing (4 docs)

**Documents:**

- [strategy.md](technical/testing/strategy.md) - Placeholder
- [vitest-setup.md](technical/testing/vitest-setup.md)
- [llm-testing.md](technical/testing/llm-testing.md)
- [TESTING_CHECKLIST.md](technical/testing/TESTING_CHECKLIST.md)

**Better Resource:** See [development/TESTING_CHECKLIST.md](development/TESTING_CHECKLIST.md) for complete procedures

---

### Deployment (12 docs - Excellent Runbooks)

**Entry Points:**

- [technical/deployment/DEPLOYMENT_CHECKLIST.md](technical/deployment/DEPLOYMENT_CHECKLIST.md) - 388 lines ⭐
- [technical/deployment/VERCEL_DEPLOYMENT.md](technical/deployment/VERCEL_DEPLOYMENT.md)
- [technical/deployment/BUILD.md](technical/deployment/BUILD.md)

**Runbooks:** [technical/deployment/runbooks/](technical/deployment/runbooks/)

1. [incident-response.md](technical/deployment/runbooks/incident-response.md)
2. [database-recovery.md](technical/deployment/runbooks/database-recovery.md)
3. [supabase-recovery.md](technical/deployment/runbooks/supabase-recovery.md)
4. [supabase-connection-recovery.md](technical/deployment/runbooks/supabase-connection-recovery.md)
5. [calendar-webhook-failures.md](technical/deployment/runbooks/calendar-webhook-failures.md)
6. [stripe-webhook-failures.md](technical/deployment/runbooks/stripe-webhook-failures.md)
7. [stripe-webhook-validation.md](technical/deployment/runbooks/stripe-webhook-validation.md)
8. [openai-rate-limiting.md](technical/deployment/runbooks/openai-rate-limiting.md)
9. [performance-issues.md](technical/deployment/runbooks/performance-issues.md)

---

### Development Patterns (10 docs)

**Core Guides:**

- [getting-started.md](technical/development/getting-started.md) - Placeholder
- [svelte5-runes.md](technical/development/svelte5-runes.md) - Svelte 5 patterns
- [sveltekit-patterns.md](technical/development/sveltekit-patterns.md) - SvelteKit best practices
- [DEVELOPMENT_PROCESS.md](technical/development/DEVELOPMENT_PROCESS.md)
- [GIT_WORKFLOW.md](technical/development/GIT_WORKFLOW.md)

**Performance:**

- [PERFORMANCE_ISSUES_FOUND.md](technical/development/PERFORMANCE_ISSUES_FOUND.md)
- [PERFORMANCE_FIXES_APPLIED.md](technical/development/PERFORMANCE_FIXES_APPLIED.md)

**View Transitions:**

- [VIEW_TRANSITION_DEBUG_GUIDE.md](technical/development/VIEW_TRANSITION_DEBUG_GUIDE.md)
- [VIEW_TRANSITION_FIX.md](technical/development/VIEW_TRANSITION_FIX.md)
- [VIEW_TRANSITION_TEST.md](technical/development/VIEW_TRANSITION_TEST.md)

---

### Integrations (3 docs - Stripe only)

**Stripe Integration (Complete):**

- [STRIPE_IMPLEMENTATION_SUMMARY.md](technical/integrations/STRIPE_IMPLEMENTATION_SUMMARY.md) - Status: 4/8 complete
- [stripe-integration-overview.md](technical/integrations/stripe-integration-overview.md) - Business overview
- [stripe-setup.md](technical/integrations/stripe-setup.md) - Developer setup

**Also see:** [integrations/](integrations/) directory with 5 Stripe docs

**Missing Integrations:**

- Google Calendar setup
- Google OAuth configuration
- OpenAI API integration
- Twilio/SMS integration

---

### Audits & Performance (2 docs)

**Audits:**

- [technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md](technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md) - Comprehensive brain dump analysis

**Performance:**

- [technical/performance/projects-route-optimization-report.md](technical/performance/projects-route-optimization-report.md)

---

## 🎨 Design Documentation Index

**Complete Design System:**

- [design/design-system.md](design/design-system.md) - 558 lines, v1.1.0 ⭐

**Component Standards:**

- [design/components/modal-standards.md](design/components/modal-standards.md)

**Design Principles:**

- [design/design-principles-checklist.md](design/design-principles-checklist.md)

**Feature Specs:**

- [design/brain-dump-question-fix.md](design/brain-dump-question-fix.md)
- [design/calendar-per-project-architecture.md](design/calendar-per-project-architecture.md)
- [design/calendar-webhook-integration.md](design/calendar-webhook-integration.md)
- [design/email-flow-spec.md](design/email-flow-spec.md)

**Component Patterns:**

- [design/project-page-patterns.md](design/project-page-patterns.md)

**AI/Context Framework:**

- [design/context-framework-philosophy.md](design/context-framework-philosophy.md)
- [design/universal-project-context-format.md](design/universal-project-context-format.md)

**Code Architecture:**

- [design/prompt-template-refactoring-plan.md](design/prompt-template-refactoring-plan.md)

---

## 🤖 AI/LLM Prompts Index

**Navigation Guide:** [prompts/README.md](prompts/README.md) ⭐
**Architecture:** [prompts/PROMPT_ARCHITECTURE.md](prompts/PROMPT_ARCHITECTURE.md)

**Prompt Categories:**

### Brain Dump Prompts (28 files)

**New Project Flows:**

- Singular: [brain-dump/new-project/singular/](prompts/brain-dump/new-project/singular/)
- Dual Processing:
    - Context: [brain-dump/new-project/dual-processing/context/](prompts/brain-dump/new-project/dual-processing/context/)
    - Tasks: [brain-dump/new-project/dual-processing/tasks/](prompts/brain-dump/new-project/dual-processing/tasks/)
- Short: [brain-dump/new-project/new-project-short-braindump-prompt.md](prompts/brain-dump/new-project/new-project-short-braindump-prompt.md)

**Existing Project Flows:**

- Dual Processing:
    - Context: [brain-dump/existing-project/dual-processing/context/](prompts/brain-dump/existing-project/dual-processing/context/)
    - Tasks: [brain-dump/existing-project/dual-processing/tasks/](prompts/brain-dump/existing-project/dual-processing/tasks/)
- Short:
    - Context: [brain-dump/existing-project/short-braindump/context/](prompts/brain-dump/existing-project/short-braindump/context/)
    - Tasks: [brain-dump/existing-project/short-braindump/tasks/](prompts/brain-dump/existing-project/short-braindump/tasks/)

**Prompt Components:**

- [components/integrated-questions-prompt.md](prompts/components/integrated-questions-prompt.md)

### Other Prompts

**Calendar Analysis:**

- [calendar-analysis/calendar-analysis-prompt.md](prompts/calendar-analysis/calendar-analysis-prompt.md)

**Task Synthesis:**

- [task-synthesis/task-synthesis-reorganization.md](prompts/task-synthesis/task-synthesis-reorganization.md)

**Image Design:**

- [image-design-prompts.md](prompts/image-design-prompts.md) - Reference material

---

## 🚀 Development Workflow

### Essential Commands

```bash
# Development
pnpm dev               # Standard dev server
pnpm dev:split         # Dev with type checking in parallel (recommended)
pnpm dev:fast          # Quick dev without type checking

# Testing
pnpm test              # Unit tests
pnpm test:watch        # Watch mode
pnpm test:llm          # LLM prompt tests (costs money - uses OpenAI API)

# Code Quality
pnpm typecheck         # Type checking
pnpm lint              # Lint code
pnpm lint:fix          # Auto-fix linting issues

# Building
pnpm build             # Production build
```

### Git Workflow

See: [development/GIT_WORKFLOW.md](development/GIT_WORKFLOW.md)

**Branch Naming:**

- `feature/feature-name`
- `fix/bug-name`
- `refactor/scope-name`
- `docs/update-name`

**Commit Attribution:**

```
feat: add new feature

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

### Testing Workflow

See: [development/TESTING_CHECKLIST.md](development/TESTING_CHECKLIST.md)

**Quality Gates:**

- Pre-commit: `pnpm lint:fix`
- Pre-push: `pnpm typecheck && pnpm test:run`
- Pre-release: Full test suite + LLM tests

---

## ⚠️ Known Gaps & Priorities

### Critical Gaps (High Priority)

1. **Database Documentation** - All 3 files are placeholders:
    - [technical/database/schema.md](technical/database/schema.md)
    - [technical/database/indexes.md](technical/database/indexes.md)
    - [technical/database/rls-policies.md](technical/database/rls-policies.md)

2. **Service Documentation** - 4 of 6 core services undocumented:
    - [technical/services/brain-dump-service.md](technical/services/brain-dump-service.md)
    - [technical/services/project-service.md](technical/services/project-service.md)
    - [technical/services/calendar-service.md](technical/services/calendar-service.md)
    - [technical/services/prompt-service.md](technical/services/prompt-service.md)

3. **Architecture Placeholders:**
    - [technical/architecture/brain-dump-flow.md](technical/architecture/brain-dump-flow.md)
    - [technical/architecture/ai-pipeline.md](technical/architecture/ai-pipeline.md)
    - [technical/architecture/supabase-design.md](technical/architecture/supabase-design.md)
    - [technical/architecture/calendar-sync.md](technical/architecture/calendar-sync.md)

4. **Testing Strategy:**
    - [technical/testing/strategy.md](technical/testing/strategy.md) - Placeholder

5. **Getting Started Guide:**
    - [technical/development/getting-started.md](technical/development/getting-started.md) - Placeholder

### Medium Priority Gaps

6. **Integration Documentation** - Only Stripe documented:
    - Missing: Google Calendar setup
    - Missing: Google OAuth configuration
    - Missing: OpenAI API integration patterns
    - Missing: Twilio/SMS integration

7. **Dashboard Feature:**
    - `/features/dashboard/` - Empty directory (document or remove)

8. **Onboarding Consolidation:**
    - Unclear relationship between `/onboarding/` and `/onboarding-v2/`

### Low Priority Improvements

9. **Consolidate Performance Docs:**
    - Scattered across `/technical/development/` and `/technical/performance/`

10. **Add More Audits:**
    - Only brain dump has comprehensive audit
    - Consider: Calendar, Notifications, Admin Dashboard

---

## 📦 Archived & Historical Content

**Location:** Root-level meta-documents (not in subdirectories)

**These are HISTORICAL and should NOT be used as current guidance:**

1. `ARCHITECTURE_REORGANIZATION_PLAN.md` - Aspirational plan from Sept 2025, never fully implemented
2. `DOCUMENTATION_MIGRATION_PLAN.md` - Stalled migration plan from Sept 2025
3. `DOCUMENTATION_SYSTEM.md` - Fantasy auto-generation system that was never built
4. `INDEX-GAPS.md` - Outdated gaps analysis from Jan 2025
5. `OUTDATED_FILES_TO_REMOVE.md` - Completed cleanup from Sept 2025

**Recommendation:** Move to `/apps/web/docs/archive/` directory

---

## 🔍 How to Find What You Need

### Search Strategy

1. **By Feature Name:** Check [Feature Index](#complete-feature-index)
2. **By Technical Area:** Check [Technical Documentation Index](#complete-technical-documentation-index)
3. **By Task:** Check [Common Tasks](#common-tasks)
4. **By Role:** Check [Quick Navigation by Role](#quick-navigation-by-role)

### Documentation Principles

**Well-Documented Features** (use as examples):

- **Notifications:** [NOTIFICATION_SYSTEM_DOCS_MAP.md](features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md) - Excellent navigation
- **Brain Dump:** [PREP_ANALYSIS_README.md](features/brain-dump/PREP_ANALYSIS_README.md) - Good index
- **Design System:** [design-system.md](design/design-system.md) - Comprehensive

**When Documentation is Missing:**

1. Check source code directly
2. Look for related audit documents
3. Check git history for removed docs
4. Ask team or create new documentation

---

## 🔗 Related Documentation

**Monorepo-Wide Documentation:**

- `/docs/README.md` - Main documentation hub
- `/docs/DEPLOYMENT_TOPOLOGY.md` - System deployment architecture
- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - Web-Worker communication
- `/docs/TASK_INDEX.md` - Task-based navigation
- `/CLAUDE.md` - Monorepo development guide

**Worker Service Documentation:**

- `/apps/worker/docs/` - Worker service docs
- `/apps/worker/CLAUDE.md` - Worker development guide

**Package Documentation:**

- `/packages/shared-types/` - Shared TypeScript types
- `/packages/supabase-client/` - Database client
- `/packages/twilio-service/` - SMS service

---

## 📝 Maintaining This Guide

**When to Update:**

- New feature added → Update [Feature Index](#complete-feature-index)
- New documentation created → Update relevant section
- Documentation gap filled → Update [Known Gaps](#known-gaps-priorities)
- Major refactor → Update cross-references

**Ownership:**
This guide should be updated by anyone who adds significant documentation.

**Last Updated:** 2025-10-06
**Maintained By:** Development Team
**Next Review:** When new major feature is added

---

**Need Help?** Start with [README.md](README.md) for a quick overview, then use this guide to navigate to specific documentation.
