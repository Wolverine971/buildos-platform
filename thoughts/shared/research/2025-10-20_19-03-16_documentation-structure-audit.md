<!-- thoughts/shared/research/2025-10-20_19-03-16_documentation-structure-audit.md -->
# BuildOS Platform Documentation Structure - Complete Audit

**Date:** 2025-10-20

## Quick Stats

- **Total Markdown Files:** ~654 files
- **Monorepo-level docs:** 312 files
- **Web app docs:** 180 files
- **Research/thoughts:** 156 files
- **Scattered root files:** 6 files

---

## Scattered Root-Level Files (NEEDS ACTION)

```
/Users/annawayne/buildos-platform/
├── CLAUDE.md                                    ✓ Project instructions
├── README.md                                    ✓ Repo README
├── CORE_COLUMNS_AUDIT.md                        ⚠ MOVE to /apps/web/docs/features/
├── CORE_COLUMNS_IMPLEMENTATION_SUMMARY.md       ⚠ MOVE to /apps/web/docs/features/
├── NOTIFICATION_LOGGING_IMPLEMENTATION_COMPLETE.md    ⚠ MOVE to /apps/web/docs/features/notifications/
├── NOTIFICATION_PREFERENCES_REFACTOR_COMPLETE.md     ⚠ MOVE to /apps/web/docs/features/notifications/
```

---

## Monorepo-Level Documentation: `/docs` (312 files)

### Root Level (16 files)

```
/docs/
├── README.md                          [INDEX]
├── TASK_INDEX.md                      [Navigation by task]
├── MONOREPO_GUIDE.md                  [Workflows]
├── DOCUMENTATION_GUIDELINES.md        [Standards]
├── DEPLOYMENT_TOPOLOGY.md             [Architecture]
├── DEPLOYMENT.md
├── ENVIRONMENT_VARIABLES.md
├── MIGRATION_PLAN.md
├── BUGFIX_CHANGELOG.md
├── WORKER_AUDIT_FIXES_VERIFICATION.md
├── WORKER_QUEUE_FIXES.md
├── WORKER_QUEUE_ISSUES_AUDIT.md
├── SVELTE5_AUDIT_FINDINGS.md
├── SVELTE5_AUDIT_FOLLOWUP_CRITICAL_ISSUES.md
├── SVELTE5_QUICK_FIX_GUIDE.md
└── SVELTE5_SENIOR_REVIEW_ASSESSMENT.md
```

### `/architecture` (12 files)

```
/docs/architecture/
├── README.md                                    [INDEX]
├── EXTENSIBLE-NOTIFICATION-SYSTEM-DESIGN.md
├── NOTIFICATION_SYSTEM_PHASE1_IMPLEMENTATION.md
├── NOTIFICATION_TRACKING_SYSTEM.md
├── SMS_NOTIFICATION_CHANNEL_DESIGN.md
├── AGENTIC_WORKFLOW_DESIGN_CONTEXT.md          [NEW]
├── BRAIN_DUMP_STREAM_API_EXPLORATION.md        [NEW]
├── BRAIN_DUMP_STREAM_API_QUICK_REFERENCE.md    [NEW]
├── /decisions/
│   ├── ADR-001-user-level-notification-preferences.md
│   └── ADR-002-timezone-centralization.md
└── /diagrams/
    ├── README.md                              [INDEX]
    ├── WEB-WORKER-ARCHITECTURE.md             [KEY DIAGRAM]
    ├── QUEUE-SYSTEM-FLOW.md
    └── README.md
```

### `/business` (21 files)

```
/docs/business/
├── README.md                          [INDEX]
├── PITCH_DECK_COMPREHENSIVE_2025.md   [CEO/Investor]
├── comms-guide.md
├── buildos-comms-guide-lulu.md
├── buildos-comms-guide-advanced-lulu.md
├── buildos-copy-examples-lulu.md
├── buildos-pitch-deck-renaissance-rewrite.md
├── pitch-deck-original.md
├── info.md
├── /strategy/
│   ├── master-seed.md
│   ├── masterplan-notes.md
│   ├── ceo-training-plan.md
│   ├── features-notes.md
│   └── market-context.md
└── /war-room/
    ├── war-room-design-doc.md
    ├── war-room-executive-brief.md
    ├── war-room-learnings.md
    ├── war-room-llm-prompting-strategy.md
    ├── war-room-original-spec.md
    └── war-room-positioning.md
```

### `/marketing` (77 files) - ⚠ VERY LARGE, BUSINESS-FOCUSED

