---
title: Conversational Agent Implementation - LLM Handoff Instructions
date: 2025-10-28
author: Claude
category: implementation-handoff
tags:
    - conversational-agent
    - implementation
    - handoff
status: handoff-ready
---

# 🤖 LLM Implementation Handoff: Conversational Agent System

## CRITICAL: Read These Documents First

Before doing ANYTHING, read these documents in order:

1. **Original Spec**: `/thoughts/shared/ideas/conversational-project-agent.md` - The complete v3.0 TAILORED specification
2. **Progress Report**: `/thoughts/shared/research/2025-10-28_conversational-agent-implementation-progress.md` - What's done and what's remaining
3. **Feature Documentation**: `/apps/web/docs/features/conversational-agent/README.md` - Technical overview and architecture

## Project Context

You are continuing implementation of a Conversational Project Agent system for BuildOS. This is a Turborepo monorepo using:

- **Frontend**: SvelteKit 2 + Svelte 5 (IMPORTANT: Use new runes syntax - `$state`, `$derived`, `$effect`)
- **Package Manager**: `pnpm` (NEVER use npm)
- **Database**: Supabase
- **Real-time**: Server-Sent Events (SSE)

## ⚠️ Critical Requirements

1. **Operations require manual approval by default** - `auto_accept_operations: false`
2. **Use Svelte 5 runes syntax** - NOT the old reactive syntax
3. **Always use `pnpm`** - NEVER use `npm`
4. **Follow existing patterns** - Look at completed components for reference

## 📋 Your Tasks (Priority Order)

### 1. Complete Remaining UI Components (3 components needed)

You need to create three Svelte components. Reference the already-completed components for patterns:

- ✅ Already done: `/apps/web/src/lib/components/agent/AgentModal.svelte`
- ✅ Already done: `/apps/web/src/lib/components/agent/ChatInterface.svelte`

#### A. Create OperationsLog Component

**File**: `/apps/web/src/lib/components/agent/OperationsLog.svelte`

**Purpose**: Display history of executed operations

**Requirements**:

- Show list of completed operations
- Display operation type, description, timestamp
- Success/failure status indicators
- Collapsible details for each operation
- Reference existing: `/apps/web/src/lib/components/brain-dump/OperationsLog.svelte` for patterns

**Data source**: Operations from `chat_operations` table filtered by status='completed'

#### B. Create OperationsQueue Component

**File**: `/apps/web/src/lib/components/agent/OperationsQueue.svelte`

**Purpose**: Show pending operations awaiting approval

**Requirements**:

- List operations with status='pending'
- Approve/Reject buttons for each operation
- Bulk approve/reject functionality
- Show operation dependencies
- Real-time updates via events from ChatInterface
- Reference existing: `/apps/web/src/lib/components/brain-dump/DualProcessingResults.svelte` for operation UI patterns

**Key functionality**:

```javascript
// Approve operation
async function approveOperation(operationId: string) {
  // Call API to update operation status
  // Emit event to trigger execution
}
```

#### C. Create DraftsList Component

**File**: `/apps/web/src/lib/components/agent/DraftsList.svelte`

**Purpose**: List and manage draft projects

**Requirements**:

- Show all drafts for current session
- Display draft name, description, dimensions covered
- Progress indicators (X/9 dimensions)
- Edit/Delete/Finalize actions
- Reference `DraftService` at `/apps/web/src/lib/services/draft.service.ts`

**Data source**: Use the DraftService.getUserDrafts() method

### 2. Run Database Migration

**Migration file ready at**: `/supabase/migrations/20251028_create_agent_tables.sql`

**Steps**:

1. Ensure you're in the project root
2. Run: `pnpm supabase db push`
3. Verify tables created:
    - project_drafts
    - draft_tasks
    - chat_operations
    - chat_session_operations
    - operation_dependencies
    - chat_session_dimensions

### 3. Add Agent Entry Points

#### A. Add to Chat Configuration

**File**: `/apps/web/src/lib/config/chat.config.ts` (or similar)

Add agent tools to the available tools list:

```typescript
{
  id: 'agent',
  name: 'AI Agent',
  description: 'Create and manage projects conversationally',
  icon: '🤖',
  component: () => import('$lib/components/agent/AgentModal.svelte')
}
```

#### B. Add to Navigation

**File**: `/apps/web/src/routes/+layout.svelte` or navigation component

Add a menu item or button to open the agent modal.

#### C. Add to Brain Dump Flow

**File**: `/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`

Add option to "Continue with Agent" after brain dump processing.

### 4. Test the Complete Flow

Once UI components are complete:

1. **Test Project Creation Flow**:
    - Open agent modal
    - Select "project_create" mode
    - Send a message describing a project
    - Verify dimension detection works
    - Answer clarifying questions
    - Approve operations
    - Verify draft is created
    - Finalize draft to real project

