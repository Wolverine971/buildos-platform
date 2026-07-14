// apps/web/src/lib/services/agent-run-notification.bridge.ts
//
// Bridges `agentRunsStore` (fed by agentRunsRealtime) into the generic
// notification stack as `agent-run` cards (03 Monitoring UI, UI-P1).
//
// Surfacing rules:
//   - A run becomes a card only when first observed in an ACTIVE status. Runs
//     first seen already terminal are history and never pop a card.
//   - Tracked runs are followed through to their terminal status; the card then
//     auto-minimizes after a beat (it is not auto-removed — the user dismisses).
//   - A dismissed run is never resurrected by a later store update.
//
// Mirrors the time-block bridge (store-subscription → notification sync).

import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import {
	agentRunsStore,
	isActiveAgentRunStatus,
	type AgentRunRow
} from './agentRunsRealtime.service';
import {
	buildAgentRunNotificationData,
	buildAgentRunProgress,
	buildAgentRunCardPreview,
	toUiAgentRunStatus,
	parseAgentRunResult
} from './agent-run-notification-data';
import type { AgentRunNotification } from '$lib/types/notification.types';
import { toastService } from '$lib/stores/toast.store';

const AUTO_MINIMIZE_MS = 4000;

// runId → notificationId
const activeNotifications = new Map<string, string>();
// runId → "status|updated_at" of the last sync, to skip redundant work.
const lastSyncedHash = new Map<string, string>();
// runIds the user dismissed — never resurrect.
const dismissed = new Set<string>();
// runIds we have already toasted a terminal result for.
const toasted = new Set<string>();
const autoMinimizeTimers = new Map<string, ReturnType<typeof setTimeout>>();

let unsubscribe: (() => void) | null = null;
let initialized = false;

export function initAgentRunNotificationBridge(): void {
	if (!browser || initialized) return;

	// Re-attach to any agent-run notifications already in the store (e.g. after
	// session-storage hydration). Hydrated action invokers point at an empty
	// registry, so re-register actions now (mirrors the time-block bridge) — else
	// Dismiss/Retry/View on a persisted card silently no-op until the run re-syncs.
	const current = get(notificationStore);
	for (const notification of current.notifications.values()) {
		if (notification.type !== 'agent-run') continue;
		const runId = notification.data.runId;
		if (!runId) continue;
		activeNotifications.set(runId, notification.id);
		notificationStore.update(notification.id, { actions: buildActions(runId) });
	}

	unsubscribe = agentRunsStore.subscribe((runs) => {
		for (const run of runs.values()) {
			syncRunToNotification(run);
		}
	});

	initialized = true;
	console.log('[AgentRunNotificationBridge] Initialized');
}

export function destroyAgentRunNotificationBridge(): void {
	if (!initialized) return;
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
	for (const timer of autoMinimizeTimers.values()) clearTimeout(timer);
	autoMinimizeTimers.clear();
	activeNotifications.clear();
	lastSyncedHash.clear();
	dismissed.clear();
	toasted.clear();
	initialized = false;
	console.log('[AgentRunNotificationBridge] Destroyed');
}

function syncRunToNotification(run: AgentRunRow): void {
	if (dismissed.has(run.id)) return;

	// Project relationship hydration can arrive without changing the underlying
	// agent_runs timestamp. Include the card context so that enrichment still
	// refreshes an already-visible notification.
	const cardPreview = buildAgentRunCardPreview(run);
	const hash = `${run.status}|${run.updated_at}|${cardPreview.projectName ?? ''}|${cardPreview.activityLabel}|${cardPreview.targetLabel ?? ''}|${cardPreview.preview}`;
	if (lastSyncedHash.get(run.id) === hash) return;
	lastSyncedHash.set(run.id, hash);

	let notificationId = activeNotifications.get(run.id);

	// First sight: only surface in-flight runs; terminal runs are history.
	if (!notificationId) {
		if (!isActiveAgentRunStatus(run.status)) return;
		notificationId = createNotification(run);
		activeNotifications.set(run.id, notificationId);
		return;
	}

	// Guard against a card the user already removed.
	if (!get(notificationStore).notifications.has(notificationId)) {
		activeNotifications.delete(run.id);
		dismissed.add(run.id);
		return;
	}

	updateNotification(notificationId, run);
}

