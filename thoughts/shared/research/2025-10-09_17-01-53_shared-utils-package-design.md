---
date: 2025-10-09T17:01:53Z
researcher: Claude
git_commit: 6bb028d87e33b4a7bbe8ddf1a3482e1e102c2703
branch: main
repository: buildos-platform
topic: "Shared Utils Package Design: Consolidating sms-metrics and Duplicated Utilities"
tags:
  [
    research,
    codebase,
    shared-utils,
    sms-metrics,
    monorepo,
    architecture,
    package-design,
  ]
status: complete
last_updated: 2025-10-09
last_updated_by: Claude
---

# Research: Shared Utils Package Design - Consolidating sms-metrics and Duplicated Utilities

**Date**: 2025-10-09T17:01:53Z
**Researcher**: Claude
**Git Commit**: 6bb028d87e33b4a7bbe8ddf1a3482e1e102c2703
**Branch**: main
**Repository**: buildos-platform

## Research Question

The BuildOS platform recently created `@buildos/sms-metrics` as a standalone package. Should this be consolidated into a more general `@buildos/shared-utils` package along with other duplicated utilities? If so, what should the architecture look like?

## Executive Summary

After comprehensive analysis of the codebase, I recommend **creating `@buildos/shared-utils` BUT keeping `@buildos/sms-metrics` as a separate package**. Here's why:

### Key Findings

1. **SMS Metrics is a Domain Service (not a utility)**
   - 1,129 lines of complex business logic
   - Tightly coupled to SMS domain (scheduling, delivery, alerts)
   - External dependencies (Supabase RPC functions, database tables)
   - Service-oriented architecture with singletons
   - **Verdict**: Belongs in its own package ✅

2. **Significant Utility Duplication Found**
   - ~1,100+ lines of duplicated utility code across web/worker
   - 4 critical duplications: ActivityLogger (95%), Markdown (90%), Email Templates (100%), LLM Utils (100%)
   - Clear candidates for shared-utils package
   - **Verdict**: New package needed ✅

3. **Architectural Recommendation**
   - Create `@buildos/shared-utils` for true utilities (logging, markdown, email, LLM, date helpers)
   - Keep `@buildos/sms-metrics` as a domain-specific service package
   - Follow established single-responsibility principle
   - **Verdict**: Two packages serve different purposes ✅

## Detailed Analysis

### Part 1: Understanding sms-metrics

#### Current Package Structure

**Location**: `/packages/sms-metrics/`

**Files**:

- `src/smsMetrics.service.ts` (544 lines)
- `src/smsAlerts.service.ts` (585 lines)
- `src/index.ts` (23 lines)
- **Total**: 1,152 lines

**Usage**: 9 files across web and worker apps

- **Worker** (3 files): `scheduler.ts`, `smsWorker.ts`, `dailySmsWorker.ts`
- **Web** (6 files): API routes for metrics, alerts, summary, today, daily, user

**Key Characteristics**:

```typescript
// Domain-specific service methods
smsMetricsService.recordScheduled();
smsMetricsService.recordSent();
smsMetricsService.recordDelivered();
smsMetricsService.recordFailed();
smsMetricsService.recordLLMGeneration();
smsMetricsService.getDailyMetrics();
smsMetricsService.refreshMaterializedView();

// Alert monitoring
smsAlertsService.checkAlerts();
smsAlertsService.getUnresolvedAlerts();
smsAlertsService.resolveAlert();
```

**Dependencies**:

- `@buildos/supabase-client` (database access)
- `date-fns` (date formatting)

**Database Integration**:

- Depends on `record_sms_metric` RPC function
- Depends on `sms_metrics` table
- Depends on `sms_alert_thresholds` table
- Depends on `sms_alert_history` table
- Uses materialized views for performance

#### Why sms-metrics is NOT a Utility Package

| Characteristic            | Utilities         | sms-metrics Package          | Verdict                 |
| ------------------------- | ----------------- | ---------------------------- | ----------------------- |
| **Lines of code**         | < 500 lines       | 1,152 lines                  | ❌ Too large            |
| **Domain coupling**       | Generic, reusable | SMS-specific                 | ❌ Domain service       |
| **External dependencies** | Minimal           | Supabase, database tables    | ❌ Complex dependencies |
| **Database operations**   | None              | Extensive RPC calls, queries | ❌ Service layer        |
| **Business logic**        | Pure functions    | Event tracking, alerting     | ❌ Business logic       |
| **Singleton pattern**     | Rare              | Yes (service instances)      | ❌ Service pattern      |
| **Configuration**         | Stateless         | Stateful services            | ❌ Stateful             |

