# Test Coverage Matrix

**Last Updated**: 2025-10-06
**Overall Coverage**: ~10-15%

This document provides a comprehensive matrix of all major components, services, and modules in the BuildOS monorepo with their current test status.

**📊 For detailed web app test analysis, see [Web App Detailed Coverage](./WEB_APP_COVERAGE.md)**

## Legend

- ✅ **Excellent** (80%+ coverage)
- 🟢 **Good** (60-79% coverage)
- 🟡 **Partial** (30-59% coverage)
- 🟠 **Minimal** (10-29% coverage)
- 🔴 **None** (0-9% coverage)

---

## Web App (`/apps/web/`)

**📊 See [Web App Detailed Coverage](./WEB_APP_COVERAGE.md) for in-depth analysis of what each test file covers**

### Services (`/apps/web/src/lib/services/`)

| Service                                                      | Status  | Test File                                                | Priority | Notes                                    |
| ------------------------------------------------------------ | ------- | -------------------------------------------------------- | -------- | ---------------------------------------- |
| **Brain Dump**                                               |         |                                                          |          |
| `braindump-api.service.ts`                                   | 🔴 None | -                                                        | P1       | API client for brain dump operations     |
| `braindump-background.service.ts`                            | 🔴 None | -                                                        | P0       | Background job orchestration (621 lines) |
| `braindump-status.service.ts`                                | 🔴 None | -                                                        | P1       | Real-time status updates                 |
| `brain-dump-notification.bridge.ts`                          | 🔴 None | -                                                        | P2       | Notification bridge                      |
| **Calendar**                                                 |         |                                                          |          |
| `calendar-service.ts`                                        | 🔴 None | -                                                        | **P0**   | **Google Calendar API (1,661 lines)**    |
| `calendar-analysis.service.ts`                               | 🔴 None | -                                                        | **P0**   | **AI analysis (1,273 lines)**            |
| `calendar-webhook-service.ts`                                | 🔴 None | -                                                        | P0       | Webhook handler                          |
| `calendar-webhook-check.ts`                                  | 🔴 None | -                                                        | P1       | Health monitoring                        |
| `project-calendar.service.ts`                                | 🔴 None | -                                                        | P1       | Project-specific calendar                |
| **Projects**                                                 |         |                                                          |          |
| `projectService.ts`                                          | 🔴 None | -                                                        | **P0**   | **Core project CRUD (546 lines)**        |
| `projectData.service.ts`                                     | 🔴 None | -                                                        | P1       | Data aggregation                         |
| `project-synthesis.service.ts`                               | 🔴 None | -                                                        | P1       | AI synthesis                             |
| `realtimeProject.service.ts`                                 | 🔴 None | -                                                        | P1       | Real-time sync                           |
| **Phase Generation**                                         |         |                                                          |          |
| `phase-generation/orchestrator.ts`                           | 🔴 None | -                                                        | **P0**   | **Strategy coordinator**                 |
| `phase-generation/strategies/base-strategy.ts`               | 🔴 None | -                                                        | P0       | Abstract base                            |
| `phase-generation/strategies/phases-only.strategy.ts`        | 🔴 None | -                                                        | P0       | Basic phases                             |
| `phase-generation/strategies/schedule-in-phases.strategy.ts` | 🔴 None | -                                                        | P0       | With calendar                            |
| `phase-generation/strategies/calendar-optimized.strategy.ts` | 🔴 None | -                                                        | P0       | Advanced scheduling                      |
| `phase-generation-notification.bridge.ts`                    | 🟢 Good | `__tests__/phase-generation-notification.bridge.test.ts` | -        | Tested                                   |
| **Daily Briefs**                                             |         |                                                          |          |
| `dailyBrief/generator.ts`                                    | 🔴 None | -                                                        | P1       | Brief generation                         |
| `dailyBrief/emailSender.ts`                                  | 🔴 None | -                                                        | P1       | Email sending                            |
| `dailyBrief/mainBriefGenerator.ts`                           | 🔴 None | -                                                        | P1       | Main brief                               |
| `dailyBrief/projectBriefGenerator.ts`                        | 🔴 None | -                                                        | P1       | Project briefs                           |
| `dailyBrief/repository.ts`                                   | 🔴 None | -                                                        | P1       | Data access                              |
| `dailyBrief/streamHandler.ts`                                | 🔴 None | -                                                        | P1       | Stream handling                          |
| `dailyBrief/validator.ts`                                    | 🔴 None | -                                                        | P2       | Validation                               |
| `realtimeBrief.service.ts`                                   | 🔴 None | -                                                        | P2       | Real-time updates                        |
| **Other Services**                                           |         |                                                          |          |
| `google-oauth-service.ts`                                    | 🟢 Good | `__tests__/google-oauth-service.test.ts`                 | -        | OAuth flows tested                       |
| `recurrence-pattern.ts`                                      | 🟢 Good | `__tests__/recurrence-pattern.test.ts`                   | -        | Recurring tasks tested                   |
| `dashboardData.service.ts`                                   | 🟢 Good | `dashboardData.service.test.ts`                          | -        | Race condition tests                     |
| `synthesis/task-synthesis-prompt.ts`                         | 🟢 Good | `__tests__/task-synthesis-prompt.test.ts`                | -        | Prompt generation                        |
| `stripe-service.ts`                                          | 🔴 None | -                                                        | **P0**   | **Payment processing**                   |
| `email-service.ts`                                           | 🔴 None | -                                                        | P1       | Email sending                            |
| `sms.service.ts`                                             | 🔴 None | -                                                        | P1       | SMS sending                              |
| `onboarding-v2.service.ts`                                   | 🔴 None | -                                                        | P2       | Onboarding flow                          |
| `onboardingClient.service.ts`                                | 🔴 None | -                                                        | P2       | Client onboarding                        |
| `promptTemplate.service.ts`                                  | 🔴 None | -                                                        | P1       | LLM prompts                              |