function createNotification(run: AgentRunRow): string {
	const notification: Omit<AgentRunNotification, 'id' | 'createdAt' | 'updatedAt'> = {
		type: 'agent-run',
		status: toUiAgentRunStatus(run.status),
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: buildAgentRunNotificationData(run),
		progress: buildAgentRunProgress(run),
		actions: buildActions(run.id)
	};
	const notificationId = notificationStore.add(notification);
	console.log('[AgentRunNotificationBridge] Created card', { runId: run.id, notificationId });
	return notificationId;
}

function updateNotification(notificationId: string, run: AgentRunRow): void {
	notificationStore.update(notificationId, {
		status: toUiAgentRunStatus(run.status),
		data: buildAgentRunNotificationData(run),
		progress: buildAgentRunProgress(run),
		actions: buildActions(run.id)
	});

	if (!isActiveAgentRunStatus(run.status)) {
		maybeToastTerminal(run);
		startAutoMinimize(notificationId);
	} else {
		clearAutoMinimize(notificationId);
	}
}

function buildActions(runId: string): AgentRunNotification['actions'] {
	return {
		view: () => {
			const id = activeNotifications.get(runId);
			if (id) notificationStore.expand(id);
		},
		dismiss: () => {
			const id = activeNotifications.get(runId);
			if (id) {
				notificationStore.remove(id);
				clearAutoMinimize(id);
			}
			activeNotifications.delete(runId);
			lastSyncedHash.delete(runId);
			dismissed.add(runId);
		},
		cancel: () => {
			void cancelRun(runId);
		},
		retry: () => {
			void retryRun(runId);
		}
	};
}

async function cancelRun(runId: string): Promise<void> {
	try {
		const response = await fetch(`/api/agent-runs/${runId}/cancel`, { method: 'POST' });
		if (!response.ok) {
			toastService.error('Could not cancel the run');
			return;
		}
		toastService.info('Cancelling run…');
	} catch (error) {
		console.error('[AgentRunNotificationBridge] Cancel failed', error);
		toastService.error('Could not cancel the run');
	}
}

async function retryRun(runId: string): Promise<void> {
	const run = get(agentRunsStore).get(runId);
	if (!run) return;
	try {
		const response = await fetch('/api/agent-runs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				label: run.label,
				goal: run.goal,
				instructions: run.instructions ?? undefined,
				expected_output: run.expected_output ?? undefined,
				context_type: run.context_type,
				project_id: run.project_id ?? undefined,
				scope_mode: run.scope_mode,
				allowed_ops: run.allowed_ops ?? undefined,
				review: run.review_required,
				budgets: run.budgets ?? undefined
			})
		});
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			toastService.error(body?.error || 'Could not re-run the agent');
			return;
		}
		toastService.success('Re-dispatched the run');
	} catch (error) {
		console.error('[AgentRunNotificationBridge] Retry failed', error);
		toastService.error('Could not re-run the agent');
	}
}

function maybeToastTerminal(run: AgentRunRow): void {
	if (toasted.has(run.id)) return;
	toasted.add(run.id);

	const result = parseAgentRunResult(run.result);
	if (run.status === 'completed') {
		const n = result?.entities_touched?.length ?? 0;
		toastService.success(
			n > 0
				? `${run.label} finished — ${n} change${n === 1 ? '' : 's'}.`
				: `${run.label} finished.`
		);
	} else if (run.status === 'proposal_ready') {
		const n = result?.proposed_changes?.changes?.length ?? 0;
		toastService.info(`${run.label} proposed ${n} change${n === 1 ? '' : 's'} — review.`);
	} else if (run.status === 'failed') {
		toastService.error(`${run.label} failed.`);
	}
}

function startAutoMinimize(notificationId: string): void {
	clearAutoMinimize(notificationId);
	if (typeof window === 'undefined') return;
	const timer = setTimeout(() => {
		if (get(notificationStore).notifications.has(notificationId)) {
			notificationStore.minimize(notificationId);
		}
		autoMinimizeTimers.delete(notificationId);
	}, AUTO_MINIMIZE_MS);
	autoMinimizeTimers.set(notificationId, timer);
}

function clearAutoMinimize(notificationId: string): void {
	const timer = autoMinimizeTimers.get(notificationId);
	if (timer) {
		clearTimeout(timer);
		autoMinimizeTimers.delete(notificationId);
	}
}
