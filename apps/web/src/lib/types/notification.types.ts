// apps/web/src/lib/types/notification.types.ts

/**
 * Generic Stackable Notification System Types
 *
 * This file defines the type system for the generic notification stack.
 * All notification types extend BaseNotification and use discriminated unions.
 */

import type {
	TimeBlockSuggestion,
	TimeBlockSuggestionsState,
	TimeBlockType,
	AgentRunStatus,
	AgentRunTrigger,
	AgentRunContextType,
	AgentRunScopeMode,
	AgentRunMetrics,
	RunResult,
	ChatContextType
} from '@buildos/shared-types';
import type { ParsedOperation } from './operations';
import type { SynthesisOptions } from './synthesis';
import type { TaskComparison } from '$lib/types';

// ============================================================================
// Core Enums & Primitives
// ============================================================================

/**
 * Notification status lifecycle
 */
export type UiNotificationStatus =
	| 'idle' // Not started yet
	| 'processing' // Currently processing
	| 'success' // Completed successfully
	| 'error' // Failed with error
	| 'cancelled' // User cancelled
	| 'warning'; // Completed with warnings

/**
 * Notification type discriminator
 */
export type NotificationType =
	| 'project-synthesis'
	| 'calendar-analysis'
	| 'daily-brief'
	| 'time-block'
	| 'agent-run'
	| 'chat-session'
	| 'generic';

/**
 * Progress indicator types
 */
export type ProgressType =
	| 'binary' // Just loading/done
	| 'percentage' // 0-100%
	| 'steps' // Step N of M
	| 'streaming' // SSE with messages
	| 'indeterminate'; // Unknown duration

// ============================================================================
// Base Notification
// ============================================================================

/**
 * Base notification interface - all notifications extend this
 */
export interface BaseNotification {
	/** Unique identifier (UUID) */
	id: string;

	/** Notification type (discriminator for union) */
	type: NotificationType;

	/** Current status */
	status: UiNotificationStatus;

	/** Creation timestamp */
	createdAt: number;

	/** Last update timestamp */
	updatedAt: number;

	/** Whether notification is minimized in stack */
	isMinimized: boolean;

	/** Whether notification should persist across navigation */
	isPersistent: boolean;

	/** Auto-close after N milliseconds (null = manual close only) */
	autoCloseMs?: number | null;
}

// ============================================================================
// Progress Types
// ============================================================================

export interface BinaryProgress {
	type: 'binary';
	message?: string;
	percentage?: number;
}

export interface PercentageProgress {
	type: 'percentage';
	percentage: number; // 0-100
	message?: string;
}

export type StepStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface StepProgressItem {
	key?: string;
	name: string;
	status: StepStatus;
	message?: string;
	etaSeconds?: number | null;
}

export interface StepsProgress {
	type: 'steps';
	currentStep: number;
	totalSteps: number;
	steps: StepProgressItem[];
	message?: string;
	percentage?: number;
}

export interface StreamingProgress {
	type: 'streaming';
	percentage?: number;
	message?: string;
	contextStatus?: 'processing' | 'completed' | 'error';
	tasksStatus?: 'processing' | 'completed' | 'error';
	contextProgress?: string;
	tasksProgress?: string;
}

export interface IndeterminateProgress {
	type: 'indeterminate';
	message?: string;
	percentage?: number;
}

export type NotificationProgress =
	| BinaryProgress
	| PercentageProgress
	| StepsProgress
	| StreamingProgress
	| IndeterminateProgress;

// ============================================================================
// Notification Actions
// ============================================================================

export interface NotificationActions {
	view?: () => void;
	retry?: () => void;
	dismiss?: () => void;
	cancel?: () => void;
	[key: string]: (() => void) | undefined;
}

// ============================================================================
// Time Block Notification
// ============================================================================

export interface TimeBlockNotification extends BaseNotification {
	type: 'time-block';
	data: {
		timeBlockId: string;
		blockType: TimeBlockType;
		projectId?: string | null;
		projectName?: string | null;
		startTime: string;
		endTime: string;
		durationMinutes: number;
		calendarEventId?: string | null;
		calendarEventLink?: string | null;
		suggestionsState?: TimeBlockSuggestionsState | null;
		suggestions?: TimeBlockSuggestion[] | null;
		suggestionsSummary?: string | null;
		suggestionsModel?: string | null;
		error?: string | null;
	};
	progress: NotificationProgress;
	actions: NotificationActions;
}

// Project Synthesis Notification
// ============================================================================

export interface ProjectSynthesisNotification extends BaseNotification {
	type: 'project-synthesis';
	data: {
		// Context
		projectId: string;
		projectName: string;

		// Configuration (for retry)
		options: SynthesisOptions;
		requestPayload: {
			regenerate: boolean;
			includeDeleted: boolean;
			options: SynthesisOptions;
		};

		// Metadata
		taskCount: number;
		selectedModules: string[];

		// Results (populated on success)
		result?: {
			synthesisId: string;
			operations: ParsedOperation[];
			insights: string;
			comparison: TaskComparison[];
			summary: string;
			operationsCount: number;
			consolidationCount: number;
			newTasksCount: number;
			deletionsCount: number;
		};

		// Error details
		error?: string;

		// Telemetry
		telemetry?: {
			startedAt: number;
			finishedAt?: number;
			durationMs?: number;
			generationModel?: string;
		};
	};
	progress: NotificationProgress;
	actions: NotificationActions;
}

// ============================================================================
// Calendar Analysis Notification
// ============================================================================

export interface CalendarAnalysisNotification extends BaseNotification {
	type: 'calendar-analysis';
	data: {
		analysisId?: string;
		daysBack: number;
		daysForward: number;
		eventCount?: number;
		suggestions?: any[];
		error?: string;
	};
	progress: NotificationProgress;
	actions: NotificationActions;
}