**Summary**: 6/68+ services tested (~9%)

---

### Utilities (`/apps/web/src/lib/utils/`)

| Utility                             | Status       | Test File                                         | Priority | Notes               |
| ----------------------------------- | ------------ | ------------------------------------------------- | -------- | ------------------- |
| **Brain Dump**                      |              |                                                   |          |
| `braindump-processor.ts`            | 🟡 Partial   | `braindump-processor.test.ts`                     | -        | Partial coverage    |
| `braindump-validation.ts`           | 🟢 Good      | `braindump-validation.test.ts`                    | -        | Validation tested   |
| `braindump-ui-validation.ts`        | 🟢 Good      | `__tests__/braindump-ui-validation.test.ts`       | -        | UI validation       |
| `brain-dump-integration-simple.ts`  | 🟢 Good      | `__tests__/brain-dump-integration-simple.test.ts` | -        | Integration         |
| **References**                      |              |                                                   |          |
| `reference-resolution.ts`           | 🟢 Good      | `__tests__/reference-resolution.test.ts`          | -        | Tested              |
| `project-ref-resolution.ts`         | 🟢 Good      | `__tests__/project-ref-resolution.test.ts`        | -        | Tested              |
| `heading-normalization.ts`          | 🟢 Good      | `__tests__/heading-normalization.test.ts`         | -        | Tested              |
| **Operations**                      |              |                                                   |          |
| `operations/operations-executor.ts` | 🟢 Good      | `operations/operations-executor.test.ts`          | -        | Rollback tested     |
| **Event Bus**                       |              |                                                   |          |
| `event-bus.ts`                      | ✅ Excellent | `event-bus.test.ts`                               | -        | Comprehensive       |
| **Prompts**                         |              |                                                   |          |
| `prompt-audit.ts`                   | 🟢 Good      | `__tests__/prompt-audit.test.ts`                  | -        | Tested              |
| **Untested**                        |              |                                                   |          |
| `api-client.ts`                     | 🔴 None      | -                                                 | P1       | HTTP client         |
| `api-client-helpers.ts`             | 🔴 None      | -                                                 | P1       | API helpers         |
| `api-response.ts`                   | 🔴 None      | -                                                 | P1       | Response formatting |
| `sse-processor.ts`                  | 🔴 None      | -                                                 | P1       | Server-sent events  |
| `date-utils.ts`                     | 🔴 None      | -                                                 | P1       | Date formatting     |
| `timezone.ts`                       | 🔴 None      | -                                                 | P1       | Timezone handling   |
| `dateValidation.ts`                 | 🔴 None      | -                                                 | P1       | Date validation     |
| `markdown.ts`                       | 🔴 None      | -                                                 | P2       | Markdown processing |
| `markdown-nesting.ts`               | 🔴 None      | -                                                 | P2       | Nesting logic       |
| `calendar-error-monitor.ts`         | 🔴 None      | -                                                 | P2       | Error monitoring    |
| `calendar-task-field-config.ts`     | 🔴 None      | -                                                 | P2       | Field config        |
| `email-config.ts`                   | 🔴 None      | -                                                 | P2       | Email config        |
| `emailTemplate.ts`                  | 🔴 None      | -                                                 | P2       | Email templates     |
| `email-templates.ts`                | 🔴 None      | -                                                 | P2       | Template management |
| `email-styles.ts`                   | 🔴 None      | -                                                 | P2       | Email styling       |
| `performance-optimization.ts`       | 🔴 None      | -                                                 | P3       | Performance         |
| `performance-monitor.ts`            | 🔴 None      | -                                                 | P3       | Monitoring          |
| `componentOptimization.ts`          | 🔴 None      | -                                                 | P3       | Optimization        |
| `auth.ts`                           | 🔴 None      | -                                                 | P1       | Auth utilities      |
| `google-oauth.ts`                   | 🔴 None      | -                                                 | P1       | OAuth helpers       |
| `llm-utils.ts`                      | 🔴 None      | -                                                 | P2       | LLM utilities       |
| `activityLogger.ts`                 | 🔴 None      | -                                                 | P2       | Activity logging    |