**Conclusion**: `sms-metrics` is a **domain service package**, not a utility package. It belongs in its own package following the single-responsibility principle.

---

### Part 2: Discovered Utility Duplications

#### Critical Duplications (Must Be Consolidated)

##### 1. ActivityLogger (95% Duplication)

**Web**: `apps/web/src/lib/utils/activityLogger.ts` (328 lines)
**Worker**: `apps/worker/src/lib/utils/activityLogger.ts` (291 lines)

**Core Methods** (identical):

```typescript
class ActivityLogger {
  async logActivity(userId, activityType, metadata);
  async logSystemMetric(metricType, value, metadata);
  async logActivitiesBatch(activities);
  async getUserActivitySummary(userId, startDate, endDate);
  async updateDailyAnalytics(date);
}
```

**Differences**:

- Web version has ErrorLoggerService integration (lines 51-100)
- Worker version is simpler without error logging
- ActivityType enum slightly different (web has `brain_dump_executed`, worker has `onboarding_questions_generated`)

**Recommendation**: Extract to shared-utils with conditional error logging

---

##### 2. Markdown Utilities (90% Duplication)

**Web**: `apps/web/src/lib/utils/markdown.ts` (183 lines)
**Worker**: `apps/worker/src/lib/utils/markdown.ts` (175 lines)

**Functions** (identical):

```typescript
renderMarkdown(content, options);
getProseClasses(variant);
stripMarkdown(text);
getMarkdownPreview(text, maxLength);
hasMarkdownFormatting(text);
```

**Dependencies**: `marked`, `sanitize-html`

**Differences**:

- Web has browser-specific `escapeHtml` fallback
- Worker uses `marked.parse()`, web uses `marked()`

**Recommendation**: Extract to shared-utils with environment detection

---

##### 3. Email Templates (100% Duplication)

**Web**: `apps/web/src/lib/utils/emailTemplate.ts` (303 lines)
**Worker**: `apps/worker/src/lib/utils/emailTemplate.ts` (303 lines)

**Functions** (identical):

```typescript
generateMinimalEmailHTML(data: EmailTemplateData): string
generatePlainEmailHTML(data: EmailTemplateData): string
```

**Duplication**: 100% IDENTICAL CODE

**Recommendation**: Extract to shared-utils immediately (easy win)

---

##### 4. LLM Model Selection (100% Duplication)

**Web**: `apps/web/src/lib/utils/llm-utils.ts` (34 lines)
**Worker**: `apps/worker/src/lib/utils/llm-utils.ts` (34 lines)

**Function** (identical):

```typescript
selectModelsForPromptComplexity(promptLength, complexity);
// Returns: ['gpt-4o-mini', 'gpt-5-nano'] etc.
```

**Duplication**: 100% IDENTICAL CODE

**Recommendation**: Extract to shared-utils immediately (easy win)

---

#### Partial Duplications (Lower Priority)

##### 5. Date/Time Utilities

**Web**: `apps/web/src/lib/utils/date-utils.ts` (1,029 lines)

- Comprehensive date library with 50+ functions
- Timezone-aware with `date-fns-tz`
- Natural language date parsing
- Timeline extraction from text

**Worker**: Uses `date-fns-tz` directly (no dedicated utils)

**Recommendation**: Extract core date functions (not browser-specific)

---

##### 6. Data Validation

**Web**: `apps/web/src/lib/utils/sanitize-data.ts` (35 lines)
**Web**: `apps/web/src/lib/utils/data-cleaner.ts` (394 lines)

**Functions**:

```typescript
sanitizeTaskData(task);
cleanProjectData(project);
cleanTaskData(task);
// ... type-safe cleaning for all tables
```

**Recommendation**: Extract generic validation patterns to shared-utils

---

#### Web-Only Utilities (NOT for shared-utils)