```
/docs/marketing/
├── INDEX.md
├── customer-language-decoder.md
├── customer-lingo-adhd.md
├── customer-lingo-writer.md
├── /brand/ (8 files)
│   ├── brand-guide-1-pager.md
│   ├── brand-personality.md
│   ├── buildos-brand-personality-profile.md
│   ├── communication-guide.md
│   ├── brand-activating-planner.md
│   ├── brand-building-worksheet.md
│   ├── brand-evolution-roadmap-worksheet.md
│   └── personal-brand-questionnaire.md
├── /growth/
│   ├── viral-plan-notes.md
│   ├── 3-phase-warm-outreach-template.md
│   └── /target-influencers/
│       ├── patrick-bet-david.md
│       ├── tim-ferris.md
│       └── viral-plan.md
├── /investors/ (6 files + sub-folders)
│   ├── buildos-fundraising-strategy.md
│   ├── VC-notes.md
│   ├── fundraising-preparedness-checklist.md
│   ├── fundraising-preparedness-checklist-part-2.md
│   ├── investor-optimists.md
│   ├── investor-skeptics.md
│   ├── /profiles/ (8 profiles of VCs/investors)
│   ├── /vc-firms/ (24 VC firm profiles)
│   ├── /outreach/ (4 research docs)
│   └── /warm-intro-emails/ (7 email templates)
├── /social-media/ (11 files)
│   ├── twitter-strategy.md
│   ├── twitter-context-engineering-strategy.md
│   ├── linkedin-strategy-notes.md
│   ├── instagram-strategy.md
│   ├── twitter-notes.md
│   ├── twitter-strategy-worksheet.md
│   ├── content-template-hot-take.md
│   ├── content-template-educational-content.md
│   ├── types-of-content.md
│   ├── viral-short-form-video-strategy.md
│   └── viral-short-form-video-suggestions-perplexity.md
└── /user-segments/ (4 files)
    ├── user-persona-aquisition-strategy.md
    ├── users-adhd.md
    ├── users-professionals.md
    └── users-students.md
```

### `/features` (18 files)

```
/docs/features/
└── /sms-event-scheduling/ (18 files)
    ├── README.md                      [INDEX]
    ├── IMPLEMENTATION_STATUS.md
    ├── PHASE_2_SUMMARY.md
    ├── PHASE_3_SUMMARY.md
    ├── PHASE_4_SUMMARY.md
    ├── PHASE_5_SUMMARY.md
    ├── PHASE_6_PLAN.md
    ├── PHASE_6_PART_2_SUMMARY.md
    ├── PHASE_6_TESTING_SUMMARY.md
    ├── MONITORING_GUIDE.md
    ├── MONITORING_DASHBOARD.md
    └── /research/ (7 files)
        ├── README.md
        ├── calendar-integration.md
        ├── database-schema.md
        ├── daily-brief-scheduling-patterns.md
        ├── llm-integration-patterns.md
        ├── sms-infrastructure.md
        └── worker-web-communication.md
```

### `/testing` (5 files)

```
/docs/testing/
├── README.md                          [INDEX]
├── COVERAGE_MATRIX.md
├── WEB_APP_COVERAGE.md
├── SMS_NOTIFICATION_TESTING_GUIDE.md
└── daily-brief-notification-refactor-tests.md
```

### `/user-guide` (8 files)

```
/docs/user-guide/
├── README.md                          [INDEX]
├── getting-started.md
├── faq.md
├── troubleshooting.md
└── /features/ (4 files)
    ├── brain-dump.md
    ├── calendar-sync.md
    ├── daily-briefs.md
    └── projects.md
```

### `/integrations`

```
/docs/integrations/
├── /twilio/
│   └── README.md                      [SMS service docs]
├── /stripe/                            [EMPTY]
└── /supabase/                          [EMPTY]
```

### `/operations`

```
/docs/operations/
├── /environment/
│   └── DEPLOYMENT_ENV_CHECKLIST.md
├── /ci-cd/                            [EMPTY]
└── /monitoring/                        [EMPTY]
```

### `/archive` (11 files)

```
/docs/archive/
├── README.md
├── /brain-dump-docs/ (8 old docs)
│   ├── brain-dump-collapsible-notification-implementation.md
│   ├── braindump-calendar-sync-research.md
│   ├── braindump-deletion-feature-plan.md
│   ├── braindump-refactor-2025.md
│   ├── existing-project-long-braindump.md
│   ├── existing-project-short-braindump.md
│   ├── new-project-long-braindump.md
│   └── new-project-short-braindump.md
└── /outdated-development/ (2 files)
    ├── 2025-01-07_brain-dump-flow-analysis.md
    └── 2025-01-08_google_calendars_for_projects.md
```