**Summary**: 11/60+ utilities tested (~19%)

---

### Stores (`/apps/web/src/lib/stores/`)

| Store                             | Status       | Test File                              | Priority | Notes                      |
| --------------------------------- | ------------ | -------------------------------------- | -------- | -------------------------- |
| `project.store.ts`                | ✅ Excellent | `project.store.test.ts`                | -        | 407 lines, race conditions |
| `notification.store.ts`           | 🟢 Good      | `__tests__/notification.store.test.ts` | -        | Basic coverage             |
| **Untested**                      |              |                                        |          |
| `brain-dump-v2.store.ts`          | 🔴 None      | -                                      | P0       | Main brain dump state      |
| `backgroundJobs.ts`               | 🔴 None      | -                                      | P1       | Job tracking               |
| `briefPreferences.ts`             | 🔴 None      | -                                      | P2       | Brief preferences          |
| `brainDumpPreferences.ts`         | 🔴 None      | -                                      | P2       | Brain dump prefs           |
| `modal.store.ts`                  | 🔴 None      | -                                      | P2       | Modal state                |
| `toast.store.ts`                  | 🔴 None      | -                                      | P2       | Toast notifications        |
| `userContext.ts`                  | 🔴 None      | -                                      | P1       | User context               |
| `dashboard.store.ts`              | 🔴 None      | -                                      | P2       | Dashboard state            |
| `schedulingStore.ts`              | 🔴 None      | -                                      | P2       | Scheduling state           |
| `searchStore.ts`                  | 🔴 None      | -                                      | P2       | Search state               |
| `unifiedBriefGeneration.store.ts` | 🔴 None      | -                                      | P2       | Brief generation           |
| `navigation.store.ts`             | 🔴 None      | -                                      | P3       | Navigation                 |

**Summary**: 2/14 stores tested (~14%)

---

### Components (`/apps/web/src/lib/components/`)

