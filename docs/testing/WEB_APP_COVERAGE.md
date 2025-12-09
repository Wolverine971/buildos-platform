<!-- docs/testing/WEB_APP_COVERAGE.md -->

nin t# Web App Testing Coverage - Detailed Analysis

**Application**: BuildOS Web App (SvelteKit + Svelte 5)
**Last Updated**: 2025-10-06
**Test Framework**: Vitest 3.2.4
**Total Test Files**: 29 files
**Overall Coverage**: ~10-15%

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Test Infrastructure](#test-infrastructure)
3. [What IS Tested - Detailed Breakdown](#what-is-tested---detailed-breakdown)
4. [What is NOT Tested - Critical Gaps](#what-is-not-tested---critical-gaps)
5. [Test File Deep Dive](#test-file-deep-dive)
6. [Coverage by Feature Area](#coverage-by-feature-area)
7. [Recommendations](#recommendations)

---

## Executive Summary

The BuildOS web app has **29 test files** covering approximately **10-15%** of the codebase. Testing is strategically focused on:

- ✅ **LLM prompt accuracy** (5 test files, real API validation)
- ✅ **Race condition prevention** (project store, dashboard data)
- ✅ **Security validation** (DoS prevention, input sanitization)
- ✅ **Brain dump processing** (validation, parsing)
- ❌ **Component UI** (2/220+ tested - ~1%)
- ❌ **API endpoints** (2/153 tested - ~1%)
- ❌ **Calendar integration** (0 tests - critical gap)
- ❌ **Phase generation** (0 tests - critical gap)

### Quick Stats

| Category        | Files Tested | Total Files | Coverage | Status             |
| --------------- | ------------ | ----------- | -------- | ------------------ |
| **Components**  | 2            | 220+        | ~1%      | 🔴 Critical gap    |
| **Services**    | 6            | 68+         | ~9%      | 🔴 Major gaps      |
| **Utilities**   | 9            | 60+         | ~15%     | 🟡 Partial         |
| **Stores**      | 2            | 14          | ~14%     | 🟡 Partial         |
| **API Routes**  | 2            | 153         | ~1%      | 🔴 Critical gap    |
| **Pages**       | 1            | 47          | ~2%      | 🔴 Major gap       |
| **Integration** | 1            | N/A         | Minimal  | 🟡 Needs expansion |
| **LLM Tests**   | 5            | N/A         | Good     | ✅ Excellent       |

---

## Test Infrastructure

### Configuration Files

#### Standard Tests (`vitest.config.ts`)

**Location**: `/apps/web/vitest.config.ts`

```typescript
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./vitest.setup.ts'],
		include: ['**/*.{test,spec}.{js,ts}'],
		// CRITICAL: Excludes LLM tests to avoid API costs
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/lib/tests/llm/**',
			'**/lib/tests/llm-simple/**'
		],
		silent: false,
		reporters: ['default']
	}
});
```

**Purpose**: Runs standard unit tests WITHOUT making expensive LLM API calls.

#### LLM Tests (`vitest.config.llm.ts`)

**Location**: `/apps/web/vitest.config.llm.ts`

```typescript
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./vitest.setup.ts'],
		include: ['**/lib/tests/llm/**/*.test.ts'],
		testTimeout: 20000, // 20s for API calls
		maxConcurrency: 1, // Sequential to avoid rate limits
		silent: false
	}
});
```

**⚠️ WARNING**: This config runs tests that make **real API calls to OpenAI/DeepSeek** and **cost money**. Only run when modifying LLM prompts.

#### Setup File (`vitest.setup.ts`)

**Location**: `/apps/web/vitest.setup.ts`

**Key Features**:

- Imports `@testing-library/jest-dom` for DOM matchers
- Intelligent console suppression with pattern matching
- Debug mode support via `VITEST_DEBUG` env var
- Suppresses noise like "Error Logger Fallback", "Operation failed"

### Test Commands

```bash
# Standard unit tests (excludes LLM tests)
pnpm test              # Run once
pnpm test:watch        # Watch mode
pnpm test:ui           # Interactive UI
pnpm test:quiet        # Dot reporter (less noise)
pnpm test:silent       # Completely silent

# LLM tests (⚠️ COSTS MONEY)
pnpm test:llm          # Run once
pnpm test:llm:watch    # Watch mode
pnpm test:llm:verbose  # Verbose output
pnpm test:llm:fast     # Dot reporter

# Full validation
pnpm pre-push          # typecheck + test + lint + build
```

---

## What IS Tested - Detailed Breakdown

### 1. Brain Dump Processing ✅ (5 test files)

#### Test: `braindump-validation.test.ts`

**Location**: `/apps/web/src/lib/utils/braindump-validation.test.ts`

**What It Tests**:

- ✅ Dual endpoint validation (long vs short brain dumps)
- ✅ Short endpoint validation (project ID required)
- ✅ Input length checks (min/max)
- ✅ Content validation rules
- ✅ Edge cases: empty strings, whitespace only

**Key Test Cases**:

```typescript
describe('validateBrainDumpInput', () => {
	it('should accept valid long brain dump (> 50 chars)');
	it('should accept valid short brain dump with project ID');
	it('should reject short endpoint without project ID');
	it('should reject empty input');
	it('should reject input that is too long');
});
```

**Coverage**: ✅ **Excellent** - Validates all input rules for brain dump endpoints

---

#### Test: `brain-dump-processor.test.ts`

**Location**: `/apps/web/src/lib/utils/__tests__/brain-dump-processor.test.ts`

**What It Tests**:

- ✅ Brain dump parsing logic
- ✅ Project extraction from text
- ✅ Task extraction from text
- ✅ Context understanding

**Coverage**: 🟡 **Partial** - Tests basic parsing but needs expansion

---

#### Test: `braindump-ui-validation.test.ts`

**Location**: `/apps/web/src/lib/utils/__tests__/braindump-ui-validation.test.ts`

**What It Tests**:

- ✅ UI-level validation rules
- ✅ Character count validation
- ✅ Format validation before submission

**Coverage**: 🟢 **Good** - UI validation layer tested

---

#### Test: `brain-dump-integration-simple.test.ts`

**Location**: `/apps/web/src/lib/utils/__tests__/brain-dump-integration-simple.test.ts`

**What It Tests**:

- ✅ Simple integration scenarios
- ✅ End-to-end parsing flow (simplified)

**Coverage**: 🟡 **Partial** - Simplified integration tests

---

#### Test: `prompt-audit.test.ts`

**Location**: `/apps/web/src/lib/utils/__tests__/prompt-audit.test.ts`

**What It Tests**:

- ✅ Prompt template validation
- ✅ Prompt structure checking

**Coverage**: 🟢 **Good** - Prompt quality checks

---

### 2. LLM Prompt Testing ✅ (5 test files - **EXCELLENT**)

#### Test: `new-project-creation.test.ts` (⚠️ Costs Money)

**Location**: `/apps/web/src/lib/tests/llm/__tests__/new-project-creation.test.ts`

**Lines**: 400+ lines

**What It Tests** (with REAL OpenAI API calls):

**Small Projects (2-4 tasks)**:

```typescript
it('should create blog project with basic tasks', async () => {
	const result = await processNewProject(`
    I want to create a personal blog using SvelteKit...
  `);

	// Validates:
	// ✅ Project name extraction
	// ✅ Task count (2-4 expected)
	// ✅ Slug generation (lowercase, hyphenated)
	// ✅ Priority assignment
	// ✅ Task titles are actionable
});
```

**Large Projects (8+ tasks)**:

```typescript
it('should create ecommerce platform with comprehensive tasks', async () => {
	const result = await processNewProject(`
    Build a full-featured e-commerce platform with...
  `);

	// Validates:
	// ✅ Complex project structure
	// ✅ Multiple phases
	// ✅ Task count (8+ expected)
	// ✅ Dependency handling
	// ✅ Priority distribution
});
```

**Edge Cases**:

```typescript
it('should handle mixed content (code + text)', async () => {
	// ✅ Tests parsing with code snippets
});

it('should handle project references', async () => {
	// ✅ Tests @project-name references
});

it('should generate valid slugs', async () => {
	// ✅ Tests slug format (lowercase, hyphens)
});

it('should handle single task projects', async () => {
	// ✅ Tests minimal project structure
});
```

**What Makes This Excellent**:

- 🎯 Tests **real LLM output** (not mocked)
- 🎯 Validates **structure** (operations array, data shapes)
- 🎯 Validates **content quality** (task titles, priorities)
- 🎯 Covers **edge cases** (single task, mixed content, references)
- 🎯 Tests **slug generation** accuracy
- 🎯 Validates **task counts** (not too few, not too many)

**Coverage**: ✅ **EXCELLENT** - Comprehensive LLM validation

---

#### Test: `existing-project-updates.test.ts` (⚠️ Costs Money)

**Location**: `/apps/web/src/lib/tests/llm/__tests__/existing-project-updates.test.ts`

**What It Tests** (with REAL OpenAI API calls):

- ✅ Adding tasks to existing projects
- ✅ Updating project context
- ✅ Project reference resolution
- ✅ Incremental updates

**Key Test Cases**:

```typescript
it('should add tasks to existing project', async () => {
	// ✅ Tests appending tasks
	// ✅ Validates project ID reference
	// ✅ Checks phase assignment
});

it('should update project description', async () => {
	// ✅ Tests context updates
});
```

**Coverage**: ✅ **Excellent** - Updates thoroughly tested

---

#### Simplified LLM Tests (3 files)

**Location**: `/apps/web/src/lib/tests/llm-simple/__tests__/`

**Files**:

1. `minimal-test.test.ts` - Basic smoke tests
2. `new-project-creation.test.ts` - Simplified new project tests
3. `existing-project-updates.test.ts` - Simplified update tests

**Purpose**: Faster, cheaper tests for quick validation

**Coverage**: 🟢 **Good** - Simplified but still validates core functionality

---

### 3. Race Condition Prevention ✅ (2 test files - **EXCELLENT**)

#### Test: `project.store.test.ts` (⭐ EXEMPLARY)

**Location**: `/apps/web/src/lib/stores/project.store.test.ts`

**Lines**: 407 lines

**What It Tests**:

**Race Condition Scenarios**:

```typescript
it('should track update BEFORE API call', async () => {
	const orderOfOperations: string[] = [];

	mockService.trackUpdate = vi.fn((id) => {
		orderOfOperations.push(`trackUpdate:${id}`);
	});

	// Perform optimistic update
	const tempId = store.createProjectOptimistically(data);

	// Verify tracking happened BEFORE API call
	expect(orderOfOperations[0]).toBe(`trackUpdate:${tempId}`);
	expect(orderOfOperations[1]).toBe('apiCall');

	// ✅ Prevents race condition where API returns before tracking
});
```

**Optimistic Update Testing**:

```typescript
it('should handle optimistic project creation', async () => {
	// ✅ Tests temporary ID generation
	// ✅ Tests UI update before API response
	// ✅ Tests ID replacement after API success
	// ✅ Tests rollback on API failure
});

it('should prevent duplicate tracking IDs', async () => {
	// ✅ Tests ID uniqueness
	// ✅ Tests cleanup after success
});
```

**Real-Time Sync Testing**:

```typescript
it('should handle concurrent updates from multiple sources', async () => {
	// ✅ Tests Supabase real-time updates
	// ✅ Tests optimistic update + real-time sync
	// ✅ Tests conflict resolution
});
```

**Cleanup Testing**:

```typescript
it('should clean up tracking IDs after completion', async () => {
	// ✅ Tests memory cleanup
	// ✅ Tests no memory leaks
});
```

**What Makes This Exemplary**:

- 🏆 Tests **order of operations** (prevents race conditions)
- 🏆 Tests **optimistic updates** (UI responsiveness)
- 🏆 Tests **real-time sync** (Supabase integration)
- 🏆 Tests **cleanup** (no memory leaks)
- 🏆 Tests **concurrent scenarios** (multiple users)
- 🏆 **407 lines** of comprehensive coverage

**Coverage**: ✅ **EXCELLENT** - Gold standard for race condition testing

---

#### Test: `dashboardData.service.test.ts`

**Location**: `/apps/web/src/lib/services/dashboardData.service.test.ts`

**What It Tests**:

**Race Condition Prevention**:

```typescript
it('should capture project_id before state changes', async () => {
	let capturedProjectId: string | undefined;

	const optimisticUpdate = () => {
		capturedProjectId = store.getCurrentProjectId();
		// State change happens here
	};

	// ✅ Verifies data captured BEFORE state mutation
	expect(capturedProjectId).toBeDefined();
});
```

**Optimistic Updates**:

```typescript
it('should handle optimistic dashboard updates', async () => {
	// ✅ Tests dashboard data updates
	// ✅ Tests real-time sync with Supabase
});
```

**Coverage**: 🟢 **Good** - Focused race condition tests

---

### 4. Security Testing ✅ (1 test file - **EXCELLENT**)

#### Test: `server.test.ts` (Brain Dump Stream)

**Location**: `/apps/web/src/routes/api/braindumps/stream/server.test.ts`

**Lines**: 370 lines

**What It Tests**:

**DoS Prevention**:

```typescript
describe('DoS Prevention', () => {
	it('should reject payloads over 50KB', async () => {
		const hugePayload = 'a'.repeat(51 * 1024); // 51KB

		const response = await POST({
			request: createMockRequest({ content: hugePayload }),
			locals: mockLocals
		});

		// ✅ Verifies 413 Payload Too Large
		expect(response.status).toBe(413);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining('too large')
		});
	});

	it('should accept payloads under 50KB', async () => {
		const validPayload = 'a'.repeat(49 * 1024); // 49KB

		// ✅ Verifies acceptance
		expect(response.status).toBe(200);
	});
});
```

**Input Validation**:

```typescript
describe('Input Validation', () => {
	it('should reject empty content', async () => {
		// ✅ Tests empty string rejection
	});

	it('should reject whitespace-only content', async () => {
		// ✅ Tests whitespace validation
	});

	it('should sanitize HTML input', async () => {
		// ✅ Tests XSS prevention
	});

	it('should validate content length', async () => {
		// ✅ Tests min/max length
	});
});
```

**Authentication**:

```typescript
describe('Authentication', () => {
	it('should reject unauthenticated requests', async () => {
		const response = await POST({
			request: mockRequest,
			locals: { user: null } // No user
		});

		// ✅ Verifies 401 Unauthorized
		expect(response.status).toBe(401);
	});

	it('should accept authenticated requests', async () => {
		// ✅ Verifies session validation
	});
});
```

**Rate Limiting**:

```typescript
describe('Rate Limiting', () => {
	it('should enforce rate limits', async () => {
		// ✅ Tests rate limit enforcement
		// ✅ Tests 429 Too Many Requests
	});
});
```

**What Makes This Excellent**:

- 🛡️ **DoS prevention** (content length limits)
- 🛡️ **Input validation** (sanitization, format checks)
- 🛡️ **Authentication** (session validation)
- 🛡️ **Rate limiting** (abuse prevention)
- 🛡️ **370 lines** of security-focused tests

**Coverage**: ✅ **EXCELLENT** - Comprehensive security testing

---

### 5. Other Service Tests 🟢 (3 test files)

#### Test: `google-oauth-service.test.ts`

**Location**: `/apps/web/src/lib/services/__tests__/google-oauth-service.test.ts`

**What It Tests**:

- ✅ OAuth state encoding/decoding
- ✅ Calendar state payload handling
- ✅ PKCE flow setup
- ✅ Token exchange

**Coverage**: 🟢 **Good** - OAuth flows tested

---

#### Test: `recurrence-pattern.test.ts`

**Location**: `/apps/web/src/lib/services/__tests__/recurrence-pattern.test.ts`

**What It Tests**:

- ✅ Recurring task pattern generation
- ✅ RRULE string generation
- ✅ Frequency handling (daily, weekly, monthly)
- ✅ End date calculations

**Coverage**: 🟢 **Good** - Recurring task logic tested

---

#### Test: `task-synthesis-prompt.test.ts`

**Location**: `/apps/web/src/lib/services/synthesis/__tests__/task-synthesis-prompt.test.ts`

**What It Tests**:

- ✅ Task synthesis prompt generation
- ✅ Prompt template formatting
- ✅ Context building for LLM

**Coverage**: 🟢 **Good** - Prompt generation tested

---

#### Test: `phase-generation-notification.bridge.test.ts`

**Location**: `/apps/web/src/lib/services/__tests__/phase-generation-notification.bridge.test.ts`

**What It Tests**:

- ✅ Phase generation notification integration
- ✅ Event propagation
- ✅ Notification bridge logic

**Coverage**: 🟢 **Good** - Notification bridge tested

---

### 6. Utility Tests 🟢 (9 test files)

#### Test: `event-bus.test.ts` (⭐ EXEMPLARY)

**Location**: `/apps/web/src/lib/utils/event-bus.test.ts`

**What It Tests**:

**Core Functionality**:

```typescript
it('should subscribe and emit events', () => {
	const callback = vi.fn();
	eventBus.subscribe('testEvent', callback);
	eventBus.emit('testEvent', { data: 'test' });

	expect(callback).toHaveBeenCalledWith({ data: 'test' });
});
```

**Edge Cases**:

```typescript
it('should handle unsubscribe during emit', () => {
	// ✅ Tests unsubscribe called inside callback
	// ✅ Tests no errors thrown
});

it('should handle errors in callbacks', () => {
	// ✅ Tests error isolation
	// ✅ Tests other callbacks still run
});

it('should handle rapid events', () => {
	// ✅ Tests performance
	// ✅ Tests no event loss
});
```

**Real-World Scenarios**:

```typescript
it('should handle concurrent updates', () => {
	// ✅ Tests multiple simultaneous emits
	// ✅ Tests callback ordering
});
```

**Coverage**: ✅ **Excellent** - Comprehensive edge case coverage

---

#### Test: `reference-resolution.test.ts`

**Location**: `/apps/web/src/lib/utils/__tests__/reference-resolution.test.ts`

**What It Tests**:

- ✅ @project-name reference parsing
- ✅ Reference resolution to project IDs
- ✅ Multiple reference handling
- ✅ Invalid reference handling

**Coverage**: 🟢 **Good**

---

#### Test: `project-ref-resolution.test.ts`

**Location**: `/apps/web/src/lib/utils/__tests__/project-ref-resolution.test.ts`

**What It Tests**:

- ✅ Project-specific reference resolution
- ✅ Slug-based lookup
- ✅ Fuzzy matching

**Coverage**: 🟢 **Good**

---

#### Test: `heading-normalization.test.ts`

**Location**: `/apps/web/src/lib/utils/__tests__/heading-normalization.test.ts`

**What It Tests**:

- ✅ Markdown heading parsing
- ✅ Heading level normalization
- ✅ Heading text extraction

**Coverage**: 🟢 **Good**

---

#### Test: `operations-executor.test.ts` (🌟 GOOD)

**Location**: `/apps/web/src/lib/utils/operations/operations-executor.test.ts`

**What It Tests**:

**CRUD Operations**:

```typescript
describe('Create Operations', () => {
	it('should create project', async () => {
		// ✅ Tests project creation
		// ✅ Tests data validation
	});

	it('should create task with project reference', async () => {
		// ✅ Tests foreign key relationships
	});
});

describe('Update Operations', () => {
	it('should update with ID in data field', async () => {
		// ✅ Tests update by ID
	});

	it('should update with conditions field', async () => {
		// ✅ Tests conditional updates
	});
});
```

**Rollback Functionality** (⭐ Important):

```typescript
describe('Rollback', () => {
  it('should rollback all operations when one fails', async () => {
    const operations = [
      { type: 'create', table: 'projects', data: {...} },
      { type: 'create', table: 'tasks', data: {...} },
      { type: 'create', table: 'notes', data: {...} } // This fails
    ];

    let deleteCalls: string[] = [];
    mockSupabase.delete = vi.fn((table) => {
      deleteCalls.push(table);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    try {
      await executor.executeOperations({ operations });
    } catch (error) {
      // ✅ Verifies rollback occurred
      expect(deleteCalls).toContain('projects');
      expect(deleteCalls).toContain('tasks');
      // ✅ Verifies LIFO order (last created first deleted)
    }
  });

  it('should rollback in reverse order (LIFO)', async () => {
    // ✅ Tests Last In First Out deletion
  });
});
```

**Coverage**: 🟢 **Good** - CRUD + rollback tested

---

### 7. Store Tests 🟢 (2 test files)

#### Test: `notification.store.test.ts`

**Location**: `/apps/web/src/lib/stores/__tests__/notification.store.test.ts`

**What It Tests**:

- ✅ Notification store basic operations
- ✅ Notification addition/removal
- ✅ Notification state management

**Coverage**: 🟡 **Partial** - Needs Svelte 5 runes expansion

---

### 8. Component Tests 🟡 (2 test files)

#### Test: `ArchetypeStep.test.ts`

**Location**: `/apps/web/src/lib/components/onboarding-v2/ArchetypeStep.test.ts`

**What It Tests**:

- ✅ Component rendering
- ✅ Button states (enabled/disabled)
- ✅ Service method calls
- ✅ User interactions (clicks)
- ✅ Props handling

**Example**:

```typescript
it('renders with user ID', () => {
	render(ArchetypeStep, {
		props: { userId: 'test-id', onNext: vi.fn() }
	});

	expect(screen.getByText('Select Your Archetype')).toBeTruthy();
});

it('handles button click', async () => {
	const mockCallback = vi.fn();
	render(ArchetypeStep, {
		props: { userId: 'test-id', onNext: mockCallback }
	});

	const button = screen.getByRole('button', { name: /next/i });
	await fireEvent.click(button);

	expect(mockCallback).toHaveBeenCalled();
});
```

**Coverage**: 🟢 **Good** - Component interaction tested

---

#### Test: `TaskMappingView.simple.test.ts`

**Location**: `/apps/web/src/lib/components/synthesis/__tests__/TaskMappingView.simple.test.ts`

**What It Tests**:

- ✅ Task mapping UI logic
- ✅ Task display

**Coverage**: 🟡 **Partial** - Simple test only

---

### 9. Page Tests 🟡 (1 test file)

#### Test: `authenticated-pages.test.ts`

**Location**: `/apps/web/src/routes/__tests__/authenticated-pages.test.ts`

**What It Tests**:

- ✅ Authentication requirements for protected pages
- ✅ Redirect behavior for unauthenticated users

**Coverage**: 🟡 **Partial** - Only auth checks, not rendering

---

### 10. Integration Tests 🟢 (1 test file)

#### Test: `synthesis-flow.test.ts`

**Location**: `/apps/web/tests/integration/synthesis-flow.test.ts`

**Lines**: 387 lines

**What It Tests**:

**Complete Synthesis Flow**:

```typescript
describe('Project Synthesis Integration', () => {
	it('should generate prompt from tasks', () => {
		// ✅ Tests prompt generation
		// ✅ Tests task categorization
		// ✅ Tests context building
	});

	it('should process operations', () => {
		// ✅ Tests operation parsing
		// ✅ Tests operation validation
	});

	it('should consolidate operations', () => {
		// ✅ Tests duplicate removal
		// ✅ Tests operation merging
	});

	it('should sequence operations correctly', () => {
		// ✅ Tests operation ordering
		// ✅ Tests dependency resolution
	});
});
```

**Coverage**: 🟢 **Good** - End-to-end synthesis tested

---

### 11. Admin API Tests 🟢 (1 test file)

#### Test: `server.test.ts` (Admin Users)

**Location**: `/apps/web/src/routes/api/admin/users/server.test.ts`

**What It Tests**:

- ✅ Admin user management endpoints
- ✅ Admin authorization
- ✅ User CRUD operations

**Coverage**: 🟢 **Good** - Admin endpoints tested

---

## What is NOT Tested - Critical Gaps

### 1. Brain Dump System 🔴 (Major Gaps)

#### Services (3 files, 0 tests)

**`braindump-api.service.ts`** (332 lines) - 🔴 **NO TESTS**

- Stream processing with SSE
- Draft management
- Audio transcription
- Background job coordination

**`braindump-background.service.ts`** (621 lines) - 🔴 **NO TESTS** (⚠️ CRITICAL)

- Background job orchestration
- Auto-accept flow (parse + execute in single call)
- Session storage persistence
- Job retry logic with backoff
- Complex state machine

**`braindump-status.service.ts`** - 🔴 **NO TESTS**

- Real-time status updates via Supabase
- Draft status management

#### Components (18 files, 0 tests)

**`BrainDumpModal.svelte`** - 🔴 **NO TESTS** (⚠️ CRITICAL)

- Main brain dump interface
- Modal lifecycle
- Recording toggle
- Submit logic

**`RecordingView.svelte`** - 🔴 **NO TESTS**

- Voice recording UI
- Audio upload
- Transcription display

**`OperationsList.svelte`** - 🔴 **NO TESTS**

- Operations preview
- Accept/reject actions
- Operation editing

**`ProcessingModal.svelte`** - 🔴 **NO TESTS**

- Processing feedback
- Progress display
- Error handling UI

**15 other brain dump components** - 🔴 **NO TESTS**

- Various brain dump UI components

**Risk**: Core user journey completely untested

---

### 2. Calendar Integration 🔴 (3,934 lines, 0 tests - ⚠️ CRITICAL)

#### `calendar-service.ts` (1,661 lines) - 🔴 **NO TESTS**

**Untested Functionality**:

- Google Calendar API integration (authentication, token refresh)
- Event CRUD operations (create, read, update, delete)
- Recurring event handling (RRULE generation)
- Bulk operations (schedule, update, delete multiple events)
- Project calendar creation/sharing
- Timezone handling (critical!)
- Connection failure handling
- Retry logic
- Error recovery

**Risk Level**: 🔴 **CRITICAL**

- External API integration
- Complex timezone logic
- Financial impact (API costs)
- User data sync issues

---

#### `calendar-analysis.service.ts` (1,273 lines) - 🔴 **NO TESTS**

**Untested Functionality**:

- AI-powered calendar analysis
- Project suggestion generation from events
- Event filtering (declined, personal, work)
- Confidence scoring for suggestions
- Task deduplication with existing projects
- LLM integration for pattern detection

**Risk Level**: 🔴 **CRITICAL**

- AI/ML pipeline
- Data quality issues
- False positives/negatives

---

#### `calendar-webhook-service.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- Real-time webhook processing
- Event sync status tracking
- Webhook signature validation

**Risk Level**: 🔴 **HIGH**

- Security vulnerabilities (signature bypass)
- Sync failures

---

#### `calendar-webhook-check.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- Webhook health monitoring
- Connection validation

**Risk Level**: 🟡 **MEDIUM**

---

#### `project-calendar.service.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- Project-specific calendar operations
- Calendar sharing

**Risk Level**: 🟡 **MEDIUM**

---

### 3. Phase Generation System 🔴 (6 files, 0 tests - ⚠️ CRITICAL)

#### `orchestrator.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- Strategy selection logic
- Phase generation coordination
- Strategy switching

**Risk Level**: 🔴 **HIGH**

---

#### Strategy Files (4 files, 0 tests)

**`strategies/base-strategy.ts`** - 🔴 **NO TESTS**

- Abstract base class
- Common phase generation logic

**`strategies/phases-only.strategy.ts`** - 🔴 **NO TESTS**

- Simple phase creation
- Task distribution

**`strategies/schedule-in-phases.strategy.ts`** - 🔴 **NO TESTS**

- Calendar-aware phase creation
- Task scheduling

**`strategies/calendar-optimized.strategy.ts`** - 🔴 **NO TESTS**

- Advanced scheduling logic
- Conflict resolution
- Calendar slot finding

**Risk Level**: 🔴 **CRITICAL**

- Complex business logic
- User experience impact

---

### 4. Project Management 🔴 (Core Domain - 0 tests)

#### `projectService.ts` (546 lines) - 🔴 **NO TESTS** (⚠️ CRITICAL)

**Untested Functionality**:

- Project CRUD operations
- Task management
- Phase operations
- Note handling
- Calendar sync
- Caching layer
- Real-time updates

**Risk Level**: 🔴 **CRITICAL**

- Core domain model
- Data corruption risk

---

#### `projectData.service.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- Complex data fetching
- Project context aggregation

**Risk Level**: 🔴 **HIGH**

---

#### `project-synthesis.service.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- AI-powered project synthesis
- Task grouping
- Phase generation

**Risk Level**: 🔴 **HIGH**

---

#### `realtimeProject.service.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- Real-time project updates
- Supabase subscription management

**Risk Level**: 🔴 **HIGH**

---

### 5. Daily Brief System 🔴 (7 files, 0 tests)

All daily brief services are untested:

- `dailyBrief/generator.ts` - Brief generation
- `dailyBrief/emailSender.ts` - Email sending
- `dailyBrief/mainBriefGenerator.ts` - Main brief
- `dailyBrief/projectBriefGenerator.ts` - Project briefs
- `dailyBrief/repository.ts` - Data access
- `dailyBrief/streamHandler.ts` - Stream handling
- `dailyBrief/validator.ts` - Validation
- `realtimeBrief.service.ts` - Real-time updates

**Risk Level**: 🔴 **HIGH**

---

### 6. Notification System 🔴 (15 files, minimal tests)

**Components (10+ files, 0 tests)**:

- `NotificationStack.svelte` - Main container
- `NotificationModal.svelte` - Modal display
- `MinimizedNotification.svelte` - Minimized state
- 7+ type-specific notification components

**Store (1 file, partial tests)**:

- `notification.store.ts` - ✅ Has basic tests but needs Svelte 5 runes coverage

**Risk Level**: 🟡 **MEDIUM** (UI, not critical data)

---

### 7. Payment Processing 🔴 (0 tests - ⚠️ CRITICAL)

#### `stripe-service.ts` - 🔴 **NO TESTS**

**Untested Functionality**:

- Payment flows
- Subscription management
- Webhook signature validation
- Webhook event processing
- Error handling
- Retry logic

**Risk Level**: 🔴 **CRITICAL**

- Financial transactions
- Security vulnerabilities
- Regulatory compliance

---

### 8. API Endpoints 🔴 (151/153 untested - 99%)

**Brain Dump Endpoints** (4 routes, 1 tested):

- ✅ `braindumps/stream/+server.ts` - TESTED (security)
- 🔴 `braindumps/+server.ts` - NO TESTS (GET/POST)
- 🔴 `braindumps/[id]/+server.ts` - NO TESTS
- 🔴 `braindumps/generate/+server.ts` - NO TESTS
- 🔴 `braindumps/draft/+server.ts` - NO TESTS

**Calendar Endpoints** (5+ routes, 0 tested):

- 🔴 `calendar/+server.ts` - NO TESTS
- 🔴 `calendar/analyze/+server.ts` - NO TESTS (AI analysis)
- 🔴 `calendar/process/+server.ts` - NO TESTS
- 🔴 `calendar/webhook/+server.ts` - NO TESTS (⚠️ CRITICAL)
- 🔴 `calendar/projects/+server.ts` - NO TESTS

**Project Endpoints** (10+ routes, 0 tested):

- 🔴 `projects/+server.ts` - NO TESTS (CRUD)
- 🔴 `projects/[id]/+server.ts` - NO TESTS
- 🔴 `projects/[id]/calendar/+server.ts` - NO TESTS
- 🔴 `projects/[id]/calendar/sync/+server.ts` - NO TESTS
- 🔴 10+ more project routes - NO TESTS

**Task Endpoints** (8+ routes, 0 tested):

- 🔴 `tasks/+server.ts` - NO TESTS (CRUD)
- 🔴 `tasks/[id]/+server.ts` - NO TESTS
- 🔴 8+ more task routes - NO TESTS

**Daily Brief Endpoints** (3 routes, 0 tested):

- 🔴 `daily-briefs/generate/+server.ts` - NO TESTS
- 🔴 `daily-briefs/+server.ts` - NO TESTS
- 🔴 `daily-briefs/status/+server.ts` - NO TESTS

**Other Endpoints** (~120 routes, 0 tested):

- SMS, auth, admin, beta, templates, etc.

**Risk Level**: 🔴 **CRITICAL**

- Input validation gaps
- Authorization bypass potential
- SQL injection risk
- Error message information leaks

---

### 9. UI Components 🔴 (218/220 untested - 99%)

**Only 2 components tested**:

- ✅ `onboarding-v2/ArchetypeStep.svelte`
- ✅ `synthesis/TaskMappingView.svelte` (partial)

**218 untested components** including:

- 28 UI components (Button, Modal, FormModal, etc.)
- 18 brain dump components
- 10+ notification components
- Project management UI
- Task management UI
- Dashboard components
- Settings components
- Calendar components

**Risk Level**: 🟡 **MEDIUM** (UI regressions, not data corruption)

---

### 10. Stores 🔴 (12/14 untested - 86%)

**Tested**:

- ✅ `project.store.ts` (excellent)
- ✅ `notification.store.ts` (partial)

**Untested**:

- 🔴 `brain-dump-v2.store.ts` - Main brain dump state (⚠️ HIGH)
- 🔴 `backgroundJobs.ts` - Job tracking (HIGH)
- 🔴 `briefPreferences.ts` - Brief preferences
- 🔴 `brainDumpPreferences.ts` - Brain dump prefs
- 🔴 `modal.store.ts` - Modal state
- 🔴 `toast.store.ts` - Toast notifications
- 🔴 `userContext.ts` - User context (HIGH)
- 🔴 `dashboard.store.ts` - Dashboard state
- 🔴 `schedulingStore.ts` - Scheduling state
- 🔴 `searchStore.ts` - Search state
- 🔴 `unifiedBriefGeneration.store.ts` - Brief generation
- 🔴 `navigation.store.ts` - Navigation

**Risk Level**: 🔴 **HIGH** (state management with Svelte 5 runes)

---

### 11. Other Services 🔴 (62+ services, 6 tested - 90% untested)

**Critical Untested Services**:

- Email service
- SMS service
- Onboarding services (2 files)
- Prompt template service
- All prompt services in `/services/prompts/core/` (~15+ files)

**Risk Level**: 🔴 **HIGH**

---

### 12. Utilities 🔴 (51+ utilities, 9 tested - 85% untested)

**Critical Untested Utilities**:

- `api-client.ts` - HTTP client
- `api-client-helpers.ts` - API helpers
- `api-response.ts` - Response formatting
- `sse-processor.ts` - Server-sent events
- `date-utils.ts` - Date formatting
- `timezone.ts` - Timezone handling
- `markdown.ts` - Markdown processing
- `auth.ts` - Auth utilities
- `llm-utils.ts` - LLM utilities
- 40+ more utilities

**Risk Level**: 🟡 **MEDIUM**

---

## Test File Deep Dive

See the [What IS Tested](#what-is-tested---detailed-breakdown) section above for comprehensive details on each test file including:

- Lines of code
- Specific test cases
- What functionality is covered
- Coverage assessment
- Example code snippets

---

## Coverage by Feature Area

### Brain Dump Feature

| Component            | Status       | Test Coverage                           |
| -------------------- | ------------ | --------------------------------------- |
| **Processing Logic** |              |                                         |
| Validation           | ✅ Excellent | `braindump-validation.test.ts`          |
| Processor            | 🟡 Partial   | `brain-dump-processor.test.ts`          |
| UI Validation        | 🟢 Good      | `braindump-ui-validation.test.ts`       |
| Integration          | 🟡 Partial   | `brain-dump-integration-simple.test.ts` |
| Prompt Audit         | 🟢 Good      | `prompt-audit.test.ts`                  |
| **Services**         |              |                                         |
| API Service          | 🔴 None      | -                                       |
| Background Service   | 🔴 None      | ⚠️ 621 lines untested                   |
| Status Service       | 🔴 None      | -                                       |
| **UI Components**    |              |                                         |
| BrainDumpModal       | 🔴 None      | ⚠️ Critical gap                         |
| RecordingView        | 🔴 None      | -                                       |
| OperationsList       | 🔴 None      | -                                       |
| ProcessingModal      | 🔴 None      | -                                       |
| 14 other components  | 🔴 None      | -                                       |
| **API Endpoints**    |              |                                         |
| Stream endpoint      | ✅ Excellent | Security tested (370 lines)             |
| Other endpoints (4)  | 🔴 None      | -                                       |
| **LLM Prompts**      |              |                                         |
| New project creation | ✅ Excellent | Real API validation (400+ lines)        |
| Existing updates     | ✅ Excellent | Real API validation                     |

**Overall Brain Dump Coverage**: 🟡 **30%** (validation good, services/UI untested)

---

### Calendar Feature

| Component                    | Status  | Test Coverage           |
| ---------------------------- | ------- | ----------------------- |
| **Services**                 |         |                         |
| calendar-service.ts          | 🔴 None | ⚠️ 1,661 lines untested |
| calendar-analysis.service.ts | 🔴 None | ⚠️ 1,273 lines untested |
| calendar-webhook-service.ts  | 🔴 None | -                       |
| calendar-webhook-check.ts    | 🔴 None | -                       |
| project-calendar.service.ts  | 🔴 None | -                       |
| **API Endpoints**            |         |                         |
| All 5+ endpoints             | 🔴 None | ⚠️ Critical gap         |
| **UI Components**            |         |                         |
| All calendar components      | 🔴 None | -                       |

**Overall Calendar Coverage**: 🔴 **0%** (⚠️ CRITICAL GAP - 3,934 lines untested)

---

### Project Management Feature

| Component                    | Status       | Test Coverage              |
| ---------------------------- | ------------ | -------------------------- |
| **Services**                 |              |                            |
| projectService.ts            | 🔴 None      | ⚠️ 546 lines untested      |
| projectData.service.ts       | 🔴 None      | -                          |
| project-synthesis.service.ts | 🔴 None      | -                          |
| realtimeProject.service.ts   | 🔴 None      | -                          |
| project-calendar.service.ts  | 🔴 None      | -                          |
| **Stores**                   |              |                            |
| project.store.ts             | ✅ Excellent | 407 lines, race conditions |
| **Phase Generation**         |              |                            |
| orchestrator.ts              | 🔴 None      | -                          |
| All strategies (4)           | 🔴 None      | ⚠️ Critical gap            |
| **API Endpoints**            |              |                            |
| All 10+ endpoints            | 🔴 None      | -                          |
| **UI Components**            |              |                            |
| ProjectCard                  | 🔴 None      | -                          |
| ProjectHeader                | 🔴 None      | -                          |
| TaskList                     | 🔴 None      | -                          |
| PhaseManager                 | 🔴 None      | -                          |
| Others                       | 🔴 None      | -                          |

**Overall Project Management Coverage**: 🔴 **5%** (only store tested)

---

### Daily Brief Feature

| Component                       | Status  | Test Coverage |
| ------------------------------- | ------- | ------------- |
| **Services**                    |         |               |
| All 7 services                  | 🔴 None | -             |
| **API Endpoints**               |         |               |
| All 3 endpoints                 | 🔴 None | -             |
| **Stores**                      |         |               |
| unifiedBriefGeneration.store.ts | 🔴 None | -             |
| briefPreferences.ts             | 🔴 None | -             |

**Overall Daily Brief Coverage**: 🔴 **0%**

---

### Notification Feature

| Component             | Status     | Test Coverage    |
| --------------------- | ---------- | ---------------- |
| **Store**             |            |                  |
| notification.store.ts | 🟡 Partial | Basic tests only |
| **Components**        |            |                  |
| All 10+ components    | 🔴 None    | -                |

**Overall Notification Coverage**: 🟡 **10%**

---

### Payment Feature

| Component             | Status  | Test Coverage   |
| --------------------- | ------- | --------------- |
| **Services**          |         |                 |
| stripe-service.ts     | 🔴 None | ⚠️ Critical gap |
| **API Endpoints**     |         |                 |
| All payment endpoints | 🔴 None | ⚠️ Critical gap |

**Overall Payment Coverage**: 🔴 **0%** (⚠️ CRITICAL - financial transactions)

---

## Recommendations

### Immediate Actions (Week 1-2)

**Priority**: P0 - Critical Production Risks

1. **Add Calendar Service Tests** (16 hours)
    - Test Google Calendar API operations (mocked)
    - Test timezone conversions
    - Test RRULE generation
    - Test error handling and retries

2. **Add Calendar Analysis Tests** (12 hours)
    - Test AI analysis pipeline
    - Test event filtering
    - Test suggestion generation
    - Test confidence scoring

3. **Add Phase Generation Tests** (12 hours)
    - Test orchestrator strategy selection
    - Test each strategy independently
    - Test calendar-aware scheduling
    - Test conflict resolution

4. **Add Project Service Tests** (10 hours)
    - Test CRUD operations
    - Test cache behavior
    - Test real-time updates

5. **Add Brain Dump Background Service Tests** (10 hours)
    - Test auto-accept flow
    - Test session storage
    - Test retry logic
    - Test state transitions

### Short-Term Actions (Week 3-5)

**Priority**: P1 - High Production Risk

6. **Add Critical API Endpoint Tests** (20 hours)
    - Test calendar endpoints (5 routes)
    - Test project endpoints (10 routes)
    - Test task endpoints (8 routes)
    - Test daily brief endpoints (3 routes)
    - Focus on: validation, auth, error handling

7. **Add Stripe Service Tests** (8 hours)
    - Test payment flows
    - Test webhook signature validation
    - Mock Stripe API

8. **Add Brain Dump UI Component Tests** (16 hours)
    - Test BrainDumpModal (critical)
    - Test RecordingView
    - Test OperationsList
    - Use Svelte Testing Library

9. **Add Store Tests** (12 hours)
    - Test brain-dump-v2.store (critical)
    - Test backgroundJobs.store
    - Test userContext.store
    - Focus on Svelte 5 runes reactivity

### Medium-Term Actions (Week 6-8)

**Priority**: P2 - Quality & Completeness

10. **Add Email/SMS Service Tests** (8 hours)
11. **Add Daily Brief Service Tests** (12 hours)
12. **Add Notification Component Tests** (16 hours)
13. **Add Utility Tests** (20 hours)
14. **Add UI Component Tests** (30 hours)

### Long-Term Actions (Month 2+)

15. **Set Up E2E Testing with Playwright** (8 hours)
16. **Add Critical User Journey Tests** (20 hours)
    - Brain dump → Project creation
    - Calendar sync → Task scheduling
    - Payment flow
17. **Add Visual Regression Testing** (Chromatic/Percy)
18. **Add Accessibility Testing** (axe-core)
19. **Add Performance Testing** (bundle size, load times)

---

## Related Documentation

- **Master Testing Guide**: [/docs/testing/README.md](./README.md)
- **Coverage Matrix**: [/docs/testing/COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md)
- **Testing Checklist**: [/apps/web/docs/development/TESTING_CHECKLIST.md](../../apps/web/docs/development/TESTING_CHECKLIST.md)
- **Research Document**: [/thoughts/shared/research/2025-10-06_18-44-32_testing-infrastructure-audit.md](../../thoughts/shared/research/2025-10-06_18-44-32_testing-infrastructure-audit.md)

---

## Quick Reference

### Run Tests

```bash
# Standard tests
cd apps/web
pnpm test              # All unit tests
pnpm test:watch        # Watch mode

# LLM tests (⚠️ costs money)
pnpm test:llm          # Real API calls

# Full validation
pnpm pre-push          # typecheck + test + lint + build
```

### Test File Locations

**Standard Tests**:

- `/apps/web/src/lib/services/__tests__/*.test.ts`
- `/apps/web/src/lib/utils/__tests__/*.test.ts`
- `/apps/web/src/lib/stores/__tests__/*.test.ts`
- `/apps/web/src/lib/components/**/*.test.ts`
- `/apps/web/src/routes/**/*.test.ts`

**LLM Tests**:

- `/apps/web/src/lib/tests/llm/__tests__/*.test.ts`
- `/apps/web/src/lib/tests/llm-simple/__tests__/*.test.ts`

**Integration Tests**:

- `/apps/web/tests/integration/*.test.ts`

---

**Last Updated**: 2025-10-06
**Next Review**: 2025-11-06
**Maintainer**: Development Team