// ============================================================================
// Agent Run Notification (Run Stack — Agent Work / 03 Monitoring UI)
// ============================================================================

/**
 * A live background Agent Run surfaced in the notification stack. Driven by
 * `agentRunsRealtime` → `agent-run-notification.bridge`. `runStatus` is the
 * domain status (`agent_runs.status`); the base `status` is the UI lifecycle
 * mapping consumed by the generic stack chrome.
 */
export interface AgentRunNotification extends BaseNotification {
	type: 'agent-run';
	data: {
		runId: string;
		label: string;
		goal: string;
		/** Domain status from `agent_runs.status` (distinct from the UI `status`). */
		runStatus: AgentRunStatus;
		trigger: AgentRunTrigger;
		contextType: AgentRunContextType;
		projectId?: string | null;
		/** Human-readable project name enriched by the agent-runs list endpoint. */
		projectName?: string | null;
		/** Compact, verb-first description used by the minimized notification card. */
		activityLabel?: string;
		/** Entity title/name when the run targets one identifiable record. */
		targetLabel?: string | null;
		/** Brief proposal/result preview rather than a generic lifecycle message. */
		preview?: string;
		/** Normalized entity type used to choose the card's target icon. */
		entityType?: string | null;
		parentSessionId?: string | null;
		scopeMode: AgentRunScopeMode;
		reviewRequired: boolean;
		/** Run row timestamps (ISO) — distinct from the base numeric createdAt. */
		runCreatedAt: string;
		startedAt?: string | null;
		completedAt?: string | null;
		/** Populated on terminal status. */
		result?: RunResult | null;
		metrics?: AgentRunMetrics | null;
		/** Count of committed entities (from result.entities_touched). */
		entityCount?: number;
		error?: string | null;
	};
	progress: NotificationProgress;
	actions: NotificationActions;
}

// ============================================================================
// Chat Session Notification (parked/minimized agent chat)
// ============================================================================

/**
 * An agent chat parked into the stack via the modal's minimize path. The
 * conversation itself lives server-side keyed by `sessionId` — the card only
 * carries what's needed to show status and reopen the modal. Managed by
 * `chat-session-notification.bridge`, which probes any in-flight turn to
 * completion. Clicking the card reopens the real chat modal (there is no
 * expanded NotificationModal view for this type).
 */
export interface ChatSessionNotification extends BaseNotification {
	type: 'chat-session';
	data: {
		sessionId: string;
		title: string;
		contextType: ChatContextType | null;
		entityId?: string | null;
		projectId?: string | null;
		/** True while a detached server-side turn is (believed) still running. */
		hasActiveTurn: boolean;
		/** First ~140 chars of the assistant reply once the parked turn lands. */
		responsePreview?: string | null;
		/** stream.hasSentMessage at park time — forwarded to close/classify on dismiss. */
		hasSentMessage: boolean;
		error?: string | null;
	};
	progress: NotificationProgress;
	actions: NotificationActions;
}

// ============================================================================
// Generic Notification
// ============================================================================

export interface GenericNotification extends BaseNotification {
	type: 'generic';
	data: {
		title: string;
		subtitle?: string;
		message?: string;
		metadata?: Record<string, any>;
		error?: string;
	};
	progress: NotificationProgress;
	actions: NotificationActions;
}

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * Notification discriminated union
 * Use this type for all notification handling
 */
export type Notification =
	| TimeBlockNotification
	| ProjectSynthesisNotification
	| CalendarAnalysisNotification
	| AgentRunNotification
	| ChatSessionNotification
	| GenericNotification;

// ============================================================================
// Store State & Configuration
// ============================================================================

export interface NotificationConfig {
	/** Maximum visible notifications in stack (older ones collapse) */
	maxStackSize: number;

	/** Default auto-close timeout in milliseconds */
	defaultAutoCloseMs: number;

	/** Stack position on screen */
	stackPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

	/** Vertical spacing between notifications (pixels) */
	stackSpacing: number;

	/** Enable notification sounds */
	enableSounds: boolean;

	/** Enable notification history */
	enableHistory: boolean;
}

export interface NotificationStoreState {
	/** Active notifications (Map for O(1) access) */
	notifications: Map<string, Notification>;

	/** Stack order - array of notification IDs (bottom to top) */
	stack: string[];

	/** Currently expanded notification ID (null = all minimized) */
	expandedId: string | null;

	/** History of completed/dismissed notifications */
	history: Notification[];

	/** Global configuration */
	config: NotificationConfig;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isProjectSynthesisNotification(
	notification: Notification
): notification is ProjectSynthesisNotification {
	return notification.type === 'project-synthesis';
}

export function isCalendarAnalysisNotification(
	notification: Notification
): notification is CalendarAnalysisNotification {
	return notification.type === 'calendar-analysis';
}

export function isTimeBlockNotification(
	notification: Notification
): notification is TimeBlockNotification {
	return notification.type === 'time-block';
}

export function isGenericNotification(
	notification: Notification
): notification is GenericNotification {
	return notification.type === 'generic';
}

export function isAgentRunNotification(
	notification: Notification
): notification is AgentRunNotification {
	return notification.type === 'agent-run';
}

export function isChatSessionNotification(
	notification: Notification
): notification is ChatSessionNotification {
	return notification.type === 'chat-session';
}

// ============================================================================
// Helper Types for Creating Notifications
// ============================================================================

/**
 * Omit auto-generated fields when creating a notification
 */
export type CreateNotificationInput<T extends Notification> = Omit<
	T,
	'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Partial updates for existing notifications
 */
export type UpdateNotificationInput = Partial<Omit<Notification, 'id' | 'type' | 'createdAt'>>;