- `pwa-enhancements.ts` - PWA features
- `clickOutside.ts` - Svelte action
- `componentOptimization.ts` - Svelte 5 helpers
- `event-bus.ts` - Frontend event system
- `api-client.ts` - Frontend API calls
- `google-oauth.ts` - OAuth flow handler
- `sse-processor.ts` - Server-Sent Events
- `braindump-processor.ts` - Brain dump UI logic

#### Worker-Only Utilities (NOT for shared-utils)

- `queueCleanup.ts` - Queue maintenance
- `holiday-finder.ts` - Holiday detection for briefs

---

### Part 3: Package Architecture Patterns

From analysis of existing packages (`shared-types`, `supabase-client`, `twilio-service`, `sms-metrics`):

#### Established Patterns

1. **Single Responsibility Principle**
   - Each package has one clear purpose
   - `shared-types` = types only
   - `supabase-client` = database clients only
   - `twilio-service` = SMS integration only
   - `sms-metrics` = SMS metrics/alerts only

2. **Layered Architecture**

   ```
   Layer 1 (Foundation):  @buildos/shared-types
   Layer 2 (Infrastructure): @buildos/supabase-client
   Layer 3 (Services):    @buildos/twilio-service, @buildos/sms-metrics
   ```

3. **Build Configuration**
   - All packages use `tsup` (CJS + ESM + types)
   - Consistent package.json structure
   - Workspace dependencies via `workspace:*`

4. **Dependency Rules**
   - `shared-types` has no internal dependencies (foundation)
   - `supabase-client` depends only on `shared-types`
   - Service packages depend on both
   - **NO circular dependencies**

5. **Export Patterns**
   - Barrel exports via `index.ts`
   - Singleton instances for services
   - Clear public API surface

---

### Part 4: Design Recommendations

#### Architecture Decision: Two Packages

**Option A: Merge sms-metrics into shared-utils** ❌

- Violates single responsibility principle
- Mixes domain services with utilities
- Creates confusion about package purpose
- Breaks established layered architecture

**Option B: Create shared-utils, keep sms-metrics separate** ✅

- Maintains single responsibility
- Clear separation: utilities vs. services
- Follows established patterns
- Easier to maintain and reason about

#### Recommended Package Structure

