// apps/web/src/lib/services/daily-brief-notification.bridge.ts
//
// Bridges daily-brief generation into the bottom-right notification stack as a
// `daily-brief` card. It replaced the progress pill that sat in the top nav
// (crowded, desktop-only) on 2026-10-29.
//
// Source of truth is `briefNotificationStatus` (realtimeBrief.service), the
// realtime view of the user's active `generate_daily_brief` job:
//   - isGenerating                 → one processing card: step message + progress bar
//   - status 'completed'           → the card flips to "ready", auto-closes; click opens the brief
//   - status 'failed'              → the card flips to error and stays until dismissed
//   - status 'cancelled'           → the card the user was watching flips to cancelled, auto-closes
//   - bare { isGenerating: false } (cleared on init / reconnect / polling)
//                                  → a processing card is removed quietly; a settled card stays
//
// One card slot: a regeneration reuses the card instead of stacking a second.
// Hiding a processing card hides it for that job only — completion and failure
// still surface, so hiding the progress never swallows "your brief is ready".
// Clicking the card navigates; there is no NotificationModal view for this type.

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import {
	briefNotificationStatus,
	type BriefNotificationStatus
} from '$lib/services/realtimeBrief.service';
import { getCurrentDateInTimezone, getUserTimezone } from '$lib/utils/timezone';
import type { DailyBriefNotification } from '$lib/types/notification.types';

export const DAILY_BRIEF_READY_AUTO_CLOSE_MS = 15_000;
export const DAILY_BRIEF_CANCELLED_AUTO_CLOSE_MS = 8_000;

type CardFields = Pick<DailyBriefNotification, 'status' | 'data' | 'progress'>;

let cardId: string | null = null;
/** Job the current card tracks; broadcast-only signals carry just the date. */
let cardJobId: string | null = null;
let cardBriefDate: string | null = null;
/** Processing cards the user hid, by job key — not re-added on the next progress tick. */
const hiddenJobKeys = new Set<string>();
/**
 * Last terminal signal we showed. Realtime can deliver a completion twice (job
 * row update + broadcast); once the card has auto-closed, the echo must not
 * resurrect it. Reset by the next processing signal so a regeneration shows.
 */
let lastSettledKey: string | null = null;
// The store only starts auto-close timers in add(), so the bridge owns the
// timer for cards that settle in place (ready / cancelled).
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let initialized = false;

export function initDailyBriefNotificationBridge(): void {
	if (!browser || initialized) return;
	initialized = true;

	// Cards persisted by a previous page load are stale: a processing card has
	// no live job behind it, and a settled card already had its moment. The
	// status store re-derives the active job on init and recreates the card.
	for (const notification of get(notificationStore).notifications.values()) {
		if (notification.type === 'daily-brief') notificationStore.remove(notification.id);
	}

	unsubscribe = briefNotificationStatus.subscribe(handleStatus);
	console.log('[DailyBriefNotificationBridge] Initialized');
}

export function destroyDailyBriefNotificationBridge(): void {
	if (!initialized) return;
	unsubscribe?.();
	unsubscribe = null;
	clearAutoClose();
	cardId = null;
	cardJobId = null;
	cardBriefDate = null;
	hiddenJobKeys.clear();
	lastSettledKey = null;
	initialized = false;
	console.log('[DailyBriefNotificationBridge] Destroyed');
}

/** "Today" in the user's timezone, otherwise a short date such as "Oct 28". */
export function formatBriefDateLabel(
	briefDate: string | null | undefined,
	timezone?: string | null
): string {
	if (!briefDate) return 'Today';

	let today: string | null = null;
	try {
		today = getCurrentDateInTimezone(timezone || getUserTimezone());
	} catch {
		today = null;
	}
	if (today && briefDate === today) return 'Today';

	const [year, month, day] = briefDate.split('-').map(Number);
	if (!year || !month || !day) return briefDate;
	return new Date(year, month - 1, day).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	});
}

// ============================================================================
// Status → card
// ============================================================================

function handleStatus(status: BriefNotificationStatus): void {
	if (status.isGenerating) {
		lastSettledKey = null;
		if (hiddenJobKeys.has(jobKey(status))) return;
		clearAutoClose();
		upsertCard(status, processingFields(status));
		return;
	}

	switch (status.status) {
		case 'completed':
			if (isSettledEcho(status)) return;
			settle(status, readyFields(status), DAILY_BRIEF_READY_AUTO_CLOSE_MS);
			return;
		case 'failed':
			if (isSettledEcho(status)) return;
			settle(status, failedFields(status), null);
			return;
		case 'cancelled':
			// Only worth saying when the user was watching this job.
			if (liveCardId() && matchesCard(status)) {
				settle(status, cancelledFields(status), DAILY_BRIEF_CANCELLED_AUTO_CLOSE_MS);
			}
			return;
		default: {
			// Cleared without a verdict (init / reconnect / polling saw it end):
			// drop a processing card, leave a settled one to its own timer.
			const id = liveCardId();
			const card = id ? getCard(id) : undefined;
			if (card?.status === 'processing') removeCard();
		}
	}
}

function settle(status: BriefNotificationStatus, fields: CardFields, autoCloseMs: number | null) {
	hiddenJobKeys.delete(jobKey(status));
	lastSettledKey = settledKey(status);
	upsertCard(status, fields);
	if (autoCloseMs) {
		scheduleAutoClose(autoCloseMs);
	} else {
		clearAutoClose();
	}
}