### Other directories

```
/docs/
├── /blogs/ (4 files) - Blog post content
├── /audits/ (3 files) - Worker audits
├── /guides/ (2 files) - SMS guides
├── /philosophy/ (2 files) - Product philosophy
├── /api/ (1 file)
└── /writing/ (1 file)
```

---

## Web App Documentation: `/apps/web/docs` (180 files)

### Root Level (6 files)

```
/apps/web/docs/
├── README.md                          [INDEX & START HERE]
├── START-HERE.md                      [Entry point]
├── DOCUMENTATION_SYSTEM.md
├── DOCUMENTATION_MIGRATION_PLAN.md
├── ARCHITECTURE_REORGANIZATION_PLAN.md
└── INDEX-GAPS.md
```

### `/design` (11 files)

```
/apps/web/docs/design/
├── design-principles-checklist.md
├── design-system.md
├── email-flow-spec.md
├── project-page-patterns.md
├── brain-dump-question-fix.md
├── calendar-per-project-architecture.md
├── calendar-webhook-integration.md
├── context-framework-philosophy.md
├── prompt-template-refactoring-plan.md
├── universal-project-context-format.md
└── /components/
    └── modal-standards.md
```

### `/development` (11 files)

```
/apps/web/docs/development/
├── README.md                          [INDEX]
├── DEVELOPMENT_PROCESS.md
├── GIT_WORKFLOW.md
├── TESTING_CHECKLIST.md
├── dev_docs.md
├── RECURRING_TASKS_USER_GUIDE.md
├── user-interview-questions.md
├── zero-layout-shift-implementation.md
├── svelte-5-loop-fix-assessment.md
├── ollamaBackgroundScript.md
├── phase-intelligent-scheduling-plan.md
├── /plans/ (2 files)
│   ├── SYNTHESIS_IMPROVEMENT_PLAN.md
│   └── simplified-dashboard-onboarding-plan.md
└── /templates/
    └── FEATURE_PLAN_TEMPLATE.md
```

### `/features` (60+ files) - MAJOR FEATURE DOCUMENTATION

#### Brain Dump (13 files)

```
/apps/web/docs/features/brain-dump/
├── README.md                          [INDEX]
├── PHASE_1_IMPLEMENTATION.md
├── PHASE_2_IMPLEMENTATION.md
├── PREPARATORY_ANALYSIS_INTEGRATION.md
├── PREP_ANALYSIS_IMPLEMENTATION_SUMMARY.md
├── PREP_ANALYSIS_ORIGINAL_PLAN.md
├── PREP_ANALYSIS_QUICK_REFERENCE.md   [KEY DOC]
├── PREP_ANALYSIS_QUICK_START.md
├── PREP_ANALYSIS_README.md
├── PREP_ANALYSIS_REFACTOR_PLAN.md
├── MULTI_BRAINDUMP_REDESIGN_PLAN.md
├── MULTI_BRAINDUMP_STATUS_UPDATE.md
└── MULTI_BRAINDUMP_TESTING_GUIDE.md
```

#### Calendar Integration (8 files)

```
/apps/web/docs/features/calendar-integration/
├── README.md                          [INDEX]
├── calendar-analysis-bugs-investigation.md
├── calendar-analysis-implementation-status.md
├── calendar-analysis-task-improvement-research.md
├── calendar-cleanup-phase-regeneration-analysis.md
├── calendar-ingestion-buildos-implementation.md
├── calendar-ingestion-integration-plan.md
└── PAST_TASKS_BUG_FIX.md
```

#### Notifications (14 files)

```
/apps/web/docs/features/notifications/
├── README.md                          [INDEX]
├── NOTIFICATION_SYSTEM_CHECKPOINT.md
├── NOTIFICATION_SYSTEM_IMPLEMENTATION.md
├── NOTIFICATION_SYSTEM_DOCS_MAP.md
├── NOTIFICATION_LOGGING_IMPLEMENTATION_SPEC.md
├── PHASE_3_MANUAL_QA_CHECKLIST.md
├── generic-stackable-notification-system-spec.md
├── project-synthesis-notification-spec.md
├── URGENT_NOTIFICATION_BUG.md
└── /implementation/ (5 files)
    ├── NOTIFICATION_ADMIN_DASHBOARD_IMPLEMENTATION_SUMMARY.md
    ├── NOTIFICATION_DASHBOARD_COMPLETE.md
    ├── NOTIFICATION_PHASE1_FILES.md
    ├── NOTIFICATION_PHASE3_ENV_SETUP.md
    └── NOTIFICATION_PHASE3_IMPLEMENTATION.md
```

