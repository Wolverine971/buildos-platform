# Documentation Migration Plan

> Detailed plan for migrating BuildOS documentation to the new structure
> Created: September 26, 2025
> Status: IN PROGRESS

## ✅ Phase 1: Structure Creation (COMPLETED)

The new directory structure has been created according to ARCHITECTURE_REORGANIZATION_PLAN.md:

```
/docs/
├── 📚 technical/                    # Technical Documentation ✅
│   ├── architecture/                # System Architecture ✅
│   │   └── decisions/              # ADRs ✅
│   ├── api/                        # API Documentation ✅
│   │   └── endpoints/              # Endpoint docs ✅
│   ├── database/                   # Database Documentation ✅
│   │   └── migrations/            # Migration docs ✅
│   ├── services/                   # Service Layer ✅
│   ├── components/                 # Component Documentation ✅
│   │   ├── brain-dump/            # Brain dump components ✅
│   │   └── projects/              # Project components ✅
│   ├── testing/                    # Testing Documentation ✅
│   ├── deployment/                 # Production & DevOps ✅
│   │   └── runbooks/              # Operational procedures ✅
│   └── development/                # Developer Guide ✅
│       └── scripts/               # NPM script docs ✅
├── 💼 business/                     # Business Documentation ✅
├── 👤 user-guide/                   # End User Documentation ✅
│   └── features/                   # Feature guides ✅
└── 📝 prompts/                      # AI Prompt Templates (existing)
```

## 📋 Phase 2: Content Migration (TODO)

### Priority 1: Core Technical Documentation

#### 1. Architecture Migration

**Source → Destination:**

- `docs/architecture/BUILD_OS_MASTER_CONTEXT.md` → `docs/technical/architecture/overview.md`
- `docs/architecture/CALENDAR_SERVICE_FLOW.md` → `docs/technical/architecture/calendar-sync.md`
- `docs/architecture/CALENDAR_WEBHOOK_FLOW.md` → `docs/technical/architecture/calendar-sync.md` (merge)
- `docs/architecture/SCALABILITY_ANALYSIS.md` → `docs/technical/architecture/scalability.md`
- `docs/architecture/email-system.md` → `docs/technical/architecture/email-system.md`

#### 2. Brain Dump Consolidation

**Multiple sources → 2 comprehensive docs:**

Target: `docs/technical/architecture/brain-dump-flow.md`

- Merge from: `audits/BRAINDUMP_FLOW_AUDIT_2025.md` (primary)
- Include: `design/BRAIN_DUMP_AUTO_ACCEPT_SIMPLE.md`
- Include: `design/BRAIN_DUMP_UNIFIED_STORE_ARCHITECTURE.md`
- Include: `design/SHORT_BRAINDUMP_QUESTION_GENERATION_FIX.md`

Target: `docs/technical/services/brain-dump-service.md`

- Extract implementation from: `development/braindump-refactor-2025.md`
- Include service patterns from: brain dump processing files
- Document API contracts and data flow

### Priority 2: API & Database Documentation

#### 3. API Documentation Generation

- Run: `pnpm run gen:route-docs` (create script first)
- Generate from: `/src/routes/api/`
- Output to: `docs/technical/api/routes-reference.md`
- Create endpoint-specific docs in: `docs/technical/api/endpoints/`

#### 4. Database Documentation

- Run: `pnpm run gen:schema`
- Source: `src/lib/database.schema.ts`
- Output to: `docs/technical/database/schema.md`
- Document RLS policies in: `docs/technical/database/rls-policies.md`

### Priority 3: Operational Documentation

#### 5. Critical Runbooks

Create in `docs/technical/deployment/runbooks/`:

1. **supabase-recovery.md**
    - Connection pool exhaustion
    - Authentication failures
    - Real-time subscription issues

2. **openai-rate-limiting.md**
    - Rate limit detection
    - Fallback strategies
    - Queue management

3. **calendar-webhook-failures.md**
    - Webhook validation
    - Event replay
    - Sync recovery

4. **stripe-webhook-validation.md**
    - Signature validation failures
    - Event replay
    - Payment recovery

5. **incident-response.md**
    - Incident classification
    - Escalation procedures
    - Post-mortem template

### Priority 4: User Documentation

#### 6. User Guides

Create in `docs/user-guide/`:

- **getting-started.md**: First-time user onboarding
- **faq.md**: Extract from support tickets and user feedback
- **troubleshooting.md**: Common issues and solutions

#### 7. Feature Guides

Create in `docs/user-guide/features/`:

- **brain-dump.md**: How to effectively brain dump
- **projects.md**: Managing projects and phases
- **calendar-sync.md**: Setting up Google Calendar
- **daily-briefs.md**: Configuring daily emails

### Priority 5: Development Documentation

#### 8. Architecture Decision Records

Create in `docs/technical/architecture/decisions/`:

- **ADR-001-supabase.md**: Why Supabase over alternatives
- **ADR-002-dual-processing.md**: Brain dump processing architecture
- **ADR-003-project-calendars.md**: Per-project calendar design

#### 9. Development Guides

- **sveltekit-patterns.md**: BuildOS-specific patterns
- **svelte5-runes.md**: Using $state, $derived, $effect
- **testing-strategy.md**: Unit, integration, and LLM testing

## 🗑️ Phase 3: Cleanup (TODO)

### Archive Branch Merge

The `archive/marketing-docs` branch contains:

- 40+ investor/VC files moved to `/archive/`
- Outdated brain dump docs
- Date-stamped development files

**Action:** Merge branch to remove clutter from main

### Files to Delete After Migration

- Redundant brain dump documentation (after consolidation)
- Old development plans (after implementation)
- Outdated audits (move to archive)

## 📊 Migration Metrics

### Current Status

- ✅ Directory structure: 100% complete
- ⏳ Placeholder files: 100% complete
- ⏳ Content migration: 0% complete
- ⏳ Archive cleanup: Branch created, not merged

### Target Completion

- Week 1: Core technical docs (Priority 1-2)
- Week 2: Operational docs (Priority 3)
- Week 3: User documentation (Priority 4)
- Week 4: Development guides and cleanup (Priority 5 + Phase 3)

## 🔧 Automation Setup

### Required Scripts to Create

1. **generate-route-docs.ts**
    - Already created in `/scripts/`
    - Needs integration with package.json

2. **watch-schema.ts**
    - Monitor database.schema.ts changes
    - Auto-regenerate documentation

3. **GitHub Actions Workflow**
    - `.github/workflows/docs.yml`
    - Auto-generate on push to main

## 📝 Next Immediate Actions

1. Start with brain dump consolidation (highest value)
2. Run API documentation generation
3. Create the 5 critical runbooks
4. Merge archive branch to clean up
5. Update start-here.md with new paths

## 🚨 Important Notes

- **DO NOT DELETE** original files until migration is verified
- **TEST** all documentation links after migration
- **UPDATE** all references in code comments and README files
- **COMMUNICATE** changes to team before merging

This plan ensures systematic migration while maintaining documentation availability throughout the transition.