```
packages/
├── shared-types/              # Existing: Type definitions
├── supabase-client/           # Existing: Database clients
├── config/                    # Existing: Configuration
├── twilio-service/            # Existing: SMS service (domain)
├── sms-metrics/               # Existing: SMS metrics service (domain) ✅ KEEP
│
└── shared-utils/              # NEW: Generic utilities
    ├── src/
    │   ├── index.ts           # Main exports
    │   │
    │   ├── logging/
    │   │   └── activityLogger.ts       # ⭐ Priority 1
    │   │
    │   ├── markdown/
    │   │   └── markdown.ts             # ⭐ Priority 1
    │   │
    │   ├── email/
    │   │   └── emailTemplate.ts        # ⭐ Priority 1
    │   │
    │   ├── llm/
    │   │   └── llm-utils.ts            # ⭐ Priority 1
    │   │
    │   ├── date/
    │   │   ├── date-utils.ts           # Priority 2
    │   │   └── timezone.ts             # Priority 2
    │   │
    │   └── validation/
    │       └── data-sanitizer.ts       # Priority 3
    │
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

---

### Part 5: Implementation Plan

#### Phase 1: Create Package Foundation (Week 1)

**Tasks**:

1. Create `packages/shared-utils` directory
2. Setup `package.json` with standard configuration
3. Setup `tsconfig.json`
4. Create `src/index.ts` barrel file
5. Update `pnpm-workspace.yaml`
6. Update root `package.json` if needed

**Package.json Template**:

```json
{
  "name": "@buildos/shared-utils",
  "version": "0.1.0",
  "private": true,
  "description": "Shared utility functions for BuildOS platform",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --sourcemap",
    "dev": "tsup src/index.ts --format cjs,esm --dts --sourcemap --watch",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@buildos/shared-types": "workspace:*",
    "@buildos/supabase-client": "workspace:*",
    "marked": "^X.X.X",
    "sanitize-html": "^X.X.X",
    "date-fns": "^X.X.X",
    "date-fns-tz": "^X.X.X"
  },
  "devDependencies": {
    "@types/node": "^20.11.10",
    "@types/sanitize-html": "^X.X.X",
    "tsup": "^8.3.5",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

**Estimated Time**: 2 hours

---

#### Phase 2: Migrate Critical Duplications (Week 1-2)

**Priority 1: Easy Wins (100% identical code)**

##### Task 2.1: Email Templates

- Copy `emailTemplate.ts` from web to `packages/shared-utils/src/email/`
- Update imports in web and worker
- Test email rendering in both apps
- Delete original files
- **Estimated Time**: 1 hour
- **Lines Saved**: 303 lines

##### Task 2.2: LLM Utilities

- Copy `llm-utils.ts` from web to `packages/shared-utils/src/llm/`
- Update imports in web and worker
- Test model selection logic
- Delete original files
- **Estimated Time**: 30 minutes
- **Lines Saved**: 34 lines

**Priority 2: Near-Identical (Minor differences)**

##### Task 2.3: Markdown Utilities

- Merge web and worker versions
- Handle browser vs. Node.js environment differences
- Use runtime environment detection:
  ```typescript
  const isBrowser = typeof window !== "undefined";
  ```
- Update imports in both apps
- Test markdown rendering in both contexts
- Delete original files
- **Estimated Time**: 2 hours
- **Lines Saved**: ~178 lines

##### Task 2.4: Activity Logger

- Merge web and worker versions
- Make ErrorLogger dependency optional:

  ```typescript
  class ActivityLogger {
    constructor(private errorLogger?: ErrorLoggerService) {}

    private logError(error: Error) {
      if (this.errorLogger) {
        this.errorLogger.logError(error);
      } else {
        console.error(error);
      }
    }
  }
  ```

- Unify ActivityType enum (keep all variants)
- Update imports in both apps
- Test activity logging in both contexts
- Delete original files
- **Estimated Time**: 3 hours
- **Lines Saved**: ~291 lines

**Phase 2 Total**:

- **Time**: 6.5 hours
- **Lines Saved**: ~806 lines of duplicated code
- **Files Reduced**: 8 files → 4 shared files

---

#### Phase 3: Extract Partial Duplications (Week 3-4)

##### Task 3.1: Core Date Utilities

- Extract non-browser-specific date functions from web
- Create `packages/shared-utils/src/date/date-utils.ts`
- Keep browser-specific functions in web app
- **Estimated Time**: 4 hours

##### Task 3.2: Timezone Utilities

- Extract server-safe timezone logic
- Handle timezone conversions without localStorage
- **Estimated Time**: 2 hours

##### Task 3.3: Data Validation

- Extract generic validation patterns
- Create reusable validators
- **Estimated Time**: 3 hours

**Phase 3 Total**:

- **Time**: 9 hours
- **Lines Saved**: ~200-300 lines

---

#### Phase 4: Testing & Documentation (Week 4)

##### Task 4.1: Unit Tests

- Create test files for each utility module
- Test in isolation (mock dependencies)
- Test browser vs. Node.js environments
- **Estimated Time**: 6 hours

##### Task 4.2: Documentation

- Create comprehensive README.md
- Document each utility module
- Provide usage examples
- Migration guide
- **Estimated Time**: 3 hours

##### Task 4.3: Integration Testing

- Test web app build and functionality
- Test worker app build and functionality
- Verify no regressions
- **Estimated Time**: 2 hours

**Phase 4 Total**:

- **Time**: 11 hours

---

### Total Implementation Effort

| Phase       | Tasks               | Time           | Impact                 |
| ----------- | ------------------- | -------------- | ---------------------- |
| **Phase 1** | Package setup       | 2 hours        | Foundation             |
| **Phase 2** | Critical migrations | 6.5 hours      | ~806 lines saved       |
| **Phase 3** | Partial migrations  | 9 hours        | ~250 lines saved       |
| **Phase 4** | Testing & docs      | 11 hours       | Quality assurance      |
| **TOTAL**   | -                   | **28.5 hours** | **~1,056 lines saved** |

**Estimated Timeline**: 3-4 weeks (part-time)

---

### Part 6: Trade-offs & Risks

#### Benefits of Shared Utils Package

✅ **Code Quality**

- Single source of truth for utilities
- Easier to fix bugs (fix once, benefits both apps)
- Consistent behavior across web and worker
- Better type safety with shared implementations

✅ **Maintainability**

- Reduce duplication by ~1,056 lines
- Clear package boundaries
- Easier to add new utilities
- Simpler dependency management

✅ **Developer Experience**

- Clear discoverability (`@buildos/shared-utils`)
- Better code organization
- Easier onboarding for new developers
- Consistent API across utilities

✅ **Testing**

- Test utilities in isolation
- Easier to mock in tests
- Comprehensive test coverage
- CI/CD benefits from shared tests

#### Risks & Mitigation

⚠️ **Breaking Changes**

- **Risk**: Changes affect both apps simultaneously
- **Mitigation**:
  - Semantic versioning (0.x.x during migration)
  - Thorough testing before each release
  - Feature flags for experimental features
  - Coordinated deployments

⚠️ **Migration Complexity**

- **Risk**: Temporary breakage during migration
- **Mitigation**:
  - Migrate one utility at a time
  - Keep both versions during transition
  - Comprehensive test coverage
  - Deploy web and worker together

⚠️ **Dependency Management**

- **Risk**: Shared dependencies increase bundle size
- **Mitigation**:
  - Use tree-shaking (ESM exports)
  - Separate entry points for different utilities
  - Monitor bundle sizes
  - Only import what's needed

⚠️ **Environment Differences**

- **Risk**: Browser vs. Node.js incompatibilities
- **Mitigation**:
  - Runtime environment detection
  - Conditional exports in package.json
  - Test in both environments
  - Clear documentation

⚠️ **Version Management**

- **Risk**: Coordinating versions across apps
- **Mitigation**:
  - Use `workspace:*` protocol
  - Monorepo benefits (single version)
  - Turborepo caching
  - Automated dependency updates

---

### Part 7: Comparison with Existing Packages

| Package             | Type           | Lines  | Purpose            | Dependencies               |
| ------------------- | -------------- | ------ | ------------------ | -------------------------- |
| **shared-types**    | Types          | ~500   | Type definitions   | None                       |
| **supabase-client** | Infrastructure | ~150   | Database clients   | shared-types               |
| **twilio-service**  | Domain Service | ~800   | SMS integration    | supabase-client, twilio    |
| **sms-metrics**     | Domain Service | 1,152  | SMS metrics/alerts | supabase-client, date-fns  |
| **shared-utils** ⭐ | Utilities      | ~1,200 | Generic helpers    | shared-types, marked, etc. |

**Observation**: `shared-utils` fits naturally into the ecosystem as a peer to `shared-types` (foundation layer).

---

### Part 8: Alternative Architectures Considered

#### Alternative 1: Merge sms-metrics into shared-utils

```
packages/shared-utils/
├── src/
│   ├── metrics/
│   │   ├── smsMetrics.service.ts
│   │   └── smsAlerts.service.ts
│   ├── logging/
│   ├── markdown/
│   └── ...
```

**Pros**:

- Fewer packages to manage
- One "utility" package

**Cons**:

- ❌ Violates single responsibility
- ❌ Mixes domain services with generic utilities
- ❌ Creates confusion about package purpose
- ❌ SMS metrics would be buried in "utils"
- ❌ Harder to find SMS-specific functionality
- ❌ Breaks established service layer pattern

**Verdict**: ❌ Not recommended

---

#### Alternative 2: Multiple Specialized Utility Packages

```
packages/
├── utils-logging/
├── utils-markdown/
├── utils-email/
├── utils-llm/
├── utils-date/
└── utils-validation/
```

**Pros**:

- Maximum modularity
- Fine-grained dependencies
- Independent versioning

**Cons**:

- ❌ Package proliferation (6+ new packages)
- ❌ More overhead to maintain
- ❌ Harder to discover utilities
- ❌ More complex dependency graph
- ❌ Overkill for current scale

**Verdict**: ❌ Over-engineering for current needs

---

#### Alternative 3: Keep Everything Duplicated

**Pros**:

- No migration effort
- Apps remain independent
- No shared dependency risks

**Cons**:

- ❌ 1,056+ lines of duplicated code
- ❌ Bugs must be fixed twice
- ❌ Inconsistent behavior possible
- ❌ Harder to maintain over time
- ❌ Wastes developer time

**Verdict**: ❌ Not sustainable

---

#### Recommended Architecture (Hybrid)

```
packages/
├── shared-types/              # Foundation layer
├── supabase-client/           # Infrastructure layer
├── config/                    # Configuration
│
├── twilio-service/            # Domain service (SMS)
├── sms-metrics/               # Domain service (SMS metrics) ✅
│
└── shared-utils/              # Utility layer (generic helpers) ✅
```

**Pros**:

- ✅ Clear separation: services vs. utilities
- ✅ Maintains single responsibility
- ✅ Follows established patterns
- ✅ Easy to navigate and discover
- ✅ Appropriate granularity
- ✅ Room to grow (can add more services or utils later)

**Verdict**: ✅ **Recommended**

---

### Part 9: Detailed Migration Strategy

#### Step-by-Step Migration Process

##### Step 1: Setup Package Foundation

```bash
# Create package directory
cd packages/
mkdir shared-utils
cd shared-utils

# Create directory structure
mkdir -p src/{logging,markdown,email,llm,date,validation}

# Create package.json (use template from Phase 1)
# Create tsconfig.json
# Create src/index.ts
```

##### Step 2: Migrate Email Templates (Easiest First)

```bash
# Copy file
cp ../../apps/web/src/lib/utils/emailTemplate.ts src/email/

# Update src/index.ts
echo "export * from './email/emailTemplate';" >> src/index.ts

# Build package
pnpm build

# Update web app
cd ../../apps/web
# In relevant files, change:
# from: import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
# to:   import { generateMinimalEmailHTML } from '@buildos/shared-utils';

# Update worker app
cd ../worker
# Similar import updates

# Test both apps
cd ../..
pnpm test:run --filter=web
pnpm test:run --filter=worker

# If all tests pass, delete original files
rm apps/web/src/lib/utils/emailTemplate.ts
rm apps/worker/src/lib/utils/emailTemplate.ts

# Commit
git add .
git commit -m "feat(shared-utils): migrate email templates to shared package"
```

##### Step 3: Migrate LLM Utils

```bash
# Similar process to Step 2
cp apps/web/src/lib/utils/llm-utils.ts packages/shared-utils/src/llm/
# Update exports, imports, test, delete originals, commit
```

##### Step 4: Migrate Markdown Utils (Handle Environment Differences)

```typescript
// packages/shared-utils/src/markdown/markdown.ts

import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const isBrowser = typeof window !== "undefined";

export function renderMarkdown(content: string, options = {}) {
  // Use marked.parse() for Node.js, marked() for browser
  const html = isBrowser ? marked(content) : marked.parse(content);

  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "target", "rel"],
    },
  });
}

function escapeHtml(text: string): string {
  if (isBrowser && typeof document !== "undefined") {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  } else {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// ... rest of functions
```

##### Step 5: Migrate Activity Logger (Handle Optional Dependencies)

```typescript
// packages/shared-utils/src/logging/activityLogger.ts

import { createServiceClient } from "@buildos/supabase-client";
import type { Database } from "@buildos/shared-types";

// Define minimal interface for error logger
interface ErrorLogger {
  logError(error: Error, context?: Record<string, any>): Promise<void>;
}

export class ActivityLogger {
  private supabase = createServiceClient();
  private errorLogger?: ErrorLogger;

  constructor(errorLogger?: ErrorLogger) {
    this.errorLogger = errorLogger;
  }

  async logActivity(
    userId: string,
    activityType: ActivityType,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    try {
      // ... implementation
    } catch (error) {
      // Use error logger if available, otherwise console
      if (this.errorLogger) {
        await this.errorLogger.logError(error as Error, {
          context: "ActivityLogger.logActivity",
          userId,
          activityType,
        });
      } else {
        console.error("[ActivityLogger] Error logging activity:", error);
      }
    }
  }

  // ... rest of methods
}

// Export singleton without error logger
export const activityLogger = new ActivityLogger();

// Export factory function for custom error logger
export function createActivityLogger(errorLogger?: ErrorLogger) {
  return new ActivityLogger(errorLogger);
}
```

**Usage in Web App**:

```typescript
// Web can pass error logger
import { createActivityLogger } from "@buildos/shared-utils";
import { errorLogger } from "$lib/services/errorLogger";

export const activityLogger = createActivityLogger(errorLogger);
```

**Usage in Worker**:

```typescript
// Worker uses default singleton
import { activityLogger } from "@buildos/shared-utils";

activityLogger.logActivity(userId, "task_completed", { taskId });
```

##### Step 6: Update App Dependencies

```bash
# Add shared-utils to web app
cd apps/web
pnpm add @buildos/shared-utils@workspace:*

# Add shared-utils to worker app
cd ../worker
pnpm add @buildos/shared-utils@workspace:*
```

##### Step 7: Update Turborepo Cache

```bash
# Build shared-utils first to populate cache
pnpm build --filter=shared-utils

# Build all apps
pnpm build
```

##### Step 8: Verify No Regressions

```bash
# Type checking
pnpm typecheck

# Run all tests
pnpm test:run

# Build all apps
pnpm build

# Local testing
pnpm dev --filter=web
pnpm dev --filter=worker
```

---

### Part 10: Package Documentation

#### README.md Template

````markdown
# @buildos/shared-utils

Shared utility functions for BuildOS platform. Used by both web and worker applications.

## Installation

This package is internal to the BuildOS monorepo and installed automatically via workspace dependencies.

```json
{
  "dependencies": {
    "@buildos/shared-utils": "workspace:*"
  }
}
```
````

## Modules

### Logging

**ActivityLogger** - Track user activities and system metrics

```typescript
import { activityLogger, createActivityLogger } from "@buildos/shared-utils";

// Use default singleton
await activityLogger.logActivity(userId, "task_completed", { taskId: "123" });

// Or create with custom error logger
const logger = createActivityLogger(myErrorLogger);
await logger.logActivity(userId, "project_created", { projectId: "456" });
```

### Markdown

**Markdown Utilities** - Render and process markdown content

```typescript
import {
  renderMarkdown,
  stripMarkdown,
  getMarkdownPreview,
} from "@buildos/shared-utils";

const html = renderMarkdown("# Hello **World**");
const plain = stripMarkdown("# Hello **World**"); // "Hello World"
const preview = getMarkdownPreview(longText, 100); // First 100 chars
```

### Email

**Email Templates** - Generate HTML email templates

```typescript
import {
  generateMinimalEmailHTML,
  generatePlainEmailHTML,
} from "@buildos/shared-utils";

const html = generateMinimalEmailHTML({
  title: "Welcome to BuildOS",
  preheader: "Get started with your account",
  heading: "Welcome!",
  body: "<p>Thanks for joining BuildOS.</p>",
  ctaText: "Get Started",
  ctaUrl: "https://build-os.com/onboarding",
  footerText: "BuildOS Team",
});
```

### LLM

**LLM Model Selection** - Select appropriate models based on prompt complexity

```typescript
import { selectModelsForPromptComplexity } from "@buildos/shared-utils";

const models = selectModelsForPromptComplexity(promptLength, "high");
// Returns: ['gpt-4o', 'gpt-4-turbo']
```

### Date (Coming Soon)

Core date manipulation utilities without browser dependencies.

### Validation (Coming Soon)

Generic data validation and sanitization utilities.

## Environment Support

All utilities are compatible with both browser (web app) and Node.js (worker) environments. Environment-specific behavior is handled automatically.

## Testing

```bash
# Run tests
pnpm test

# Run tests once
pnpm test:run

# Type checking
pnpm typecheck
```

## Development

```bash
# Watch mode for development
pnpm dev

# Build
pnpm build

# Clean
pnpm clean
```

## Dependencies

- `@buildos/shared-types` - Type definitions
- `@buildos/supabase-client` - Database access
- `marked` - Markdown rendering
- `sanitize-html` - HTML sanitization
- `date-fns` - Date manipulation
- `date-fns-tz` - Timezone handling

```

---

### Part 11: Final Recommendations

#### Immediate Actions (This Week)

1. **Create `@buildos/shared-utils` package** with foundation setup
2. **Migrate email templates** (100% duplication, easy win)
3. **Migrate LLM utilities** (100% duplication, easy win)
4. **Keep `@buildos/sms-metrics` as separate package** ✅

#### Short-Term (Next 2 Weeks)

1. **Migrate markdown utilities** (handle environment differences)
2. **Migrate activity logger** (handle optional dependencies)
3. **Write comprehensive tests**
4. **Document usage patterns**

#### Long-Term (Next Month)

1. **Extract core date utilities** (non-browser specific)
2. **Extract validation utilities**
3. **Consider additional utilities** as patterns emerge

#### Architectural Principles to Maintain

1. **Single Responsibility** - Each package has one clear purpose
2. **Layered Architecture** - Types → Infrastructure → Services → Utilities
3. **No Circular Dependencies** - Clean dependency graph
4. **Consistent Build Tooling** - All packages use tsup
5. **Type Safety** - Strong typing throughout
6. **Environment Agnostic** - Handle browser and Node.js
7. **Testability** - Pure functions, mockable dependencies

---

## Conclusion

The recommendation is **clear and well-founded**:

### ✅ Create `@buildos/shared-utils` Package

**Purpose**: Generic utility functions used by both web and worker apps

**Contents**:
- ActivityLogger (logging utilities)
- Markdown utilities (rendering, sanitization)
- Email templates (HTML generation)
- LLM utilities (model selection)
- Date utilities (core functions)
- Validation utilities (data sanitization)

**Benefits**:
- Eliminates 1,056+ lines of duplicated code
- Single source of truth for utilities
- Consistent behavior across apps
- Easier maintenance and testing
- Better code organization

### ✅ Keep `@buildos/sms-metrics` as Separate Package

**Reasoning**:
- It's a domain-specific service (not a utility)
- 1,152 lines of complex business logic
- Tightly coupled to SMS feature (scheduling, delivery, alerts)
- Extensive database dependencies
- Service-oriented architecture with singletons
- Follows single responsibility principle

**Benefits**:
- Clear separation of concerns
- Easier to find SMS-specific functionality
- Maintains established service layer pattern
- Follows monorepo architectural conventions
- Room to grow SMS features independently

### Summary

The BuildOS platform should have **TWO packages**:

1. **`@buildos/sms-metrics`** (domain service) - SMS-specific metrics and alerting
2. **`@buildos/shared-utils`** (utilities) - Generic helper functions

This architecture:
- ✅ Follows established patterns
- ✅ Maintains clear boundaries
- ✅ Eliminates duplication where appropriate
- ✅ Preserves single responsibility
- ✅ Scales well for future growth
- ✅ Easy to understand and maintain

**Estimated Effort**: 28.5 hours (3-4 weeks part-time)
**Impact**: ~1,056 lines of duplicated code eliminated, improved maintainability, better developer experience

---

## Code References

- `packages/sms-metrics/` - Current SMS metrics package
- `apps/web/src/lib/utils/activityLogger.ts:1` - Web activity logger
- `apps/worker/src/lib/utils/activityLogger.ts:1` - Worker activity logger
- `apps/web/src/lib/utils/markdown.ts:1` - Web markdown utilities
- `apps/worker/src/lib/utils/markdown.ts:1` - Worker markdown utilities
- `apps/web/src/lib/utils/emailTemplate.ts:1` - Web email templates
- `apps/worker/src/lib/utils/emailTemplate.ts:1` - Worker email templates
- `apps/web/src/lib/utils/llm-utils.ts:1` - Web LLM utilities
- `apps/worker/src/lib/utils/llm-utils.ts:1` - Worker LLM utilities
- `docs/MONOREPO_GUIDE.md:1` - Monorepo documentation
- `turbo.json:1` - Turborepo configuration

---

## Related Research

- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - System architecture
- `/docs/DEPLOYMENT_TOPOLOGY.md` - Deployment and package usage
- `/packages/shared-types/TYPE_SYSTEM_UPDATE_2025-09-27.md` - Type system evolution

---

## Open Questions

1. **Should we version shared-utils independently?**
   - Recommendation: Use `workspace:*` for now, consider semantic versioning later

2. **How do we handle breaking changes in utilities?**
   - Recommendation: Deprecate old functions, add new ones, coordinate removals

3. **Should we add runtime type validation?**
   - Recommendation: Consider `zod` or similar for critical utilities

4. **What's the strategy for adding new utilities?**
   - Recommendation: Start in app code, extract when duplication emerges

5. **Should we split date utilities into multiple modules?**
   - Recommendation: Single module initially, split if it grows too large

---

**Next Steps**: Review this design spec, get team feedback, and proceed with Phase 1 implementation.
```