#### Onboarding (5 files)

```
/apps/web/docs/features/onboarding/
├── README.md                          [INDEX]
├── build-os-onboarding-revamp.md
└── ONBOARDING_ASSETS_CHECKLIST.md

/apps/web/docs/features/onboarding-v2/
├── README.md                          [INDEX]
└── calendar-connection-cta-spec.md
```

#### Other Features

```
/apps/web/docs/features/
├── /admin-dashboard/
│   └── README.md
├── /time-blocks/
│   ├── README.md
│   └── IMPLEMENTATION_PLAN.md
├── /phase-generation/
│   └── PROCEDURAL_PHASE_GENERATION_STATUS.md
└── /project-export/
    ├── BROWSER_PRINT_IMPLEMENTATION.md
    └── PDF_EXPORT_MIGRATION_SESSION.md
```

### `/prompts` (60+ files) - COMPLEX LLM PROMPT LIBRARY

#### Structure

```
/apps/web/docs/prompts/
├── README.md                          [INDEX]
├── PROMPT_ARCHITECTURE.md
├── architecture.md
├── image-design-prompts.md

├── /brain-dump/
│   ├── /existing-project/
│   │   ├── existing-project-context-update-prompt.md
│   │   ├── existing-project-short-braindump-prompt.md
│   │   ├── existing-project-short-context-update.md
│   │   ├── /dual-processing/
│   │   │   ├── /context/
│   │   │   │   └── existing-project-context-prompt.md
│   │   │   └── /tasks/
│   │   │       └── existing-project-task-extraction-prompt.md
│   │   │       └── existing-project-task-extraction-with-questions-prompt.md
│   │   └── /short-braindump/
│   │       ├── /context/
│   │       │   └── short-braindump-context-update-prompt.md
│   │       └── /tasks/
│   │           ├── short-braindump-task-extraction-prompt.md
│   │           └── short-braindump-task-extraction-with-questions-prompt.md
│   └── /new-project/
│       ├── new-project-short-braindump-prompt.md
│       ├── /dual-processing/
│       │   ├── /context/
│       │   │   └── new-project-context-prompt.md
│       │   └── /tasks/
│       │       └── new-project-task-extraction-prompt.md
│       └── /singular/
│           └── new-project-singular-prompt.md

├── /existing-project/ [DUPLICATE STRUCTURE - NEEDS AUDIT]
│   ├── existing-project-context-update-prompt.md [OLDER]
│   ├── /dual-processing/
│   │   ├── /context/
│   │   │   └── existing-project-context-prompt.md
│   │   └── /tasks/
│   │       ├── existing-project-task-extraction-prompt.md
│   │       └── existing-project-task-extraction-with-questions-prompt.md
│   ├── /preparatory-analysis/
│   │   └── prep-analysis-prompt.md
│   └── /short-braindump/
│       └── /tasks/
│           ├── short-braindump-task-extraction-prompt.md
│           └── short-braindump-task-extraction-with-questions-prompt.md

├── /new-project/ [SIMPLER STRUCTURE]
│   ├── /dual-processing/
│   │   ├── /context/
│   │   │   └── new-project-context-prompt.md
│   │   └── /tasks/
│   │       └── new-project-task-extraction-prompt.md

├── /calendar-analysis/
│   ├── calendar-analysis-prompt.md
│   └── /2-part/
│       └── part1-event-grouping-prompt.md

├── /components/
│   └── integrated-questions-prompt.md

├── /phase-generation/
│   ├── schedule-in-phases-prompt.md
│   └── calendar-optimized-prompt.md

└── /task-synthesis/
    └── task-synthesis-reorganization.md
```

### `/technical` (87 files) - COMPREHENSIVE TECHNICAL DOCS

#### API Reference (17 files)

```
/apps/web/docs/technical/api/
├── README.md                          [INDEX]
├── API_IMPROVEMENTS_AND_OPTIMIZATIONS.md
├── COMPRESSION_IMPLEMENTATION.md
├── COMPRESSION_SUMMARY.md
├── routes-reference.md
├── summary.md
├── templates.md
├── types.md
└── /endpoints/ (9 files)
    ├── admin.md
    ├── authentication.md
    ├── braindumps.md
    ├── calendar.md
    ├── daily-briefs.md
    ├── notification-preferences.md
    ├── projects.md
    ├── tasks.md
    └── utilities.md
```