| Component Category                           | Status     | Test Files                                 | Priority | Notes                 |
| -------------------------------------------- | ---------- | ------------------------------------------ | -------- | --------------------- |
| **Tested**                                   |            |                                            |          |
| `onboarding-v2/ArchetypeStep.svelte`         | 🟢 Good    | `ArchetypeStep.test.ts`                    | -        | Component tested      |
| `synthesis/TaskMappingView.svelte`           | 🟡 Partial | `__tests__/TaskMappingView.simple.test.ts` | -        | Simple test           |
| **Brain Dump** (18 files)                    |            |                                            |          |
| `brain-dump/BrainDumpModal.svelte`           | 🔴 None    | -                                          | **P0**   | **Main modal**        |
| `brain-dump/RecordingView.svelte`            | 🔴 None    | -                                          | P0       | Voice recording       |
| `brain-dump/OperationsList.svelte`           | 🔴 None    | -                                          | P0       | Operations display    |
| `brain-dump/ProcessingModal.svelte`          | 🔴 None    | -                                          | P0       | Processing feedback   |
| `brain-dump/*` (14 more files)               | 🔴 None    | -                                          | P1       | Various brain dump UI |
| **Notifications** (10+ files)                |            |                                            |          |
| `notifications/NotificationStack.svelte`     | 🔴 None    | -                                          | P1       | Main container        |
| `notifications/NotificationModal.svelte`     | 🔴 None    | -                                          | P1       | Modal display         |
| `notifications/MinimizedNotification.svelte` | 🔴 None    | -                                          | P1       | Minimized state       |
| `notifications/*` (7+ type-specific)         | 🔴 None    | -                                          | P1       | Type-specific modals  |
| **UI Components** (28+ files)                |            |                                            |          |
| `Button.svelte`                              | 🔴 None    | -                                          | P2       | Button                |
| `Modal.svelte`                               | 🔴 None    | -                                          | P2       | Generic modal         |
| `FormModal.svelte`                           | 🔴 None    | -                                          | P2       | Form modal            |
| `ConfirmationModal.svelte`                   | 🔴 None    | -                                          | P2       | Confirmation          |
| `*` (24 more)                                | 🔴 None    | -                                          | P2-P3    | Various UI            |
| **Projects** (multiple files)                |            |                                            |          |
| `projects/ProjectCard.svelte`                | 🔴 None    | -                                          | P2       | Project card          |
| `projects/ProjectHeader.svelte`              | 🔴 None    | -                                          | P2       | Header                |
| `projects/TaskList.svelte`                   | 🔴 None    | -                                          | P2       | Task list             |
| `projects/PhaseManager.svelte`               | 🔴 None    | -                                          | P2       | Phase manager         |
| **Other** (~170 files)                       |            |                                            |          |
| All other components                         | 🔴 None    | -                                          | P2-P3    | Various               |

**Summary**: 2/220+ components tested (~1%)

---

### API Routes (`/apps/web/src/routes/api/`)

| Route Category                           | Status  | Test File        | Priority | Notes                      |
| ---------------------------------------- | ------- | ---------------- | -------- | -------------------------- |
| **Tested**                               |         |                  |          |
| `braindumps/stream/+server.ts`           | 🟢 Good | `server.test.ts` | -        | DoS prevention (370 lines) |
| `admin/users/+server.ts`                 | 🟢 Good | `server.test.ts` | -        | Admin tests                |
| **Brain Dump**                           |         |                  |          |
| `braindumps/+server.ts`                  | 🔴 None | -                | P0       | GET/POST brain dumps       |
| `braindumps/[id]/+server.ts`             | 🔴 None | -                | P0       | Individual brain dump      |
| `braindumps/generate/+server.ts`         | 🔴 None | -                | P0       | Parse and save             |
| `braindumps/draft/+server.ts`            | 🔴 None | -                | P0       | Draft management           |
| `braindumps/draft/status/+server.ts`     | 🔴 None | -                | P0       | Status updates             |
| **Calendar**                             |         |                  |          |
| `calendar/+server.ts`                    | 🔴 None | -                | **P0**   | Calendar list              |
| `calendar/analyze/+server.ts`            | 🔴 None | -                | **P0**   | AI analysis                |
| `calendar/process/+server.ts`            | 🔴 None | -                | P0       | Event processing           |
| `calendar/webhook/+server.ts`            | 🔴 None | -                | **P0**   | **Webhook handler**        |
| `calendar/projects/+server.ts`           | 🔴 None | -                | P0       | Project calendars          |
| **Projects**                             |         |                  |          |
| `projects/+server.ts`                    | 🔴 None | -                | P0       | Project CRUD               |
| `projects/[id]/+server.ts`               | 🔴 None | -                | P0       | Individual project         |
| `projects/[id]/calendar/+server.ts`      | 🔴 None | -                | P1       | Project calendar           |
| `projects/[id]/calendar/sync/+server.ts` | 🔴 None | -                | P1       | Calendar sync              |
| `projects/*/` (10+ more routes)          | 🔴 None | -                | P1-P2    | Various project ops        |
| **Tasks**                                |         |                  |          |
| `tasks/+server.ts`                       | 🔴 None | -                | P0       | Task CRUD                  |
| `tasks/[id]/+server.ts`                  | 🔴 None | -                | P0       | Individual task            |
| `tasks/*/` (8+ more routes)              | 🔴 None | -                | P1       | Task operations            |
| **Daily Briefs**                         |         |                  |          |
| `daily-briefs/generate/+server.ts`       | 🔴 None | -                | P1       | Generate brief             |
| `daily-briefs/+server.ts`                | 🔴 None | -                | P1       | Brief CRUD                 |
| `daily-briefs/status/+server.ts`         | 🔴 None | -                | P1       | Generation status          |
| **Other** (120+ routes)                  |         |                  |          |
| All other routes                         | 🔴 None | -                | P1-P3    | Various endpoints          |

