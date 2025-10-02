// apps/web/src/lib/types/notification.types.ts

/**
 * Generic Stackable Notification System Types
 *
 * This file defines the type system for the generic notification stack.
 * All notification types extend BaseNotification and use discriminated unions.
 */

import type { BrainDumpParseResult } from './brain-dump';
import type { Phase } from './project';

// ============================================================================
// Core Enums & Primitives
// ============================================================================

/**
 * Notification status lifecycle
 */
export type NotificationStatus =
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
	| 'brain-dump'
	| 'phase-generation'
	| 'calendar-analysis'
	| 'daily-brief'
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
	status: NotificationStatus;

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
}

export interface PercentageProgress {
	type: 'percentage';
	percentage: number; // 0-100
	message?: string;
}

export interface StepsProgress {
	type: 'steps';
	currentStep: number;
	totalSteps: number;
	steps: Array<{
		name: string;
		status: 'pending' | 'processing' | 'completed' | 'error';
	}>;
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
// Brain Dump Notification
// ============================================================================

export interface BrainDumpNotification extends BaseNotification {
	type: 'brain-dump';
	data: {
		brainDumpId: string;
		inputText: string;
		selectedProject?: {
			id: string;
			name: string;
		};
		processingType: 'short' | 'dual' | 'background';
		streamingState?: {
			contextStatus?: 'processing' | 'completed' | 'error';
			tasksStatus?: 'processing' | 'completed' | 'error';
			contextProgress?: string;
			tasksProgress?: string;
			contextResult?: any;
			tasksResult?: any;
		};
		parseResults?: BrainDumpParseResult;
		executionResult?: {
			successful: any[];
			failed: any[];
		};
		error?: string;
	};
	progress: NotificationProgress;
	actions: NotificationActions;
}

// ============================================================================
// Phase Generation Notification
// ============================================================================

export interface PhaseGenerationNotification extends BaseNotification {
	type: 'phase-generation';
	data: {
		projectId: string;
		projectName: string;
		isRegeneration: boolean;
		strategy: 'phases-only' | 'schedule-in-phases' | 'calendar-optimized';
		taskCount: number;
		result?: {
			phases: Phase[];
			backlogTasks: any[];
		};
		error?: string;
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
	| BrainDumpNotification
	| PhaseGenerationNotification
	| CalendarAnalysisNotification
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

export function isBrainDumpNotification(
	notification: Notification
): notification is BrainDumpNotification {
	return notification.type === 'brain-dump';
}

export function isPhaseGenerationNotification(
	notification: Notification
): notification is PhaseGenerationNotification {
	return notification.type === 'phase-generation';
}

export function isCalendarAnalysisNotification(
	notification: Notification
): notification is CalendarAnalysisNotification {
	return notification.type === 'calendar-analysis';
}

export function isGenericNotification(
	notification: Notification
): notification is GenericNotification {
	return notification.type === 'generic';
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
