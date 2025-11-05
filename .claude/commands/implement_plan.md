# Implement Plan - BuildOS Platform

You are implementing approved technical plans in the BuildOS platform. You understand the architecture, conventions, and quality standards required.

## Initial Setup

When invoked with a plan path:

```
📋 BuildOS Plan Implementation

Reading plan and understanding context...
[Then provide a summary of what you're about to implement]
```

If no plan provided, ask: "Please provide the path to the implementation plan document."

## Pre-Implementation Checklist

Before starting ANY implementation:

1. **Read the plan completely** - Note phases, success criteria, and any completed checkmarks
2. **Read referenced tickets/docs** - Get full context (use full reads, no limit/offset)
3. **Check current state** - Verify assumptions in the plan still hold
4. **Review relevant docs**:
    - UI work? Read `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md`
    - API work? Read `/apps/web/docs/technical/api/README.md`
    - Worker jobs? Read `/apps/worker/docs/README.md`
    - Database? Read `/packages/shared-types/src/database.schema.ts`
5. **Create implementation todo list** using TodoWrite

## Implementation Phases

### Phase 1: Environment Verification

```bash
# Verify clean working state
git status
git pull origin main

# Ensure dependencies are current
pnpm install

# Verify development environment
pnpm dev --filter=[affected-app]  # Should start without errors
```

### Phase 2: Incremental Implementation

For each phase in the plan:

1. **Implement the changes**:
    - Follow BuildOS conventions strictly
    - Use Svelte 5 runes ($state, $derived, $effect) for components
    - Ensure dark mode support (dark: prefixes)
    - Maintain mobile responsiveness
    - Use ApiResponse wrapper for all API routes

2. **Verify as you go**:

    ```bash
    # After each significant change
    pnpm typecheck --filter=[app]
    pnpm lint:fix --filter=[app]

    # After completing a phase
    pnpm test:run --filter=[app]
    ```

3. **Update plan progress**:
    - Check off completed items in the plan file
    - Note any deviations or issues encountered

### Phase 3: BuildOS-Specific Patterns

**For Web App Features:**

```typescript
// Component with Svelte 5 runes
<script lang="ts">
  import { Card, CardHeader, CardBody } from '$lib/components/ui/card';
  import type { Project } from '@buildos/shared-types';

  let projects = $state<Project[]>([]);
  let selectedProject = $state<Project | null>(null);

  let projectCount = $derived(projects.length);

  $effect(() => {
    // Side effects here
  });
</script>

<div class="container mx-auto px-4 dark:bg-gray-900">
  <!-- Mobile-first, responsive design -->
</div>
```

**For API Routes:**

```typescript
// +server.ts
import { apiResponse, apiError } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const supabase = locals.supabase; // Always use locals.supabase

	try {
		// Implementation
		return apiResponse({ success: true, data });
	} catch (error) {
		return apiError('Operation failed', 500);
	}
};
```

**For Worker Jobs:**

```typescript
// jobs/processTask.ts
import { createAdminSupabaseClient } from '../lib/supabase';
import type { Job } from 'bullmq';

export async function processTask(job: Job) {
	const supabase = createAdminSupabaseClient();
	// Implementation following worker patterns
}
```

### Phase 4: Quality Assurance

After implementing each major section:

1. **Run comprehensive checks**:

    ```bash
    # Full validation suite
    pnpm pre-push --filter=[app]  # Runs typecheck, test, lint, build
    ```

2. **Test critical paths**:
    - User flows affected by changes
    - API endpoints modified
    - Background job processing
    - Mobile and desktop views
    - Light and dark modes

3. **Document verification**:
    - Can another developer understand what changed?
    - Are success criteria clearly met?
    - Have you updated relevant documentation?

## Handling Mismatches

When the plan doesn't match reality:

```markdown
## Implementation Deviation

**Phase**: [N]
**Expected**: [What plan specified]
**Found**: [Actual situation]
**Impact**: [How this affects implementation]

**Proposed Solution**:
[Your recommended approach]

**Reasoning**:
[Why this is better given current state]

Should I proceed with this approach? (y/n)
```

## Progress Tracking

Maintain visibility of progress:

1. **Update todos** continuously
2. **Update plan checkmarks** after each completed section
3. **Communicate blockers** immediately
4. **Document decisions** in implementation notes

## Post-Implementation

1. **Update documentation**:
    - Feature docs: `/apps/[app]/docs/features/[feature]/`
    - Component docs if UI changed
    - API docs if endpoints modified
    - Mark with completion status and date

2. **Create summary**:

    ```markdown
    ## Implementation Complete

    **Plan**: [plan file path]
    **Duration**: [time taken]
    **Files Modified**: [count]
    **Tests Passing**: ✅

    **Key Changes**:

    - [Major change 1]
    - [Major change 2]

    **Verification Steps**:

    1. [How to test feature 1]
    2. [How to test feature 2]

    **Documentation Updated**:

    - [Doc 1 path]
    - [Doc 2 path]
    ```

## Quick Reference

| Task            | Command/Path                                                 |
| --------------- | ------------------------------------------------------------ |
| Start dev       | `pnpm dev --filter=[app]`                                    |
| Type check      | `pnpm typecheck --filter=[app]`                              |
| Test            | `pnpm test:run --filter=[app]`                               |
| Full validation | `pnpm pre-push --filter=[app]`                               |
| Style guide     | `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md` |
| API patterns    | `/apps/web/docs/technical/api/`                              |
| Database schema | `/packages/shared-types/src/database.schema.ts`              |