2. **Test Operation Approval**:
    - Ensure auto_accept is FALSE by default
    - Verify operations appear in queue
    - Test approve/reject functionality
    - Verify approved operations execute

3. **Test SSE Streaming**:
    - Verify real-time message streaming
    - Check phase transitions
    - Ensure error handling works

## 📁 Key Files Reference

### Already Implemented (Don't modify unless fixing bugs):

- ✅ `/packages/shared-types/src/agent.types.ts` - Type definitions
- ✅ `/apps/web/src/lib/services/draft.service.ts` - Draft management service
- ✅ `/apps/web/src/lib/services/agent-orchestrator.service.ts` - Main agent logic
- ✅ `/apps/web/src/routes/api/agent/stream/+server.ts` - SSE endpoint
- ✅ `/apps/web/src/lib/components/agent/AgentModal.svelte` - Main modal
- ✅ `/apps/web/src/lib/components/agent/ChatInterface.svelte` - Chat UI

### Need to Create:

- 🔴 `/apps/web/src/lib/components/agent/OperationsLog.svelte`
- 🔴 `/apps/web/src/lib/components/agent/OperationsQueue.svelte`
- 🔴 `/apps/web/src/lib/components/agent/DraftsList.svelte`

### Need to Modify:

- 🟡 Chat configuration file (add agent tool)
- 🟡 Navigation/layout (add entry point)
- 🟡 BrainDumpModal (add agent option)

## 🎨 UI Component Patterns to Follow

### Svelte 5 Runes (IMPORTANT!)

```svelte
<script lang="ts">
	// ✅ CORRECT - Svelte 5 runes
	let count = $state(0);
	let doubled = $derived(count * 2);

	$effect(() => {
		console.log('Count changed:', count);
	});

	// ❌ WRONG - Old reactive syntax
	// let count = 0;
	// $: doubled = count * 2;
</script>
```

### Component Structure

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import type { YourType } from '@buildos/shared-types';

	// Props
	export let sessionId: string;

	// State
	let items = $state<YourType[]>([]);
	let loading = $state(false);

	// Lifecycle
	onMount(() => {
		loadData();
	});

	// Methods
	async function loadData() {
		// Implementation
	}
</script>

<div class="component-wrapper">
	<!-- Your UI here -->
</div>

<style>
	/* Component styles */
</style>
```

### Using Services

```typescript
import { DraftService } from '$lib/services/draft.service';
import { supabase } from '$lib/supabase';

const draftService = new DraftService(supabase);
const drafts = await draftService.getUserDrafts(userId);
```

## 🧪 Testing Checklist

- [ ] All 3 new UI components render without errors
- [ ] Database migration runs successfully
- [ ] Agent modal opens from navigation
- [ ] Chat messages stream in real-time
- [ ] Operations appear in queue (not auto-approved)
- [ ] Manual approval/rejection works
- [ ] Drafts are created and displayed
- [ ] Draft finalization creates real project
- [ ] Error states handled gracefully

## 💡 Important Context

1. **Operation Reuse**: The system reuses the existing `ParsedOperation` interface from the brain-dump system. Don't create a new operation type.

2. **Dimension Detection**: Uses `BrainDumpProcessor.runPreparatoryAnalysis()` for detecting project dimensions.

3. **LLM Profiles**: The AgentOrchestrator uses different SmartLLMService profiles:
    - 'speed' for routine responses
    - 'balanced' for analysis
    - 'quality' for complex generation

4. **Session Persistence**: One draft per chat session (enforced by unique constraint).

5. **Progressive Disclosure**: System asks questions gradually to avoid overwhelming users.

## 🚨 Common Pitfalls to Avoid

1. **DON'T use npm** - Always use pnpm
2. **DON'T use old Svelte syntax** - Use Svelte 5 runes
3. **DON'T auto-approve operations** - Default is manual approval
4. **DON'T create operations in parallel** - Respect dependencies
5. **DON'T skip error handling** - Always handle SSE stream errors

## 📞 Getting Help

If you need to understand existing patterns:

1. Look at brain-dump components in `/apps/web/src/lib/components/brain-dump/`
2. Check existing services in `/apps/web/src/lib/services/`
3. Review the monorepo guide at `/CLAUDE.md`
4. Check web app patterns at `/apps/web/CLAUDE.md`

## 🎯 Success Criteria

Implementation is complete when:

1. All 3 UI components are created and functional
2. Database migration is applied
3. Agent is accessible from main navigation
4. Complete project creation flow works end-to-end
5. Operations require manual approval (not auto-accepted)
6. Drafts can be finalized into real projects

## Final Notes

- The backend is 100% complete - focus only on UI components and integration
- Follow existing patterns from brain-dump system
- Maintain type safety throughout
- Test each component in isolation before integration
- Remember: This is a 10% rollout feature, so include feature flag checks where appropriate

Good luck! The foundation is solid - you just need to complete the final UI pieces.