**Summary**: 2/153 routes tested (~1%)

---

### Pages (`/apps/web/src/routes/`)

| Page Category                           | Status     | Test File | Priority | Notes             |
| --------------------------------------- | ---------- | --------- | -------- | ----------------- |
| `__tests__/authenticated-pages.test.ts` | 🟡 Partial | Yes       | -        | Auth requirements |
| All 47 page components                  | 🔴 None    | -         | P2       | Page rendering    |

**Summary**: 1/47 pages tested (~2%)

---

### Integration Tests (`/apps/web/tests/integration/`)

| Test                     | Status       | Priority | Notes                           |
| ------------------------ | ------------ | -------- | ------------------------------- |
| `synthesis-flow.test.ts` | ✅ Excellent | -        | 387 lines, end-to-end synthesis |

**Summary**: 1 integration test file

---

### LLM Tests (`/apps/web/src/lib/tests/llm/`)

| Test                                                    | Status       | Priority | Notes                     |
| ------------------------------------------------------- | ------------ | -------- | ------------------------- |
| `llm/__tests__/new-project-creation.test.ts`            | ✅ Excellent | -        | 400+ lines, comprehensive |
| `llm/__tests__/existing-project-updates.test.ts`        | ✅ Excellent | -        | Project updates           |
| `llm-simple/__tests__/minimal-test.test.ts`             | 🟢 Good      | -        | Simplified tests          |
| `llm-simple/__tests__/new-project-creation.test.ts`     | 🟢 Good      | -        | Simplified                |
| `llm-simple/__tests__/existing-project-updates.test.ts` | 🟢 Good      | -        | Simplified                |

**Summary**: 5 LLM test files (⚠️ costs money to run)

---

## Worker Service (`/apps/worker/`)

### Core Infrastructure

| Component                   | Status       | Test File           | Priority | Notes                            |
| --------------------------- | ------------ | ------------------- | -------- | -------------------------------- |
| `index.ts` (API server)     | 🔴 None      | -                   | **P0**   | **6 API endpoints (405 lines)**  |
| `worker.ts` (orchestration) | 🔴 None      | -                   | **P0**   | **Worker lifecycle (225 lines)** |
| `scheduler.ts`              | ✅ Excellent | Multiple test files | -        | 95%+ coverage                    |
| `lib/supabaseQueue.ts`      | 🔴 None      | -                   | **P0**   | **Queue system (15,522 lines)**  |
| `lib/progressTracker.ts`    | 🔴 None      | -                   | P1       | Progress updates (8,987 lines)   |
| `lib/supabase.ts`           | 🔴 None      | -                   | P2       | Client setup (3,028 lines)       |

---

### Scheduler Tests (`/apps/worker/tests/`)

| Test File                         | Status       | Lines | Notes                       |
| --------------------------------- | ------------ | ----- | --------------------------- |
| `scheduler.test.ts`               | ✅ Excellent | 171   | Core functions              |
| `scheduler.comprehensive.test.ts` | ✅ Excellent | 764   | Edge cases, timezones, DST  |
| `scheduler-parallel.test.ts`      | ✅ Excellent | 515   | Parallel processing         |
| `scheduler-utils.test.ts`         | ✅ Excellent | 230   | Utility functions           |
| `briefBackoffCalculator.test.ts`  | ✅ Excellent | 324   | Engagement-based throttling |
| `briefGenerator.test.ts`          | 🟡 Partial   | 302   | Parallel project processing |

