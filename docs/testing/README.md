# BuildOS Testing Infrastructure

**Last Updated**: 2025-10-06
**Status**: Active Development
**Coverage**: ~10-15% overall (strategic focus on critical paths)

## Overview

The BuildOS monorepo uses **Vitest** as its primary testing framework across all applications and packages. Our testing strategy prioritizes **high-risk, high-value areas** (LLM prompts, race conditions, security validation) over comprehensive coverage.

**Test Infrastructure:**

- **37 test files** with 498+ test cases
- **Dual test configurations** (standard vs expensive LLM tests)
- **Parallel execution** via Turborepo
- **TypeScript support** with full type checking

## Table of Contents

1. [Quick Start](#quick-start)
2. [Coverage Status](#coverage-status)
3. [Running Tests](#running-tests)
4. [Test Configuration](#test-configuration)
5. [Testing Patterns](#testing-patterns)
6. [What Has Coverage](#what-has-coverage)
7. [Critical Gaps](#critical-gaps)
8. [Improvement Roadmap](#improvement-roadmap)
9. [Additional Resources](#additional-resources)

## Documentation Quick Links

- **[📊 Web App Detailed Coverage](./WEB_APP_COVERAGE.md)** - Deep dive into what's tested in the web app
- **[📋 Coverage Matrix](./COVERAGE_MATRIX.md)** - Complete reference table for all components
- **[🔬 Research Document](../../thoughts/shared/research/2025-10-06_18-44-32_testing-infrastructure-audit.md)** - Full audit findings

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Run all tests across monorepo
pnpm test

# Run tests in specific app
cd apps/web && pnpm test
cd apps/worker && pnpm test

# Run expensive LLM tests (costs money!)
cd apps/web && pnpm test:llm

# Full pre-push validation
pnpm pre-push  # typecheck + test + lint + build
```

---

## Coverage Status

### Overall Metrics

| Application        | Test Files   | Coverage    | Status                                 |
| ------------------ | ------------ | ----------- | -------------------------------------- |
| **Web App**        | 29 files     | ~10-15%     | 🟡 Strategic focus                     |
| **Worker Service** | 6 files      | ~18%        | 🟡 Scheduler excellent, gaps elsewhere |
| **Packages**       | 1 file       | 25%         | 🔴 Major gaps                          |
| **Total**          | **37 files** | **~10-15%** | 🟡 **Improving**                       |

### Coverage by Area

#### Web App (`/apps/web/`)

| Area       | Files  | Coverage | Priority    |
| ---------- | ------ | -------- | ----------- |
| Components | 2/220+ | ~1%      | 🔴 Critical |
| Services   | 6/68+  | ~9%      | 🔴 Critical |
| Utilities  | 9/60+  | ~15%     | 🟡 Partial  |
| Stores     | 2/14   | ~14%     | 🟡 Partial  |
| API Routes | 2/153  | ~1%      | 🔴 Critical |
| Pages      | 1/47   | ~2%      | 🔴 Critical |

**📊 See [Web App Detailed Coverage](./WEB_APP_COVERAGE.md) for comprehensive breakdown of what's tested**

#### Worker Service (`/apps/worker/`)

| Component         | Status  | Priority        |
| ----------------- | ------- | --------------- |
| Scheduler         | ✅ 95%+ | Excellent       |
| Brief Backoff     | ✅ 90%+ | Excellent       |
| Brief Generator   | ⚠️ 30%  | Needs expansion |
| Queue System      | 🔴 0%   | Critical gap    |
| Worker Processors | 🔴 0%   | Critical gap    |
| API Endpoints     | 🔴 0%   | Critical gap    |
| Email Services    | 🔴 0%   | Critical gap    |

#### Packages (`/packages/`)

| Package                    | Status       | Priority          |
| -------------------------- | ------------ | ----------------- |
| `@buildos/twilio-service`  | ✅ Has tests | Good              |
| `@buildos/shared-types`    | 🔴 No tests  | **Critical**      |
| `@buildos/supabase-client` | 🔴 No tests  | High              |
| `@buildos/config`          | N/A          | Empty placeholder |

---

## Running Tests

### Standard Test Commands

#### Monorepo Level

```bash
# Run all tests in parallel via Turborepo
pnpm test

# Run tests once (no watch)
pnpm test:run

# Full validation pipeline
pnpm pre-push
```

#### Web App

```bash
cd apps/web

# Standard unit tests (excludes LLM tests)
pnpm test              # Run once
pnpm test:watch        # Watch mode
pnpm test:ui           # Interactive UI

# LLM tests (⚠️ COSTS MONEY - uses real OpenAI API)
pnpm test:llm          # Run once
pnpm test:llm:watch    # Watch mode
pnpm test:llm:verbose  # Verbose output

# Silent mode (for CI)
pnpm test:quiet        # Dot reporter
pnpm test:silent       # Completely silent

# Pre-push validation
pnpm pre-push          # typecheck + test + lint + build
```

#### Worker Service

```bash
cd apps/worker

# All tests
pnpm test              # Watch mode
pnpm test:run          # Run once
pnpm test:coverage     # With coverage report

# Specific tests
pnpm test:scheduler    # Only scheduler tests
pnpm test tests/briefGenerator.test.ts  # Single file
```

#### Packages

```bash
cd packages/twilio-service

# Run tests
pnpm test              # Watch mode
pnpm test:run          # Run once
```

---

## Test Configuration

### Web App Configuration

#### Standard Tests (`vitest.config.ts`)

**File**: `apps/web/vitest.config.ts`

```typescript
{
  plugins: [sveltekit()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // IMPORTANT: Excludes LLM tests to avoid API costs
    exclude: [
      '**/node_modules/**',
      '**/lib/tests/llm/**',
      '**/lib/tests/llm-simple/**'
    ]
  }
}
```

#### LLM Tests (`vitest.config.llm.ts`)

**File**: `apps/web/vitest.config.llm.ts`

```typescript
{
  test: {
    include: ['**/lib/tests/llm/**/*.test.ts'],
    testTimeout: 20000,        // 20s for API calls
    maxConcurrency: 1,         // Sequential to avoid rate limits
  }
}
```

**⚠️ Warning**: LLM tests make real API calls to OpenAI/DeepSeek and **cost money**. Run explicitly with `pnpm test:llm`.

### Worker Configuration

**File**: `apps/worker/vitest.config.ts`

```typescript
{
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  }
}
```

### Turborepo Orchestration

**File**: `turbo.json`

```json
{
	"test": {
		"dependsOn": ["^build"],
		"outputs": ["coverage/**"],
		"cache": false
	}
}
```

- Tests depend on workspace dependency builds
- Coverage artifacts tracked
- **No caching** - always run fresh

---

## Testing Patterns

### Best Practices

#### 1. Test Isolation

Always use `beforeEach` and `afterEach`:

```typescript
describe('ServiceName', () => {
	let mockDependency: any;
	let service: ServiceClass;

	beforeEach(() => {
		vi.clearAllMocks();
		mockDependency = createMockDependency();
		service = new ServiceClass(mockDependency);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should handle operation', async () => {
		// Test implementation
	});
});
```

#### 2. Supabase Client Mocking

Standard chainable mock pattern:

```typescript
const createMockSupabase = () => ({
	from: vi.fn().mockReturnThis(),
	select: vi.fn().mockReturnThis(),
	insert: vi.fn().mockReturnThis(),
	update: vi.fn().mockReturnThis(),
	eq: vi.fn().mockReturnThis(),
	single: vi.fn().mockResolvedValue({ data: null, error: null })
});
```

#### 3. Race Condition Testing

Verify order of operations:

```typescript
it('should track update BEFORE API call', async () => {
	const orderOfOperations: string[] = [];

	mockService.trackUpdate = vi.fn((id) => {
		orderOfOperations.push(`trackUpdate:${id}`);
	});

	// Perform operations...

	expect(orderOfOperations[0]).toBe('trackUpdate:temp-id');
	expect(orderOfOperations[1]).toBe('apiCall');
});
```

#### 4. Timezone Testing

Always test timezone conversions:

```typescript
it('should handle timezone correctly', () => {
	const now = new Date('2025-10-01T12:00:00Z'); // UTC
	const preference = {
		time_of_day: '09:00:00',
		timezone: 'America/New_York'
	};

	const result = calculateNextRunTime(preference, now);

	// 9 AM EDT = 1 PM UTC
	expect(result?.getUTCHours()).toBe(13);
});
```

#### 5. Parallel Processing Validation

Test performance of parallel operations:

```typescript
it('should process in parallel', async () => {
	const startTime = Date.now();
	const results = await Promise.allSettled(promises);
	const totalTime = Date.now() - startTime;

	// Should NOT be 300ms × N items
	expect(totalTime).toBeLessThan(400);
});
```

### Common Mocking Patterns

#### Module Mocking

```typescript
// Mock SvelteKit environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock environment variables
vi.mock('$env/static/private', () => ({
	PRIVATE_GOOGLE_CLIENT_ID: 'test-client-id',
	PRIVATE_GOOGLE_CLIENT_SECRET: 'test-client-secret'
}));

// Mock services
vi.mock('$lib/services/llm-pool', () => ({
	LLMPool: vi.fn().mockImplementation(() => ({
		makeRequest: vi.fn(),
		close: vi.fn()
	}))
}));
```

#### Storage Mocking

```typescript
class MemorySessionStorage implements Storage {
	private store = new Map<string, string>();

	clear(): void {
		this.store.clear();
	}
	getItem(key: string): string | null {
		return this.store.has(key) ? this.store.get(key)! : null;
	}
	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null;
	}
	get length(): number {
		return this.store.size;
	}
}
```

---

## What Has Coverage

### Excellent Coverage ✅

#### Web App

**Brain Dump Validation**:

- `braindump-validation.test.ts` - Input validation, length checks
- `brain-dump-processor.test.ts` - Core processing logic
- `braindump-ui-validation.test.ts` - UI validation rules

**LLM Prompt Testing** (5 files):

- `new-project-creation.test.ts` - Tests LLM output for project creation (400+ lines)
- `existing-project-updates.test.ts` - Tests project update prompts
- Real API call validation (⚠️ costs money)

**Race Condition Prevention**:

- `project.store.test.ts` - 407 lines testing optimistic updates and real-time sync
- Order of operations verification
- Tracking ID management

**Security Testing**:

- `server.test.ts` (braindumps/stream) - DoS prevention, input validation (370 lines)
- Content length limits (50KB max)
- Input sanitization
- Rate limiting validation

**Event Bus**:

- `event-bus.test.ts` - Comprehensive edge case coverage
- Unsubscribe during emit
- Error handling
- Real-world scenarios

#### Worker Service

**Scheduler System** (95%+ coverage):

- `scheduler.test.ts` - Core functions (171 lines)
- `scheduler.comprehensive.test.ts` - Edge cases (764 lines)
- `scheduler-parallel.test.ts` - Parallel processing (515 lines)
- `scheduler-utils.test.ts` - Utility functions (230 lines)
- Comprehensive timezone testing (UTC, EST, PST, JST, Auckland)
- DST transition handling
- Month/year boundary testing

**Brief Backoff Calculator** (90%+ coverage):

- `briefBackoffCalculator.test.ts` - 324 lines
- All engagement states tested
- Edge cases: new users, null visits, DB errors

**Brief Generator** (30% coverage):

- `briefGenerator.test.ts` - 302 lines
- Parallel project processing
- Error isolation with `Promise.allSettled`

#### Packages

**Twilio Service**:

- `sms.test.ts` - 197 lines
- SMS sending, opt-out validation
- Phone formatting, relative time

### Partial Coverage ⚠️

**Operations Executor**:

- `operations-executor.test.ts` - Good rollback testing
- Needs more CRUD operation coverage

**Reference Resolution**:

- `reference-resolution.test.ts` - Basic resolution tested
- `project-ref-resolution.test.ts` - Project references

**Notification Store**:

- `notification.store.test.ts` - Basic store logic
- Needs Svelte 5 runes coverage expansion

---

## Critical Gaps

### P0 - CRITICAL (Immediate Production Risk)

#### 1. Calendar Integration (3,934 lines, 0 tests)

**Impact**: HIGH - External API integration, timezone handling

**Files**:

- `calendar-service.ts` (1,661 lines) - Google Calendar API operations
- `calendar-analysis.service.ts` (1,273 lines) - AI-powered analysis
- `calendar-webhook-service.ts` - Real-time webhook processing

**Risks**:

- Timezone conversion bugs
- API error handling failures
- Webhook signature validation bypass
- Data sync inconsistencies

#### 2. Queue System (15,522 lines, 0 tests)

**Impact**: CRITICAL - Core infrastructure for background jobs

**File**: `apps/worker/src/lib/supabaseQueue.ts`

**Risks**:

- Job claiming race conditions
- Retry logic failures
- Progress tracking errors
- Stalled job recovery failures

#### 3. API Endpoints (151/153 untested - 99%)

**Impact**: HIGH - Security and reliability

**Routes**:

- Brain dump endpoints (4 routes)
- Calendar endpoints (5+ routes)
- Project endpoints (10+ routes)
- Task endpoints (8+ routes)
- Daily brief endpoints (3 routes)

**Risks**:

- Input validation bypass
- Authorization check failures
- SQL injection vulnerabilities
- Rate limiting bypass
- Error message information leaks

#### 4. Shared Validation Logic (622 lines, 0 tests)

**Impact**: CRITICAL - Used across both web and worker apps

**File**: `packages/shared-types/src/validation.ts`

**Risks**:

- Invalid data persisted to database
- Queue job failures due to bad data
- Type mismatches at runtime
- Timezone validation bypass

### P1 - HIGH (Production Risk)

#### 5. Phase Generation System (6 files, 0 tests)

**Files**:

- `orchestrator.ts` - Strategy coordination
- `strategies/phases-only.strategy.ts`
- `strategies/schedule-in-phases.strategy.ts`
- `strategies/calendar-optimized.strategy.ts`

**Risks**: Incorrect task distribution, calendar conflicts

#### 6. Worker Processors (34 files, mostly untested)

**Files**:

- `briefWorker.ts` (10,734 lines)
- `emailWorker.ts` (6,195 lines)
- `phasesWorker.ts` (2,682 lines)
- `onboardingWorker.ts` (2,249 lines)
- `notificationWorker.ts` (12,989 lines)
- `smsWorker.ts` (4,928 lines)

**Risks**: Job processing failures, email delivery failures

#### 7. Brain Dump UI Components (18 files, 0 tests)

**Components**:

- `BrainDumpModal.svelte`
- `RecordingView.svelte`
- `OperationsList.svelte`
- `ProcessingModal.svelte`

**Risks**: Core user journey untested, UI regressions

#### 8. Payment Processing (0 tests)

**File**: `stripe-service.ts`

**Risks**: Financial transaction failures, webhook validation bypass

### P2 - MEDIUM (Quality Risk)

#### 9. Email/SMS Services (30,000+ lines, 0 tests)

**Files**:

- `email-sender.ts` (15,068 lines)
- `email-service.ts` (9,829 lines)
- `webhook-email-service.ts` (3,825 lines)

**Risks**: Email delivery failures, template rendering errors

#### 10. LLM Services in Worker (42,724 lines, 0 tests)

**Files**:

- `smart-llm-service.ts` (30,322 lines)
- `llm-pool.ts` (12,402 lines)

**Risks**: Fallback logic failures, cost optimization bugs

#### 11. UI Components (220 components, 2 tested - ~1%)

**Components**:

- Notification system (10+ files)
- Project management UI
- Task management UI
- Settings UI

**Risks**: UI regressions, interaction bugs

#### 12. Stores (14 stores, 2 tested - 14%)

**Untested Stores**:

- `brain-dump-v2.store.ts`
- `backgroundJobs.ts`
- `brainDumpPreferences.ts`
- `briefPreferences.ts`
- `modal.store.ts`
- `toast.store.ts`
- `userContext.ts`
- `dashboard.store.ts`

**Risks**: State management bugs with Svelte 5 runes

---

## Improvement Roadmap

### Phase 1: Critical Infrastructure (Weeks 1-2)

**Goal**: Stabilize core infrastructure

1. **Add Calendar Service Tests** (16 hours)
    - Mock Google Calendar API
    - Test CRUD operations
    - Test timezone conversions
    - Test error handling

2. **Add Queue System Tests** (12 hours)
    - Mock Supabase RPCs
    - Test job lifecycle
    - Test retry logic and backoff
    - Test atomic operations

3. **Add Shared Validation Tests** (6 hours)
    - Test all job type validators
    - Test edge cases (null, invalid formats)
    - Test timezone validation

### Phase 2: API Coverage (Weeks 3-4)

**Goal**: Secure API endpoints

4. **Test Critical API Endpoints** (20 hours)
    - Brain dump endpoints (4 routes)
    - Calendar endpoints (5 routes)
    - Project endpoints (10 routes)
    - Focus on: validation, auth, error responses

5. **Add Supabase Client Tests** (4 hours)
    - Test client factory functions
    - Test environment validation
    - Test redirect URL generation

### Phase 3: Worker Coverage (Week 5)

**Goal**: Improve background job reliability

6. **Test Worker Processors** (16 hours)
    - Brief worker job processing
    - Email worker delivery
    - Test timezone handling
    - Test error isolation

7. **Test Email Services** (12 hours)
    - Mock SMTP transport
    - Test template rendering
    - Test webhook delivery

### Phase 4: Component Testing (Week 6)

**Goal**: Improve UI reliability

8. **Add Component Tests** (20 hours)
    - Brain dump modal flow
    - Notification system
    - Use Svelte Testing Library

9. **Add Store Tests** (8 hours)
    - Test Svelte 5 runes reactivity
    - Test state persistence
    - Test derived state

### Phase 5: E2E Testing (Weeks 7-8)

**Goal**: Validate user journeys

10. **Set Up Playwright** (8 hours)
    - Install and configure
    - Create fixtures and helpers

11. **Add Critical User Journey Tests** (20 hours)
    - Brain dump → Project creation
    - Calendar sync → Task scheduling
    - Daily brief generation

### Infrastructure Improvements

**Immediate**:

- [ ] Add coverage reporting to all apps
- [ ] Add test coverage thresholds (60%+)
- [ ] Create GitHub Actions test workflow
- [ ] Set up coverage badges

**Short-Term**:

- [ ] Add integration test directory structure
- [ ] Create centralized test fixtures
- [ ] Add visual regression testing
- [ ] Document testing patterns

**Long-Term**:

- [ ] Achieve 80%+ coverage of critical paths
- [ ] Add performance testing suite
- [ ] Add accessibility testing (axe-core)
- [ ] Set up mutation testing

---

## Additional Resources

### Documentation

- **🎯 Web App Detailed Coverage**: [`WEB_APP_COVERAGE.md`](./WEB_APP_COVERAGE.md) - **NEW** - Complete web app test breakdown
- **📋 Coverage Matrix**: [`COVERAGE_MATRIX.md`](./COVERAGE_MATRIX.md) - Reference table for all components
- **Testing Checklist**: [`apps/web/docs/development/TESTING_CHECKLIST.md`](../../apps/web/docs/development/TESTING_CHECKLIST.md) - Comprehensive 620-line testing guide
- **Web App Testing**: [`apps/web/CLAUDE.md#testing`](../../apps/web/CLAUDE.md) - Web app specific commands
- **Worker Testing**: [`apps/worker/CLAUDE.md#testing`](../../apps/worker/CLAUDE.md) - Worker specific commands

### Configuration Files

- **Web Standard Config**: [`apps/web/vitest.config.ts`](../../apps/web/vitest.config.ts)
- **Web LLM Config**: [`apps/web/vitest.config.llm.ts`](../../apps/web/vitest.config.llm.ts)
- **Worker Config**: [`apps/worker/vitest.config.ts`](../../apps/worker/vitest.config.ts)
- **Turborepo Config**: [`turbo.json`](../../turbo.json)

### Example Test Files

**Best Practices**:

- **Race Conditions**: [`apps/web/src/lib/stores/project.store.test.ts`](../../apps/web/src/lib/stores/project.store.test.ts)
- **Security**: [`apps/web/src/routes/api/braindumps/stream/server.test.ts`](../../apps/web/src/routes/api/braindumps/stream/server.test.ts)
- **Edge Cases**: [`apps/web/src/lib/utils/event-bus.test.ts`](../../apps/web/src/lib/utils/event-bus.test.ts)
- **LLM Validation**: [`apps/web/src/lib/tests/llm/__tests__/new-project-creation.test.ts`](../../apps/web/src/lib/tests/llm/__tests__/new-project-creation.test.ts)
- **Timezone Testing**: [`apps/worker/tests/scheduler.comprehensive.test.ts`](../../apps/worker/tests/scheduler.comprehensive.test.ts)
- **Parallel Processing**: [`apps/worker/tests/scheduler-parallel.test.ts`](../../apps/worker/tests/scheduler-parallel.test.ts)

### Research Documents

- **Complete Audit**: [`thoughts/shared/research/2025-10-06_18-44-32_testing-infrastructure-audit.md`](../../thoughts/shared/research/2025-10-06_18-44-32_testing-infrastructure-audit.md) - Full research findings

---

## Questions or Issues?

For questions about:

- **Testing strategy**: Review this document and the testing checklist
- **Running tests**: See [Running Tests](#running-tests) section above
- **Writing new tests**: See [Testing Patterns](#testing-patterns) section above
- **Configuration**: See [Test Configuration](#test-configuration) section above

---

**Last Updated**: 2025-10-06
**Next Review**: 2025-11-06
**Maintainer**: Development Team