#### Architecture (11 files)

```
/apps/web/docs/technical/architecture/
├── README.md                          [INDEX]
├── BUILD_OS_MASTER_CONTEXT.md
├── CALENDAR_SERVICE_FLOW.md
├── CALENDAR_WEBHOOK_FLOW.md
├── SCALABILITY_ANALYSIS.md
├── ai-pipeline.md
├── brain-dump-flow.md
├── calendar-sync.md
├── email-system.md
├── supabase-design.md
└── system-checkpoint.md
```

#### Deployment & Operations (15 files)

```
/apps/web/docs/technical/deployment/
├── BUILD.md
├── DEPLOYMENT_CHECKLIST.md
├── VERCEL_DEPLOYMENT.md
└── /runbooks/ (9 files)
    ├── calendar-webhook-failures.md
    ├── database-recovery.md
    ├── incident-response.md
    ├── openai-rate-limiting.md
    ├── performance-issues.md
    ├── stripe-webhook-failures.md
    ├── stripe-webhook-validation.md
    ├── supabase-connection-recovery.md
    └── supabase-recovery.md
```

#### Database (3 files)

```
/apps/web/docs/technical/database/
├── schema.md
├── rls-policies.md
└── indexes.md
```

#### Services (7 files)

```
/apps/web/docs/technical/services/
├── README.md                          [INDEX]
├── brain-dump-service.md
├── calendar-service.md
├── project-service.md
├── prompt-service.md
├── LLM_USAGE_TRACKING.md
└── LLM_USAGE_IMPLEMENTATION_SUMMARY.md
```

#### Development (10 files)

```
/apps/web/docs/technical/development/
├── DEVELOPMENT_PROCESS.md
├── GIT_WORKFLOW.md
├── PERFORMANCE_FIXES_APPLIED.md
├── PERFORMANCE_ISSUES_FOUND.md
├── VIEW_TRANSITION_DEBUG_GUIDE.md
├── VIEW_TRANSITION_FIX.md
├── VIEW_TRANSITION_TEST.md
├── getting-started.md
├── svelte5-runes.md
└── sveltekit-patterns.md
```

#### Other Technical Sections

```
/apps/web/docs/technical/
├── /components/ (5 files)
│   ├── BUILDOS_STYLE_GUIDE.md
│   ├── DESIGN_SYSTEM_GUIDE.md
│   ├── MODAL_STANDARDS.md
│   ├── /brain-dump/ (3 files)
│   └── /projects/ (2 files)
├── /testing/ (4 files)
├── /integrations/ (3 files)
├── /audits/ (1 file)
├── /calendar/ (1 file)
└── /performance/ (1 file)
```

### `/integrations` (5 files)

```
/apps/web/docs/integrations/
├── STRIPE_IMPLEMENTATION_SUMMARY.md
├── stripe-implementation-checklist.md
├── stripe-integration-overview.md
├── stripe-setup.md
└── stripe-testing-plan.md
```

### `/operations`

```
/apps/web/docs/operations/
└── /deployment/ (3 files)
    ├── READY_TO_DEPLOY.md
    ├── VERCEL_CONFIGURATION_GUIDE.md
    └── VERCEL_DEPLOYMENT_FIX.md
```

---

## Research & Thoughts Directory: `/thoughts` (156 files)

### Ideas (4 files)

```
/thoughts/shared/ideas/
├── new-project-context-fields.md
├── project-context-sub-node-design.md
├── project-context-sub-node-system.md
└── rolling-context-window-llm-game-idea.md
```

### Research (152 timestamped files)

Latest entries (2025-10-20):

```
/thoughts/shared/research/
├── 2025-10-20_16-45-00_timeblock-integration-implementation-complete.md
├── 2025-10-20_16-30-00_timeblock-daily-brief-integration.md
├── 2025-10-20_16-00-00_preparatory-analysis-executive-summary.md
├── 2025-10-20_15-30-00_preparatory-analysis-improvements.md
├── 2025-10-20_15-00-00_preparatory-analysis-implementation-audit.md
├── 2025-10-20_14-00-00_brain-dump-stream-api-verification.md
[... 146 more timestamped research files from 2025-09-27 through 2025-10-20 ...]
```

Key research topics covered:

- Brain dump flows and API architecture
- Notification system implementation and tracking
- Calendar analysis and integration
- SMS event scheduling
- Daily brief generation and timing
- User preferences and timezone handling
- Onboarding improvements
- Performance optimization

---

## Directory Index: README.md Coverage

### Has README.md (36 directories - 30% of total)

- /docs/ ✓
- /docs/architecture/diagrams/ ✓
- /docs/archive/ ✓
- /docs/business/ ✓
- /docs/features/sms-event-scheduling/ ✓
- /docs/features/sms-event-scheduling/research/ ✓
- /docs/testing/ ✓
- /docs/user-guide/ ✓
- /docs/integrations/twilio/ ✓
- /apps/web/docs/ ✓
- /apps/web/docs/development/ ✓
- /apps/web/docs/features/admin-dashboard/ ✓
- /apps/web/docs/features/brain-dump/ ✓
- /apps/web/docs/features/calendar-integration/ ✓
- /apps/web/docs/features/notifications/ ✓
- /apps/web/docs/features/onboarding/ ✓
- /apps/web/docs/features/onboarding-v2/ ✓
- /apps/web/docs/features/time-blocks/ ✓
- /apps/web/docs/technical/ ✓
- /apps/web/docs/technical/api/ ✓
- /apps/web/docs/technical/architecture/ ✓
- /apps/web/docs/technical/services/ ✓
- /apps/web/docs/prompts/ ✓

### Missing README.md (45+ directories - 70% of total)

- /docs/api/
- /docs/guides/
- /docs/operations/environment/
- /docs/operations/ci-cd/
- /docs/operations/monitoring/
- /docs/research/
- /docs/research/shared/
- /apps/web/docs/design/
- /apps/web/docs/features/dashboard/
- /apps/web/docs/features/project-export/
- /apps/web/docs/integrations/
- /apps/web/docs/migrations/
- /apps/web/docs/operations/
- /apps/web/docs/operations/deployment/
- /apps/web/docs/operations/monitoring/
- /apps/web/docs/operations/runbooks/
- All nested subdirectories under /prompts/

---

## Critical Issues & Recommendations

### Priority 1 - URGENT

1. **Scattered Root-Level Files:**
    - CORE_COLUMNS_AUDIT.md → Move to `/apps/web/docs/features/`
    - CORE_COLUMNS_IMPLEMENTATION_SUMMARY.md → Move
    - NOTIFICATION_LOGGING_IMPLEMENTATION_COMPLETE.md → Move to notifications/
    - NOTIFICATION_PREFERENCES_REFACTOR_COMPLETE.md → Move to notifications/

2. **Duplicate Prompt Structures:**
    - Audit `/apps/web/docs/prompts/brain-dump/` vs `/apps/web/docs/prompts/existing-project/`
    - Determine if true duplicates or intentional variants
    - Consolidate or clearly document the difference

### Priority 2 - HIGH

1. **Add Missing README.md files** to 45+ directories
2. **Archive outdated content** in `/docs/archive/`
3. **Review business content** in `/docs/marketing/` (77 files) and `/docs/business/` (21 files)
    - Should these be in separate biz-dev repository?

### Priority 3 - MEDIUM

1. **Empty directories cleanup:**
    - `/docs/integrations/stripe/` (related to `/apps/web/docs/integrations/`)
    - `/docs/integrations/supabase/`
    - `/docs/operations/ci-cd/`
    - `/docs/operations/monitoring/`

2. **Create navigation cross-linking** between related docs

3. **Auto-generate index** for deeply nested /prompts/ directory

---

## Summary Table

| Location                 | Files | Has Index | Key Content                                |
| ------------------------ | ----- | --------- | ------------------------------------------ |
| /docs                    | 312   | ✓         | Monorepo architecture, business, marketing |
| /docs/marketing          | 77    | ✗         | Investor profiles, social media strategies |
| /docs/business           | 21    | ✓         | Pitch decks, communications                |
| /apps/web/docs           | 180   | ✓         | Web features, technical docs, API          |
| /apps/web/docs/technical | 87    | ✓         | API, architecture, deployment              |
| /apps/web/docs/prompts   | 60+   | ✓         | LLM prompt library                         |
| /apps/web/docs/features  | 60+   | ✓         | Brain dump, notifications, calendar        |
| /thoughts/research       | 152   | ✗         | Timestamped research investigations        |
| Root scattered           | 6     | ✗         | Needs organization                         |

---

**End of Audit Report**