**Summary**: 6 test files, ~2,306 lines

---

### Workers (`/apps/worker/src/workers/`)

| Worker                                    | Status  | Test File | Priority | Notes                              |
| ----------------------------------------- | ------- | --------- | -------- | ---------------------------------- |
| **Brief Workers**                         |         |           |          |
| `brief/briefWorker.ts`                    | 🔴 None | -         | **P0**   | **Orchestration (10,734 lines)**   |
| `brief/emailWorker.ts`                    | 🔴 None | -         | **P0**   | **Email generation (6,195 lines)** |
| `brief/prompts.ts`                        | 🔴 None | -         | P1       | LLM prompts (7,206 lines)          |
| **Other Workers**                         |         |           |          |
| `phases/phasesWorker.ts`                  | 🔴 None | -         | P1       | Phase generation (2,682 lines)     |
| `onboarding/onboardingWorker.ts`          | 🔴 None | -         | P1       | Onboarding (2,249 lines)           |
| `onboarding/onboardingAnalysisService.ts` | 🔴 None | -         | P1       | Analysis (4,306 lines)             |
| `notification/notificationWorker.ts`      | 🔴 None | -         | P1       | Notifications (12,989 lines)       |
| `notification/emailAdapter.ts`            | 🔴 None | -         | P1       | Email adapter (6,131 lines)        |
| `smsWorker.ts`                            | 🔴 None | -         | P1       | SMS sending (4,928 lines)          |
| **Shared**                                |         |           |          |
| `shared/jobAdapter.ts`                    | 🔴 None | -         | P1       | BullMQ → Supabase adapter          |
| `shared/queueUtils.ts`                    | 🔴 None | -         | P1       | Queue utilities                    |

**Summary**: 0/11 workers tested (0%)

---

### Services (`/apps/worker/src/lib/services/`)

| Service                    | Status  | Test File | Priority | Notes                              |
| -------------------------- | ------- | --------- | -------- | ---------------------------------- |
| **Email**                  |         |           |          |
| `email-sender.ts`          | 🔴 None | -         | **P0**   | **SMTP transport (15,068 lines)**  |
| `email-service.ts`         | 🔴 None | -         | **P0**   | **Email generation (9,829 lines)** |
| `webhook-email-service.ts` | 🔴 None | -         | P1       | Webhook delivery (3,825 lines)     |
| `gmail-transporter.ts`     | 🔴 None | -         | P1       | Gmail transport (2,080 lines)      |
| **LLM**                    |         |           |          |
| `smart-llm-service.ts`     | 🔴 None | -         | P1       | DeepSeek strategy (30,322 lines)   |
| `llm-pool.ts`              | 🔴 None | -         | P1       | LLM pool (12,402 lines)            |

**Summary**: 0/6 services tested (0%)

---

### Utilities (`/apps/worker/src/lib/utils/`)

| Utility             | Status  | Test File | Priority | Notes                            |
| ------------------- | ------- | --------- | -------- | -------------------------------- |
| `activityLogger.ts` | 🔴 None | -         | P2       | Activity logging (8,088 lines)   |
| `emailTemplate.ts`  | 🔴 None | -         | P2       | Email templates (6,138 lines)    |
| `holiday-finder.ts` | 🔴 None | -         | P2       | Holiday detection (4,799 lines)  |
| `llm-utils.ts`      | 🔴 None | -         | P2       | LLM utilities (1,010 lines)      |
| `markdown.ts`       | 🔴 None | -         | P2       | Markdown rendering (4,481 lines) |

**Summary**: 0/5 utilities tested (0%)

---

### Configuration & Routes

| File                       | Status  | Test File | Priority | Notes                            |
| -------------------------- | ------- | --------- | -------- | -------------------------------- |
| `config/queueConfig.ts`    | 🔴 None | -         | P2       | Queue configuration              |
| `routes/email-tracking.ts` | 🔴 None | -         | P2       | Email tracking (has manual test) |

---

## Packages (`/packages/`)

### Package Status

