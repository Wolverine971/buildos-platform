<!-- apps/web/docs/features/time-blocks/NOTIFICATION_STACK_INTEGRATION_SPEC.md -->

# Time-Block Creation: Notification Stack Integration Specification

**Status**: Draft
**Priority**: High
**Created**: 2025-10-23
**Owner**: TBD

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Solution Overview](#solution-overview)
- [Technical Specifications](#technical-specifications)
- [Implementation Details](#implementation-details)
- [Testing Requirements](#testing-requirements)
- [Rollout Plan](#rollout-plan)
- [Success Metrics](#success-metrics)
- [Related Documentation](#related-documentation)

---

## Executive Summary

**Goal**: Make time-block creation non-blocking by moving LLM-powered AI suggestion generation into the notification stack system, following the proven brain dump pattern.

**Current Pain Point**: Users wait 3-5 seconds during time-block creation while AI generates suggestions. This blocks the modal and prevents concurrent block creation.

**Solution**: Split creation into two phases:

1. **Phase 1** (< 500ms): Create time-block record + Google Calendar event, close modal immediately
2. **Phase 2** (3-5s in background): Generate AI suggestions async, update notification stack in real-time

**Benefits**:

- ✅ 90% faster perceived creation time (500ms vs 3-5s)
- ✅ Non-blocking UX - modal closes immediately
- ✅ Concurrent block creation (up to 3 at once)
- ✅ Graceful degradation - time-block still usable if AI fails
- ✅ Consistent UX pattern with brain dump feature

**Estimated Effort**: 2-3 weeks

---

## Problem Statement

### Current Flow (Blocking)

```
User submits time-block form
  ↓
Store: POST /api/time-blocks/create
  ├─ Validate parameters (50ms)
  ├─ Check conflicts (100ms)
  ├─ Fetch project data (150ms)
  ├─ 🔴 BLOCKS HERE: Generate AI suggestions (3-5s)
  │   └─ LLM API call to OpenRouter
  ├─ Create Google Calendar event (500ms)
  └─ Insert database record (100ms)
  ↓
Return response (total: 4-6s)
  ↓
Modal closes, UI updates
```

**File**: `/apps/web/src/lib/services/time-block.service.ts:118-130`

**Critical Blocking Code**:

```typescript
// Generate AI suggestions (SYNCHRONOUS - BLOCKS ENTIRE FLOW)
const suggestionResult = await this.suggestionService.generateSuggestions({
	blockType,
	projectId: projectId ?? undefined,
	startTime,
	endTime,
	durationMinutes,
	timezone
});
```

### Pain Points

1. **Poor UX**: User sees "Creating..." spinner for 3-5 seconds
2. **No concurrency**: Can't create multiple blocks rapidly
3. **All-or-nothing**: If LLM fails, entire creation fails
4. **No optimistic UI**: No immediate feedback
5. **Not resilient**: Page refresh during creation loses everything

---

## Solution Overview

### New Flow (Non-Blocking)

```
User submits time-block form
  ↓
Store: POST /api/time-blocks/create
  ├─ Validate parameters (50ms)
  ├─ Check conflicts (100ms)
  ├─ Fetch project data (150ms)
  ├─ Create Google Calendar event (500ms)
  ├─ Insert database record with suggestions_state='pending' (100ms)
  └─ Return immediately ✅ (total: < 1s)
  ↓
Modal closes IMMEDIATELY
  ↓
Time-Block Notification Bridge (subscription)
  ├─ Detects new block with suggestions_state='pending'
  ├─ Creates notification in stack (50ms)
  └─ Starts async API call (non-blocking)
      ├─ POST /api/time-blocks/generate-suggestions
      ├─ Updates notification with progress
      └─ On complete: Updates DB + notification status='success'
```

### Architecture Pattern

Following the proven **brain dump notification bridge pattern**:

1. **Bridge Service** watches time-blocks store via subscription
2. **Notification Created** when `suggestions_state === 'pending'`
3. **Async API Call** generates suggestions in background
4. **Real-time Updates** to notification as suggestions generate
5. **Graceful Completion** or **Graceful Degradation** on error

---

## Technical Specifications

### 1. New Notification Type

**File**: `/apps/web/src/lib/types/notification.types.ts`

**Add to discriminated union**:

```typescript
export interface TimeBlockNotification extends BaseNotification {
	type: 'time-block';
	data: {
		// Core time-block info
		timeBlockId: string;
		blockType: 'project' | 'build';
		projectId?: string;
		projectName?: string;
		startTime: string; // ISO timestamp
		endTime: string;
		durationMinutes: number;

		// Calendar event (created immediately in Phase 1)
		calendarEventId?: string;
		calendarEventLink?: string;

		// AI suggestions state (generated async in Phase 2)
		suggestionsState?: {
			status: 'pending' | 'generating' | 'completed' | 'failed';
			progress?: string; // "Analyzing tasks..." (optional)
			error?: string;
			startedAt?: string; // ISO timestamp
			completedAt?: string;
		};

		// Final suggestions (available after completion)
		suggestions?: TimeBlockSuggestion[];
		suggestionsSummary?: string;
		suggestionsModel?: string; // Model used (e.g., "gpt-4o-mini")

		error?: string;
	};
	progress: NotificationProgress; // Type: 'percentage' or 'streaming'
	actions: NotificationActions;
}

// Also add to main discriminated union
export type Notification =
	| BrainDumpNotification
	| PhaseGenerationNotification
	| ProjectSynthesisNotification
	| CalendarAnalysisNotification
	| TimeBlockNotification // ← NEW
	| GenericNotification;
```

### 2. Database Schema Update

**File**: New migration `supabase/migrations/YYYYMMDD_add_time_blocks_suggestions_state.sql`

```sql
-- Add suggestions_state column to time_blocks table
ALTER TABLE time_blocks
ADD COLUMN suggestions_state JSONB DEFAULT '{"status": "pending"}'::jsonb;

-- Create index for querying pending suggestions
CREATE INDEX idx_time_blocks_suggestions_state
ON time_blocks ((suggestions_state->>'status'));

-- Migration for existing data (mark as completed)
UPDATE time_blocks
SET suggestions_state = '{"status": "completed"}'::jsonb
WHERE ai_suggestions IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN time_blocks.suggestions_state IS
'Tracks the state of AI suggestion generation: pending, generating, completed, or failed';
```

**TypeScript Type**:

```typescript
interface TimeBlockSuggestionsState {
	status: 'pending' | 'generating' | 'completed' | 'failed';
	progress?: string;
	error?: string;
	startedAt?: string; // ISO timestamp
	completedAt?: string;
}
```

### 3. Split Time-Block Service

**File**: `/apps/web/src/lib/services/time-block.service.ts`

**Current Method** (Lines 81-188):

```typescript
async createTimeBlock(params): Promise<TimeBlock> {
  // Validate, check conflicts, fetch project
  // Generate suggestions ← REMOVE THIS (blocking)
  // Create calendar event
  // Insert database
}
```

**New Method** (Non-blocking):

```typescript
async createTimeBlock(params: CreateTimeBlockParams): Promise<TimeBlock> {
  // 1. Validate parameters
  this.validateTimeBlockParams(params);

  // 2. Check for time conflicts
  await this.checkTimeConflicts(params.startTime, params.endTime);

  // 3. Calculate duration
  const durationMinutes = Math.floor(
    (params.endTime.getTime() - params.startTime.getTime()) / (1000 * 60)
  );

  // 4. Fetch project data (if project block)
  let projectName = null;
  let calendarColorId = null;
  if (params.blockType === 'project' && params.projectId) {
    const { data: projectRow } = await this.supabase
      .from('projects')
      .select('name, calendar_color_id')
      .eq('id', params.projectId)
      .eq('user_id', this.userId)
      .maybeSingle();

    projectName = projectRow?.name ?? null;
    calendarColorId = projectRow?.calendar_color_id ?? null;
  }

  // 5. Build calendar event content (without AI suggestions)
  const eventTitle = params.blockType === 'project'
    ? `${projectName} - Work Session`
    : 'Build Block';

  const eventDescription = `Time block created via BuildOS Time Play.\n\n` +
    `AI task suggestions will be generated shortly.`;

  // 6. Create Google Calendar event
  const calendarEvent = await this.calendarService.scheduleTask({
    title: eventTitle,
    description: eventDescription,
    start: params.startTime,
    end: params.endTime,
    colorId: calendarColorId,
    // ... other params
  });

  // 7. Insert database record with suggestions_state = 'pending'
  const { data: timeBlock, error } = await this.supabase
    .from('time_blocks')
    .insert({
      user_id: this.userId,
      block_type: params.blockType,
      project_id: params.projectId ?? null,
      start_time: params.startTime.toISOString(),
      end_time: params.endTime.toISOString(),
      duration_minutes: durationMinutes,
      timezone: params.timezone ?? 'America/New_York',
      calendar_event_id: calendarEvent.eventId,
      calendar_event_link: calendarEvent.eventLink ?? null,
      ai_suggestions: null,  // Will be populated async
      suggestions_state: { status: 'pending' },  // ← Key change
      sync_status: 'synced',
      sync_source: 'app',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select(`
      *,
      project:projects(id, name, calendar_color_id)
    `)
    .single();

  if (error) {
    // Rollback calendar event on DB error
    await this.rollbackCalendarEvent(calendarEvent.eventId);
    throw error;
  }

  // 8. Return immediately - bridge will handle suggestions async
  return timeBlock;
}
```

### 4. New API Endpoint for Async Suggestions

**File**: `/apps/web/src/routes/api/time-blocks/generate-suggestions/+server.ts` (NEW)

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { safeGetSession } from '$lib/utils/safe-get-session';
import { TimeBlockService } from '$lib/services/time-block.service';
import { TimeBlockSuggestionService } from '$lib/services/time-block-suggestion.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// 1. Authenticate
		const { session, user } = await safeGetSession(locals.supabase, locals.getSession);
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// 2. Parse request
		const { timeBlockId } = await request.json();
		if (!timeBlockId) {
			return json({ error: 'timeBlockId is required' }, { status: 400 });
		}

		// 3. Fetch time-block
		const timeBlockService = new TimeBlockService(locals.supabase, user.id);
		const { data: timeBlock, error: fetchError } = await locals.supabase
			.from('time_blocks')
			.select('*')
			.eq('id', timeBlockId)
			.eq('user_id', user.id)
			.single();

		if (fetchError || !timeBlock) {
			return json({ error: 'Time block not found' }, { status: 404 });
		}

		// 4. Update state to 'generating'
		await locals.supabase
			.from('time_blocks')
			.update({
				suggestions_state: {
					status: 'generating',
					startedAt: new Date().toISOString()
				}
			})
			.eq('id', timeBlockId);

		// 5. Generate suggestions (this is the expensive LLM call)
		const suggestionService = new TimeBlockSuggestionService(locals.supabase, user.id);
		const suggestionResult = await suggestionService.generateSuggestions({
			blockType: timeBlock.block_type,
			projectId: timeBlock.project_id,
			startTime: new Date(timeBlock.start_time),
			endTime: new Date(timeBlock.end_time),
			durationMinutes: timeBlock.duration_minutes,
			timezone: timeBlock.timezone
		});

		// 6. Update database with suggestions
		const { data: updatedBlock, error: updateError } = await locals.supabase
			.from('time_blocks')
			.update({
				ai_suggestions: suggestionResult.suggestions,
				suggestions_summary: suggestionResult.summary ?? null,
				suggestions_generated_at: suggestionResult.generatedAt.toISOString(),
				suggestions_model: suggestionResult.model ?? null,
				suggestions_state: {
					status: 'completed',
					completedAt: new Date().toISOString()
				}
			})
			.eq('id', timeBlockId)
			.select()
			.single();

		if (updateError) {
			throw updateError;
		}

		// 7. Also update calendar event description with suggestions
		if (timeBlock.calendar_event_id) {
			const formattedSuggestions = suggestionService.formatSuggestionForDescription(
				suggestionResult.suggestions
			);

			await timeBlockService.updateCalendarEventDescription(
				timeBlock.calendar_event_id,
				formattedSuggestions
			);
		}

		return json({
			success: true,
			data: {
				suggestions: suggestionResult.suggestions,
				summary: suggestionResult.summary,
				model: suggestionResult.model
			}
		});
	} catch (error) {
		console.error('[API] Failed to generate time-block suggestions:', error);

		// Mark as failed in database
		if (timeBlockId) {
			await locals.supabase
				.from('time_blocks')
				.update({
					suggestions_state: {
						status: 'failed',
						error: error instanceof Error ? error.message : 'Unknown error',
						completedAt: new Date().toISOString()
					}
				})
				.eq('id', timeBlockId);
		}

		return json(
			{
				error: error instanceof Error ? error.message : 'Failed to generate suggestions'
			},
			{ status: 500 }
		);
	}
};
```

### 5. Notification Bridge Service

**File**: `/apps/web/src/lib/services/time-block-notification.bridge.ts` (NEW)

```typescript
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { notificationStore } from '$lib/stores/notification.store';
import { timeBlocksStore } from '$lib/stores/timeBlocksStore';
import type { TimeBlockNotification } from '$lib/types/notification.types';
import type { TimeBlock } from '$lib/types/time-blocks';

// ========================================
// Multi-time-block support tracking
// ========================================

const MULTI_TIMEBLOCK_ENABLED = true;
const MAX_CONCURRENT_SUGGESTIONS = 3;

// Map of timeBlockId → notificationId
const activeTimeBlockNotifications = new Map<string, string>();

// Map of timeBlockId → last update timestamp
const lastProcessedTimestamps = new Map<string, number>();

// Map of timeBlockId → last synced state (for deduplication)
const lastSyncedTimeBlockStates = new Map<string, any>();

// ========================================
// Initialization
// ========================================

let timeBlocksStoreUnsubscribe: (() => void) | null = null;

export function initTimeBlockNotificationBridge() {
	if (!browser) return;

	console.log('[TimeBlockNotificationBridge] Initializing...');

	// Check for persisted notifications from page reload
	const currentState = get(notificationStore);

	if (MULTI_TIMEBLOCK_ENABLED) {
		// Rebind to any time-blocks that survived reload
		for (const notification of currentState.notifications.values()) {
			if (notification.type !== 'time-block') continue;

			const timeBlockId = notification.data.timeBlockId;
			activeTimeBlockNotifications.set(timeBlockId, notification.id);
			lastProcessedTimestamps.set(timeBlockId, notification.updatedAt);

			// Re-register action handlers
			ensureTimeBlockNotificationActions(timeBlockId, notification.id);
		}
	}

	// Subscribe to time-blocks store changes
	timeBlocksStoreUnsubscribe = timeBlocksStore.subscribe((state) => {
		if (MULTI_TIMEBLOCK_ENABLED) {
			// Sync all time-blocks
			for (const block of state.blocks) {
				syncTimeBlockToNotification(block);
			}

			// Cleanup completed notifications
			cleanupCompletedNotifications(state.blocks);
		}
	});

	console.log('[TimeBlockNotificationBridge] Initialized successfully');
}

export function destroyTimeBlockNotificationBridge() {
	if (timeBlocksStoreUnsubscribe) {
		timeBlocksStoreUnsubscribe();
		timeBlocksStoreUnsubscribe = null;
	}

	activeTimeBlockNotifications.clear();
	lastProcessedTimestamps.clear();
	lastSyncedTimeBlockStates.clear();
}

// ========================================
// Core Sync Logic
// ========================================

function syncTimeBlockToNotification(block: TimeBlock) {
	const suggestionsState = block.suggestions_state;
	const isPending = suggestionsState?.status === 'pending';
	const isGenerating = suggestionsState?.status === 'generating';
	const existingNotificationId = activeTimeBlockNotifications.get(block.id);

	// Create notification if pending/generating and not exists
	if ((isPending || isGenerating) && !existingNotificationId) {
		const notificationId = createTimeBlockNotification(block);
		activeTimeBlockNotifications.set(block.id, notificationId);

		// Start generating suggestions if pending
		if (isPending) {
			startGeneratingSuggestions(block.id);
		}
	}

	// Update notification if exists
	if (existingNotificationId) {
		updateTimeBlockNotification(existingNotificationId, block);
	}
}

// ========================================
// Create Notification
// ========================================

function createTimeBlockNotification(block: TimeBlock): string {
	const notification: Omit<TimeBlockNotification, 'id' | 'createdAt' | 'updatedAt'> = {
		type: 'time-block',
		status: 'processing',
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null, // Manual close
		data: {
			timeBlockId: block.id,
			blockType: block.block_type,
			projectId: block.project_id ?? undefined,
			projectName: block.project?.name ?? undefined,
			startTime: block.start_time,
			endTime: block.end_time,
			durationMinutes: block.duration_minutes,
			calendarEventId: block.calendar_event_id ?? undefined,
			calendarEventLink: block.calendar_event_link ?? undefined,
			suggestionsState: block.suggestions_state ?? { status: 'pending' }
		},
		progress: {
			type: 'percentage',
			percentage: 0,
			message: 'Generating AI suggestions...'
		},
		actions: buildTimeBlockNotificationActions(block.id)
	};

	const notificationId = notificationStore.add(notification);

	console.log('[TimeBlockBridge] Created notification:', {
		timeBlockId: block.id,
		notificationId
	});

	return notificationId;
}

// ========================================
// Update Notification
// ========================================

function updateTimeBlockNotification(notificationId: string, block: TimeBlock) {
	const suggestionsState = block.suggestions_state;

	// Determine notification status
	let status: TimeBlockNotification['status'] = 'processing';
	if (suggestionsState?.status === 'completed') {
		status = 'success';
	} else if (suggestionsState?.status === 'failed') {
		status = 'warning'; // Warning, not error - time-block still usable
	}

	// Determine progress
	let progress: TimeBlockNotification['progress'];
	if (suggestionsState?.status === 'generating') {
		progress = {
			type: 'percentage',
			percentage: 50,
			message: 'Analyzing tasks...'
		};
	} else if (suggestionsState?.status === 'completed') {
		progress = {
			type: 'percentage',
			percentage: 100,
			message: 'Suggestions ready!'
		};
	} else if (suggestionsState?.status === 'failed') {
		progress = {
			type: 'percentage',
			percentage: 100,
			message: suggestionsState.error ?? 'Suggestion generation failed'
		};
	} else {
		progress = {
			type: 'percentage',
			percentage: 0,
			message: 'Starting...'
		};
	}

	notificationStore.update(notificationId, {
		status,
		data: {
			timeBlockId: block.id,
			blockType: block.block_type,
			projectId: block.project_id ?? undefined,
			projectName: block.project?.name ?? undefined,
			startTime: block.start_time,
			endTime: block.end_time,
			durationMinutes: block.duration_minutes,
			calendarEventId: block.calendar_event_id ?? undefined,
			calendarEventLink: block.calendar_event_link ?? undefined,
			suggestionsState: block.suggestions_state,
			suggestions: block.ai_suggestions ?? undefined,
			suggestionsSummary: block.suggestions_summary ?? undefined,
			suggestionsModel: block.suggestions_model ?? undefined
		},
		progress
	});

	// Auto-minimize after 3 seconds if completed successfully
	if (status === 'success') {
		setTimeout(() => {
			notificationStore.minimize(notificationId);
		}, 3000);
	}
}

// ========================================
// Start Async Suggestion Generation
// ========================================

async function startGeneratingSuggestions(timeBlockId: string) {
	console.log('[TimeBlockBridge] Starting suggestion generation:', timeBlockId);

	try {
		const response = await fetch('/api/time-blocks/generate-suggestions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timeBlockId })
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error ?? 'Failed to generate suggestions');
		}

		const result = await response.json();

		console.log('[TimeBlockBridge] Suggestions generated successfully:', {
			timeBlockId,
			suggestionCount: result.data.suggestions.length
		});

		// Store will auto-update via subscription when DB changes
		// Bridge subscription will detect change and update notification
	} catch (error) {
		console.error('[TimeBlockBridge] Suggestion generation failed:', timeBlockId, error);

		// Error is already marked in database by API endpoint
		// Notification will update automatically via store subscription
	}
}

// ========================================
// Action Handlers
// ========================================

function buildTimeBlockNotificationActions(timeBlockId: string): NotificationActions {
	return {
		view: {
			label: 'View Details',
			handler: () => {
				const notificationId = activeTimeBlockNotifications.get(timeBlockId);
				if (notificationId) {
					notificationStore.expand(notificationId);
				}
			}
		},
		dismiss: {
			label: 'Dismiss',
			handler: () => {
				const notificationId = activeTimeBlockNotifications.get(timeBlockId);
				if (notificationId) {
					notificationStore.remove(notificationId);
					activeTimeBlockNotifications.delete(timeBlockId);
					lastProcessedTimestamps.delete(timeBlockId);
					lastSyncedTimeBlockStates.delete(timeBlockId);
				}
			}
		}
	};
}

function ensureTimeBlockNotificationActions(timeBlockId: string, notificationId: string) {
	// Re-register actions after page reload
	const actions = buildTimeBlockNotificationActions(timeBlockId);

	// Update notification with fresh actions
	notificationStore.update(notificationId, { actions });
}

// ========================================
// Cleanup
// ========================================

function cleanupCompletedNotifications(blocks: TimeBlock[]) {
	const activeBlockIds = new Set(blocks.map((b) => b.id));

	for (const [blockId, notificationId] of activeTimeBlockNotifications) {
		if (!activeBlockIds.has(blockId)) {
			// Time-block was deleted, clean up notification tracking
			activeTimeBlockNotifications.delete(blockId);
			lastProcessedTimestamps.delete(blockId);
			lastSyncedTimeBlockStates.delete(blockId);
		}
	}
}

// ========================================
// Global Export (for debugging)
// ========================================

if (browser) {
	(window as any).__debugTimeBlockNotificationBridge = {
		activeNotifications: activeTimeBlockNotifications,
		lastProcessedTimestamps,
		forceSync: () => {
			const state = get(timeBlocksStore);
			state.blocks.forEach(syncTimeBlockToNotification);
		}
	};
}
```

### 6. Initialize Bridge in App Layout

**File**: `/apps/web/src/routes/+layout.svelte`

**Add after brain dump bridge init**:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { initBrainDumpNotificationBridge } from '$lib/services/brain-dump-notification.bridge';
	import { initTimeBlockNotificationBridge } from '$lib/services/time-block-notification.bridge';
	import NotificationStackManager from '$lib/components/notifications/NotificationStackManager.svelte';

	onMount(() => {
		// Initialize notification bridges
		initBrainDumpNotificationBridge();
		initTimeBlockNotificationBridge(); // ← NEW
	});
</script>

<NotificationStackManager />
<!-- rest of layout -->
```

### 7. UI Components (Lazy-Loaded)

**Files to create**:

- `/apps/web/src/lib/components/notifications/types/time-block/TimeBlockMinimizedView.svelte`
- `/apps/web/src/lib/components/notifications/types/time-block/TimeBlockModalContent.svelte`

**TimeBlockMinimizedView.svelte**:

```svelte
<script lang="ts">
	import { Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-svelte';
	import type { TimeBlockNotification } from '$lib/types/notification.types';

	let { notification = $bindable() }: { notification: TimeBlockNotification } = $props();

	let statusInfo = $derived(
		(() => {
			const status = notification.status;
			const data = notification.data;
			const suggestionsState = data.suggestionsState;

			// Processing - generating suggestions
			if (status === 'processing') {
				const message =
					suggestionsState?.status === 'generating'
						? 'Analyzing tasks...'
						: 'Starting suggestion generation...';

				return {
					icon: 'processing',
					title: 'Creating time block',
					subtitle: message,
					color: 'purple'
				};
			}

			// Success - suggestions ready
			if (status === 'success') {
				const suggestionCount = data.suggestions?.length ?? 0;
				return {
					icon: 'completed',
					title: 'Time block created',
					subtitle: `${suggestionCount} suggestion${suggestionCount !== 1 ? 's' : ''} ready`,
					color: 'green'
				};
			}

			// Warning - block created but suggestions failed
			if (status === 'warning') {
				return {
					icon: 'warning',
					title: 'Time block created',
					subtitle: 'AI suggestions unavailable',
					color: 'amber'
				};
			}

			return {
				icon: 'idle',
				title: 'Time block',
				subtitle: '',
				color: 'gray'
			};
		})()
	);

	let showProgressBar = $derived(notification.status === 'processing' && notification.progress);
</script>

<div class="relative">
	{#if showProgressBar && notification.progress?.type === 'percentage'}
		<!-- Progress bar -->
		<div class="h-1 bg-gray-200 dark:bg-gray-700 rounded-t-lg">
			<div
				class="h-full bg-purple-600 transition-all duration-300"
				style="width: {notification.progress.percentage ?? 0}%"
			></div>
		</div>
	{/if}

	<div class="p-4 flex items-center justify-between">
		<!-- Status Icon -->
		<div class="flex-shrink-0 mr-3">
			{#if statusInfo.icon === 'processing'}
				<Loader2 class="w-5 h-5 text-purple-600 animate-spin" />
			{:else if statusInfo.icon === 'completed'}
				<CheckCircle class="w-5 h-5 text-green-600" />
			{:else if statusInfo.icon === 'warning'}
				<AlertCircle class="w-5 h-5 text-amber-600" />
			{:else}
				<Clock class="w-5 h-5 text-gray-400" />
			{/if}
		</div>

		<!-- Title and Subtitle -->
		<div class="flex-1">
			<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
				{statusInfo.title}
			</div>
			<div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
				{statusInfo.subtitle}
			</div>
		</div>

		<!-- Project indicator (if project block) -->
		{#if notification.data.projectName}
			<div
				class="ml-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300"
			>
				{notification.data.projectName}
			</div>
		{/if}
	</div>
</div>
```

**TimeBlockModalContent.svelte**:

```svelte
<script lang="ts">
	import { Loader2, CheckCircle, AlertCircle, ExternalLink, Calendar } from 'lucide-svelte';
	import type { TimeBlockNotification } from '$lib/types/notification.types';
	import { format } from 'date-fns';

	let { notification = $bindable() }: { notification: TimeBlockNotification } = $props();

	let formattedDate = $derived(
		notification.data.startTime
			? format(new Date(notification.data.startTime), 'EEEE, MMM d, yyyy')
			: ''
	);

	let formattedTime = $derived(
		notification.data.startTime && notification.data.endTime
			? `${format(new Date(notification.data.startTime), 'h:mm a')} - ${format(new Date(notification.data.endTime), 'h:mm a')}`
			: ''
	);

	let durationText = $derived(
		notification.data.durationMinutes
			? `${Math.floor(notification.data.durationMinutes / 60)}h ${notification.data.durationMinutes % 60}m`
			: ''
	);

	function handleOpenCalendar() {
		if (notification.data.calendarEventLink) {
			window.open(notification.data.calendarEventLink, '_blank');
		}
	}
</script>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
			{notification.data.blockType === 'project' ? 'Project Time Block' : 'Build Block'}
		</h3>
		<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
			{formattedDate}
		</p>
	</div>

	<!-- Time Details -->
	<div class="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
		<div class="flex items-center text-sm text-gray-700 dark:text-gray-300">
			<Clock class="w-4 h-4 mr-2" />
			{formattedTime}
			<span class="ml-2 text-gray-500">({durationText})</span>
		</div>

		{#if notification.data.projectName}
			<div class="mt-2 text-sm text-gray-700 dark:text-gray-300">
				<span class="font-medium">Project:</span>
				{notification.data.projectName}
			</div>
		{/if}
	</div>

	<!-- Suggestions State -->
	{#if notification.status === 'processing'}
		<div class="mb-6 flex items-center text-purple-700 dark:text-purple-300">
			<Loader2 class="w-5 h-5 mr-2 animate-spin" />
			<span class="text-sm"
				>{notification.data.suggestionsState?.progress ??
					'Generating AI suggestions...'}</span
			>
		</div>
	{:else if notification.status === 'warning'}
		<div class="mb-6 flex items-center text-amber-700 dark:text-amber-300">
			<AlertCircle class="w-5 h-5 mr-2" />
			<span class="text-sm"
				>AI suggestions unavailable. Your time block was still created successfully.</span
			>
		</div>
	{:else if notification.status === 'success' && notification.data.suggestions}
		<!-- Success - show suggestions -->
		<div class="mb-6">
			<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
				💡 AI Suggested Tasks
			</h4>

			<div class="space-y-3">
				{#each notification.data.suggestions as suggestion, index}
					<div
						class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"
					>
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
									{index + 1}. {suggestion.title}
								</div>
								{#if suggestion.reason}
									<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										{suggestion.reason}
									</div>
								{/if}
								<div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
									{#if suggestion.estimated_minutes}
										<span>{suggestion.estimated_minutes} min</span>
									{/if}
									{#if suggestion.priority}
										<span
											class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded"
										>
											{suggestion.priority}
										</span>
									{/if}
									{#if suggestion.project_name && notification.data.blockType === 'build'}
										<span class="text-blue-600 dark:text-blue-400">
											{suggestion.project_name}
										</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if notification.data.suggestionsSummary}
				<div
					class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-200"
				>
					{notification.data.suggestionsSummary}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Actions -->
	<div class="flex gap-2">
		{#if notification.data.calendarEventLink}
			<button
				onclick={handleOpenCalendar}
				class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
			>
				<Calendar class="w-4 h-4" />
				Open in Google Calendar
			</button>
		{/if}
	</div>
</div>
```

### 8. Add Lazy Loading to NotificationModal.svelte

**File**: `/apps/web/src/lib/components/notifications/NotificationModal.svelte`

**Add to imports**:

```typescript
let TimeBlockModalContent = $state<any>(null);
```

**Add to loadTypeSpecificComponent()**:

```typescript
case 'time-block':
  if (!TimeBlockModalContent) {
    const module = await import('./types/time-block/TimeBlockModalContent.svelte');
    TimeBlockModalContent = module.default;
  }
  break;
```

**Add to typeSpecificComponent $derived**:

```typescript
let typeSpecificComponent = $derived(
  notification.type === 'brain-dump' ? BrainDumpModalContent :
  notification.type === 'phase-generation' ? PhaseGenerationModalContent :
  notification.type === 'time-block' ? TimeBlockModalContent :  // ← NEW
  // ... other types
);
```

### 9. Add Lazy Loading to MinimizedNotification.svelte

**File**: `/apps/web/src/lib/components/notifications/MinimizedNotification.svelte`

**Add to imports**:

```typescript
let TimeBlockMinimizedView = $state<any>(null);
```

**Add to loadTypeSpecificComponent()**:

```typescript
case 'time-block':
  if (!TimeBlockMinimizedView) {
    const module = await import('./types/time-block/TimeBlockMinimizedView.svelte');
    TimeBlockMinimizedView = module.default;
  }
  break;
```

**Add to typeSpecificComponent $derived**:

```typescript
let typeSpecificComponent = $derived(
  notification.type === 'brain-dump' ? BrainDumpMinimizedView :
  notification.type === 'phase-generation' ? PhaseGenerationMinimizedView :
  notification.type === 'time-block' ? TimeBlockMinimizedView :  // ← NEW
  // ... other types
);
```

---

## Testing Requirements

### 1. Unit Tests

**File**: `/apps/web/src/lib/services/__tests__/time-block-notification.bridge.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import { timeBlocksStore } from '$lib/stores/timeBlocksStore';
import {
	initTimeBlockNotificationBridge,
	destroyTimeBlockNotificationBridge
} from '$lib/services/time-block-notification.bridge';

describe('TimeBlockNotificationBridge', () => {
	beforeEach(() => {
		notificationStore.clearAll();
		destroyTimeBlockNotificationBridge();
	});

	it('should create notification when time-block has pending suggestions', () => {
		initTimeBlockNotificationBridge();

		// Add time-block with pending suggestions
		timeBlocksStore.addBlock({
			id: 'block-1',
			suggestions_state: { status: 'pending' }
			// ... other fields
		});

		const notifications = get(notificationStore);
		const timeBlockNotifications = Array.from(notifications.notifications.values()).filter(
			(n) => n.type === 'time-block'
		);

		expect(timeBlockNotifications).toHaveLength(1);
		expect(timeBlockNotifications[0].status).toBe('processing');
	});

	it('should update notification when suggestions complete', () => {
		initTimeBlockNotificationBridge();

		// Add time-block with pending suggestions
		const block = {
			id: 'block-1',
			suggestions_state: { status: 'pending' },
			ai_suggestions: null
		};
		timeBlocksStore.addBlock(block);

		// Update to completed
		timeBlocksStore.updateBlock('block-1', {
			suggestions_state: { status: 'completed' },
			ai_suggestions: [
				{
					/* ... */
				}
			]
		});

		const notifications = get(notificationStore);
		const notification = Array.from(notifications.notifications.values()).find(
			(n) => n.type === 'time-block'
		);

		expect(notification.status).toBe('success');
	});

	it('should handle suggestion generation failure gracefully', () => {
		initTimeBlockNotificationBridge();

		const block = {
			id: 'block-1',
			suggestions_state: { status: 'pending' }
		};
		timeBlocksStore.addBlock(block);

		// Update to failed
		timeBlocksStore.updateBlock('block-1', {
			suggestions_state: {
				status: 'failed',
				error: 'LLM API timeout'
			}
		});

		const notifications = get(notificationStore);
		const notification = Array.from(notifications.notifications.values()).find(
			(n) => n.type === 'time-block'
		);

		expect(notification.status).toBe('warning'); // Warning, not error
	});

	it('should support multiple concurrent time-blocks', () => {
		initTimeBlockNotificationBridge();

		// Add 3 time-blocks
		timeBlocksStore.addBlock({ id: 'block-1', suggestions_state: { status: 'pending' } });
		timeBlocksStore.addBlock({ id: 'block-2', suggestions_state: { status: 'pending' } });
		timeBlocksStore.addBlock({ id: 'block-3', suggestions_state: { status: 'pending' } });

		const notifications = get(notificationStore);
		const timeBlockNotifications = Array.from(notifications.notifications.values()).filter(
			(n) => n.type === 'time-block'
		);

		expect(timeBlockNotifications).toHaveLength(3);
	});

	it('should clean up notification when time-block is deleted', () => {
		initTimeBlockNotificationBridge();

		timeBlocksStore.addBlock({ id: 'block-1', suggestions_state: { status: 'pending' } });

		let notifications = get(notificationStore);
		expect(
			Array.from(notifications.notifications.values()).filter((n) => n.type === 'time-block')
		).toHaveLength(1);

		timeBlocksStore.deleteBlock('block-1');

		notifications = get(notificationStore);
		// Note: Notification may still exist but should be marked for cleanup
		// depending on implementation
	});
});
```

### 2. Integration Tests

**File**: `/apps/web/src/routes/api/time-blocks/generate-suggestions/+server.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from './+server';

describe('POST /api/time-blocks/generate-suggestions', () => {
	it('should generate suggestions and update database', async () => {
		const request = new Request('http://localhost/api/time-blocks/generate-suggestions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timeBlockId: 'block-1' })
		});

		// Mock authenticated session
		const locals = {
			supabase: mockSupabaseClient,
			getSession: vi.fn().mockResolvedValue({
				/* session */
			})
		};

		const response = await POST({ request, locals });
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.data.suggestions).toBeDefined();
	});

	it('should return 404 for non-existent time-block', async () => {
		const request = new Request('http://localhost/api/time-blocks/generate-suggestions', {
			method: 'POST',
			body: JSON.stringify({ timeBlockId: 'non-existent' })
		});

		const response = await POST({ request, locals: mockLocals });

		expect(response.status).toBe(404);
	});

	it('should handle LLM API failures gracefully', async () => {
		// Mock LLM service to throw error
		vi.mock('$lib/services/time-block-suggestion.service', () => ({
			TimeBlockSuggestionService: class {
				generateSuggestions() {
					throw new Error('LLM API timeout');
				}
			}
		}));

		const request = new Request('http://localhost/api/time-blocks/generate-suggestions', {
			method: 'POST',
			body: JSON.stringify({ timeBlockId: 'block-1' })
		});

		const response = await POST({ request, locals: mockLocals });

		expect(response.status).toBe(500);
		// Verify suggestions_state was updated to 'failed' in DB
	});
});
```

### 3. E2E Tests (Playwright)

**File**: `/apps/web/tests/e2e/time-blocks-notification.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Time-Block Notification Integration', () => {
	test('should create time-block and show notification immediately', async ({ page }) => {
		await page.goto('/time-blocks');

		// Click create button
		await page.click('[data-testid="create-time-block-button"]');

		// Fill form
		await page.selectOption('[data-testid="block-type"]', 'project');
		await page.selectOption('[data-testid="project-selector"]', 'project-1');
		await page.fill('[data-testid="start-time"]', '2025-10-24T09:00');
		await page.fill('[data-testid="end-time"]', '2025-10-24T11:00');

		// Submit form
		await page.click('[data-testid="create-block-submit"]');

		// Modal should close immediately (< 1s)
		await expect(page.locator('[data-testid="time-block-modal"]')).toBeHidden({
			timeout: 1000
		});

		// Notification should appear in stack
		await expect(page.locator('[data-testid="notification-stack"]')).toContainText(
			'Creating time block'
		);

		// Wait for suggestions to complete (max 10s)
		await expect(page.locator('[data-testid="notification-stack"]')).toContainText(
			'Suggestions ready',
			{ timeout: 10000 }
		);

		// Time-block should appear in calendar
		await expect(page.locator('[data-testid="time-block-9am"]')).toBeVisible();
	});

	test('should allow creating multiple blocks concurrently', async ({ page }) => {
		await page.goto('/time-blocks');

		// Create 3 blocks rapidly
		for (let i = 0; i < 3; i++) {
			await page.click('[data-testid="create-time-block-button"]');
			await page.selectOption('[data-testid="block-type"]', 'project');
			await page.selectOption('[data-testid="project-selector"]', 'project-1');
			await page.fill('[data-testid="start-time"]', `2025-10-24T${9 + i * 2}:00`);
			await page.fill('[data-testid="end-time"]', `2025-10-24T${11 + i * 2}:00`);
			await page.click('[data-testid="create-block-submit"]');
		}

		// All 3 notifications should appear
		const notifications = await page.locator('[data-testid="notification-stack"] > *').count();
		expect(notifications).toBe(3);
	});

	test('should show warning notification if suggestions fail', async ({ page }) => {
		// Mock LLM API to fail
		await page.route('**/api/time-blocks/generate-suggestions', (route) => {
			route.fulfill({ status: 500, body: JSON.stringify({ error: 'LLM API error' }) });
		});

		await page.goto('/time-blocks');

		// Create block
		await page.click('[data-testid="create-time-block-button"]');
		// ... fill form ...
		await page.click('[data-testid="create-block-submit"]');

		// Wait for notification to update to warning state
		await expect(page.locator('[data-testid="notification-stack"]')).toContainText(
			'AI suggestions unavailable',
			{ timeout: 10000 }
		);

		// Time-block should still exist
		await expect(page.locator('[data-testid="time-block-9am"]')).toBeVisible();
	});

	test('should allow expanding notification to see suggestions', async ({ page }) => {
		await page.goto('/time-blocks');

		// Create block
		// ... create block ...

		// Wait for suggestions ready
		await expect(page.locator('[data-testid="notification-stack"]')).toContainText(
			'Suggestions ready',
			{ timeout: 10000 }
		);

		// Click notification to expand
		await page.click('[data-testid="notification-stack"] > *:first-child');

		// Modal should appear with suggestions
		await expect(page.locator('[data-testid="notification-modal"]')).toBeVisible();
		await expect(page.locator('[data-testid="notification-modal"]')).toContainText(
			'AI Suggested Tasks'
		);
	});
});
```

---

## Rollout Plan

### Week 1: Foundation & API Split

**Tasks**:

- [ ] Add `suggestions_state` column to `time_blocks` table (migration)
- [ ] Add `TimeBlockNotification` type to `notification.types.ts`
- [ ] Modify `TimeBlockService.createTimeBlock()` to skip AI generation (return immediately)
- [ ] Create new API endpoint: `/api/time-blocks/generate-suggestions`
- [ ] Write unit tests for new endpoint
- [ ] Verify time-block creation still works (manual testing)

**Success Criteria**:

- Time-block creation completes in < 1s (without suggestions)
- New API endpoint can generate suggestions standalone
- All existing tests pass

---

### Week 2: Bridge Integration & Notification

**Tasks**:

- [ ] Create `time-block-notification.bridge.ts` (skeleton)
- [ ] Implement `initTimeBlockNotificationBridge()` with store subscription
- [ ] Implement `createTimeBlockNotification()` function
- [ ] Implement `updateTimeBlockNotification()` function
- [ ] Implement `startGeneratingSuggestions()` async function
- [ ] Initialize bridge in `/apps/web/src/routes/+layout.svelte`
- [ ] Write unit tests for bridge service
- [ ] Manual testing: Create time-block → verify notification appears

**Success Criteria**:

- Notification appears when time-block created
- Notification updates when suggestions complete
- Error handling works (notification shows warning on failure)

---

### Week 3: UI Components & Polish

**Tasks**:

- [ ] Create `TimeBlockMinimizedView.svelte` component
- [ ] Create `TimeBlockModalContent.svelte` component
- [ ] Add lazy loading to `MinimizedNotification.svelte`
- [ ] Add lazy loading to `NotificationModal.svelte`
- [ ] Implement action handlers (view, dismiss)
- [ ] Add auto-minimize after 3 seconds on success
- [ ] Write integration tests for UI components
- [ ] Write E2E tests (Playwright)
- [ ] Manual QA testing

**Success Criteria**:

- Notification stack displays time-block status correctly
- Expanding notification shows suggestions
- Actions (view, dismiss) work correctly
- Auto-minimize works on success
- All tests pass (unit, integration, E2E)

---

### Week 4: Feature Flag & Gradual Rollout

**Tasks**:

- [ ] Add feature flag: `ENABLE_ASYNC_TIME_BLOCK_SUGGESTIONS` (default: false)
- [ ] Deploy to staging environment
- [ ] Internal testing (5-10 users)
- [ ] Monitor LLM usage patterns and costs
- [ ] Monitor error rates and performance metrics
- [ ] Gather user feedback
- [ ] Fix any critical bugs
- [ ] Enable feature flag in production (gradual rollout: 10% → 50% → 100%)

**Success Criteria**:

- No critical bugs reported
- LLM API costs within expected range
- 90%+ suggestion generation success rate
- Positive user feedback
- Performance targets met (< 500ms creation time)

---

## Success Metrics

### Performance Metrics

**Target**: 90% improvement in perceived creation time

| Metric                        | Before (Blocking) | After (Non-Blocking)     | Target   |
| ----------------------------- | ----------------- | ------------------------ | -------- |
| **Time to modal close**       | 3-5 seconds       | < 500ms                  | ✅ < 1s  |
| **Time to time-block usable** | 3-5 seconds       | < 500ms                  | ✅ < 1s  |
| **Time to suggestions ready** | 3-5 seconds       | 3-5 seconds (background) | ✅ < 10s |
| **Concurrent block creation** | 1 at a time       | 3 concurrent             | ✅ 3+    |

### Reliability Metrics

**Target**: 95%+ suggestion generation success rate

| Metric                                  | Target | Monitoring                          |
| --------------------------------------- | ------ | ----------------------------------- |
| **Suggestion generation success rate**  | > 95%  | Supabase `suggestions_state` column |
| **Time-block creation success rate**    | > 99%  | API endpoint `/create` logs         |
| **Notification display rate**           | 100%   | Bridge service logs                 |
| **Graceful degradation on LLM failure** | 100%   | Verify time-block still usable      |

### User Experience Metrics

**Target**: Positive user feedback, increased usage

| Metric                              | Target                    | Source                 |
| ----------------------------------- | ------------------------- | ---------------------- |
| **User satisfaction**               | > 4.0/5.0                 | In-app feedback survey |
| **Feature adoption**                | +20% time-block creation  | Analytics              |
| **Concurrent block creation usage** | > 10% of users            | Analytics              |
| **Notification interaction rate**   | > 30% expand notification | Analytics              |

---

## Related Documentation

### Research Documents

- **Time-Block Notification Integration Research**: `/thoughts/shared/research/2025-10-23_21-27-27_timeblock-notification-stack-integration.md`
- **Brain Dump Notification Integration** (reference): See brain dump notification bridge implementation

### Implementation Guides

- **Time Play Feature Spec**: `/apps/web/docs/features/time-blocks/README.md`
- **Time Play Implementation Plan**: `/apps/web/docs/features/time-blocks/IMPLEMENTATION_PLAN.md`
- **Notification System Documentation Map**: `/apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md`

### Technical References

- **Notification Stack Architecture**: `/generic-stackable-notification-system-spec.md`
- **Brain Dump Bridge Service**: `/apps/web/src/lib/services/brain-dump-notification.bridge.ts`
- **Notification Store**: `/apps/web/src/lib/stores/notification.store.ts`
- **Notification Types**: `/apps/web/src/lib/types/notification.types.ts`

### API Documentation

- **Time-Block Service**: `/apps/web/src/lib/services/time-block.service.ts`
- **Time-Block Suggestion Service**: `/apps/web/src/lib/services/time-block-suggestion.service.ts`
- **Calendar Service**: `/apps/web/src/lib/services/calendar-service.ts`

---

## Questions & Feedback

For questions about this specification:

1. Review the [research document](/thoughts/shared/research/2025-10-23_21-27-27_timeblock-notification-stack-integration.md)
2. Check the [notification system documentation map](/apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md)
3. Reference the [brain dump bridge implementation](/apps/web/src/lib/services/brain-dump-notification.bridge.ts) (proven pattern)
4. Contact the product/engineering team

---

## Changelog

| Date       | Author      | Changes                       |
| ---------- | ----------- | ----------------------------- |
| 2025-10-23 | Claude Code | Initial specification created |

---

**Next Steps**:

1. Review and approve this specification
2. Create GitHub issues for each week's tasks
3. Assign development resources
4. Begin Week 1 implementation
5. Set up monitoring and analytics for metrics tracking