/** A repeat of the terminal signal we already showed, arriving after the card is gone. */
function isSettledEcho(status: BriefNotificationStatus): boolean {
	return !liveCardId() && lastSettledKey !== null && settledKey(status) === lastSettledKey;
}

function upsertCard(status: BriefNotificationStatus, fields: CardFields): void {
	const id = liveCardId();
	const actions = buildActions();

	if (id) {
		notificationStore.update(id, { ...fields, actions, isMinimized: true });
	} else {
		const notification: Omit<DailyBriefNotification, 'id' | 'createdAt' | 'updatedAt'> = {
			type: 'daily-brief',
			isMinimized: true,
			isPersistent: true,
			autoCloseMs: null,
			...fields,
			actions
		};
		cardId = notificationStore.add(notification);
	}

	if (status.jobId) cardJobId = status.jobId;
	if (status.briefDate) cardBriefDate = status.briefDate;
}

// ============================================================================
// Card content
// ============================================================================

function processingFields(status: BriefNotificationStatus): CardFields {
	const percentage = clampPercent(status.progress);
	const message =
		status.message?.trim() || (status.status === 'pending' ? 'Queued…' : 'Starting…');
	return {
		status: 'processing',
		data: baseData(status, { message }),
		progress:
			percentage > 0
				? { type: 'percentage', percentage, message }
				: { type: 'indeterminate', message }
	};
}

function readyFields(status: BriefNotificationStatus): CardFields {
	return {
		status: 'success',
		data: baseData(status, {}),
		progress: { type: 'binary', message: 'Tap to read it' }
	};
}

function failedFields(status: BriefNotificationStatus): CardFields {
	const error = status.error?.trim() || 'Brief generation failed';
	return {
		status: 'error',
		data: baseData(status, { error }),
		progress: { type: 'binary', message: error }
	};
}

function cancelledFields(status: BriefNotificationStatus): CardFields {
	return {
		status: 'cancelled',
		data: baseData(status, {}),
		progress: { type: 'binary', message: status.message || 'Brief generation was cancelled' }
	};
}

function baseData(
	status: BriefNotificationStatus,
	extra: Partial<DailyBriefNotification['data']>
): DailyBriefNotification['data'] {
	const briefDate = status.briefDate ?? cardBriefDate ?? null;
	return {
		briefDate,
		dateLabel: formatBriefDateLabel(briefDate, status.timezone),
		jobId: status.jobId ?? cardJobId ?? null,
		message: null,
		error: null,
		...extra
	};
}

function clampPercent(value: number | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
	return Math.round(Math.min(100, Math.max(0, value)));
}

// ============================================================================
// Actions
// ============================================================================

function buildActions(): DailyBriefNotification['actions'] {
	return {
		view: () => openBrief(),
		dismiss: () => dismissCard()
	};
}

function openBrief(): void {
	const id = liveCardId();
	const card = id ? getCard(id) : undefined;
	const briefDate = card?.data.briefDate ?? cardBriefDate;

	// A processing card stays while the user peeks; a settled card is spent once opened.
	if (card && card.status !== 'processing') removeCard();

	void goto(briefDate ? `/briefs?date=${encodeURIComponent(briefDate)}&view=single` : '/briefs');
}

function dismissCard(): void {
	const id = liveCardId();
	const card = id ? getCard(id) : undefined;
	if (card?.status === 'processing') {
		hiddenJobKeys.add(jobKey({ jobId: card.data.jobId, briefDate: card.data.briefDate }));
	}
	removeCard();
}

// ============================================================================
// Helpers
// ============================================================================

function jobKey(source: { jobId?: string | null; briefDate?: string | null }): string {
	return source.jobId ?? (source.briefDate ? `date:${source.briefDate}` : 'unknown');
}

function settledKey(status: BriefNotificationStatus): string {
	// Both the job-row and broadcast signals carry the brief date; the job id
	// alone would make the broadcast echo look like a different completion.
	return `${status.status}:${status.briefDate ?? status.jobId ?? 'unknown'}`;
}

function matchesCard(status: BriefNotificationStatus): boolean {
	if (status.jobId && cardJobId) return status.jobId === cardJobId;
	if (status.briefDate && cardBriefDate) return status.briefDate === cardBriefDate;
	return true;
}

function liveCardId(): string | null {
	if (!cardId) return null;
	if (!get(notificationStore).notifications.has(cardId)) {
		// Auto-closed, or removed elsewhere (e.g. "clear all").
		cardId = null;
		return null;
	}
	return cardId;
}

function getCard(notificationId: string): DailyBriefNotification | undefined {
	const notification = get(notificationStore).notifications.get(notificationId);
	return notification?.type === 'daily-brief' ? notification : undefined;
}

function removeCard(): void {
	clearAutoClose();
	const id = liveCardId();
	cardId = null;
	if (id) notificationStore.remove(id);
}

function scheduleAutoClose(ms: number): void {
	clearAutoClose();
	if (typeof window === 'undefined') return;
	autoCloseTimer = setTimeout(() => {
		autoCloseTimer = null;
		removeCard();
	}, ms);
}

function clearAutoClose(): void {
	if (autoCloseTimer) {
		clearTimeout(autoCloseTimer);
		autoCloseTimer = null;
	}
}