| Package                    | Status  | Test File                   | Priority | Notes                         |
| -------------------------- | ------- | --------------------------- | -------- | ----------------------------- |
| `@buildos/twilio-service`  | 🟢 Good | `src/__tests__/sms.test.ts` | -        | 197 lines, SMS tested         |
| `@buildos/shared-types`    | 🔴 None | -                           | **P0**   | **validation.ts (622 lines)** |
| `@buildos/supabase-client` | 🔴 None | -                           | P1       | Client factory (126 lines)    |
| `@buildos/config`          | N/A     | -                           | -        | Empty placeholder             |

**Summary**: 1/4 packages tested (25%)

---

### Shared Types Breakdown

| File                    | Status  | Priority | Notes                                  |
| ----------------------- | ------- | -------- | -------------------------------------- |
| `validation.ts`         | 🔴 None | **P0**   | **622 lines - 11 job type validators** |
| `api-types.ts`          | 🔴 None | P3       | Generated types                        |
| `database.schema.ts`    | 🔴 None | P3       | Generated schema                       |
| `database.types.ts`     | 🔴 None | P3       | Supabase generated                     |
| `notification.types.ts` | 🔴 None | P3       | Type definitions                       |
| `queue-types.ts`        | 🔴 None | P2       | Queue type definitions                 |
| `index.ts`              | 🔴 None | P3       | Exports                                |

---

## Priority Summary

### P0 - CRITICAL (Immediate Action Required)

**Web App**:

- Calendar integration (3,934 lines, 3 services)
- Phase generation system (6 files)
- Project service (546 lines)
- Stripe service
- Brain dump background service (621 lines)
- Brain dump modal UI (18 components)
- Most API endpoints (151/153 untested)

**Worker**:

- Queue system (15,522 lines)
- API endpoints (6 routes, 405 lines)
- Worker orchestration (225 lines)
- Brief worker (10,734 lines)
- Email worker (6,195 lines)
- Email sender service (15,068 lines)
- Email service (9,829 lines)

**Packages**:

- Shared validation logic (622 lines)

**Total P0 Items**: ~20 critical components

---

### P1 - HIGH (Production Risk)

**Web App**:

- 15+ services (calendar webhook, daily briefs, email, SMS, etc.)
- 10+ utilities (API client, SSE, dates)
- 10+ stores
- 10+ notification components
- 50+ API routes

**Worker**:

- 11 worker processors
- Progress tracker (8,987 lines)
- LLM services (42,724 lines)
- 5+ utilities

**Packages**:

- Supabase client (126 lines)

**Total P1 Items**: ~100+ components

---

### P2 - MEDIUM (Quality Risk)

- 170+ UI components
- 40+ utilities
- 10+ stores
- 100+ API routes
- Worker utilities

**Total P2 Items**: ~300+ components

---

### P3 - LOW (Nice to Have)

- Generated types
- Performance utilities
- Navigation components
- Analytics endpoints

**Total P3 Items**: ~50+ components

---

## Testing Statistics

### Overall

- **Total Files in Codebase**: ~500+ source files
- **Total Test Files**: 37
- **Test Coverage**: ~10-15%
- **Test Lines**: ~3,000+ lines

### By Application

| App      | Total Files | Test Files | Coverage | Test Lines |
| -------- | ----------- | ---------- | -------- | ---------- |
| Web      | ~400+       | 29         | ~10-15%  | ~2,300     |
| Worker   | ~34         | 6          | ~18%     | ~2,300     |
| Packages | ~11         | 1          | ~25%     | ~200       |

### By Category

| Category   | Total | Tested | Coverage | Priority P0/P1 |
| ---------- | ----- | ------ | -------- | -------------- |
| Services   | 80+   | 12     | ~15%     | 30+ untested   |
| Components | 220+  | 2      | ~1%      | 28+ untested   |
| Utilities  | 65+   | 11     | ~17%     | 15+ untested   |
| Stores     | 14    | 2      | ~14%     | 3 untested     |
| API Routes | 153   | 2      | ~1%      | 70+ untested   |
| Workers    | 11    | 0      | 0%       | 11 untested    |
| Pages      | 47    | 1      | ~2%      | 0 P0/P1        |

---

## Next Steps

See [README.md](./README.md) for the complete improvement roadmap.

**Immediate Actions**:

1. Add tests for P0 components (calendar, queue, validation, API endpoints)
2. Set up coverage reporting
3. Create CI/CD test workflow
4. Document testing patterns

---

**Last Updated**: 2025-10-06
**Next Review**: 2025-11-06
