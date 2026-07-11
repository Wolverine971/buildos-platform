// apps/web/src/lib/services/chat-session-notification.bridge.ts
//
// Bridges parked (minimized) agent chats into the generic notification stack
// as `chat-session` cards.
//
// Lifecycle:
//   - The chat modal's minimize path calls `parkChatSession()` instead of
//     finalizing the session — the session stays open server-side and any
//     in-flight turn keeps executing detached (the stream route continues a
//     turn after SSE disconnect and persists the result).
//   - While a parked turn is running, this bridge polls the lightweight
//     active-turn probe until the turn lands, then flips the card to
//     "response ready" with a reply preview.
//   - Clicking the card reopens the real chat modal (via the existing
//     `buildos:open-agent-chat` window event) and removes the card — the chat
//     IS the expanded view; there is no NotificationModal content for this type.
//   - Dismissing the card ends the chat: it runs the same close + classify
//     calls the modal's own teardown would have run.

import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import { toastService } from '$lib/stores/toast.store';
import { probeActiveTurnRun } from '$lib/components/agent/agent-chat-session';
import type { ChatContextType } from '@buildos/shared-types';
import type { ChatSessionNotification } from '$lib/types/notification.types';

// Backoff schedule for the active-turn probe. The server caps a detached turn
// at ~285s, so the poll is bounded; keep probing a bit past the cap before
// declaring the turn stale.
const PROBE_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 12_000, 15_000];
const PROBE_MAX_TOTAL_MS = 6.5 * 60 * 1000;
const RESPONSE_PREVIEW_MAX_CHARS = 140;

// sessionId → notificationId
const parked = new Map<string, string>();
const probeTimers = new Map<string, ReturnType<typeof setTimeout>>();
let initialized = false;

export interface ParkChatSessionInput {
	sessionId: string;
	title: string;
	contextType: ChatContextType | null;
	entityId?: string | null;
	projectId?: string | null;
	/** Whether a turn was streaming (or restored-active) when the chat was parked. */
	hasActiveTurn: boolean;
	hasSentMessage: boolean;
}

/**
 * Park a chat session as a stack card. Idempotent per session — re-parking an
 * already-parked session refreshes the existing card instead of adding a
 * duplicate.
 */
export function parkChatSession(input: ParkChatSessionInput): string {
	const existingId = parked.get(input.sessionId);
	const status: ChatSessionNotification['status'] = input.hasActiveTurn ? 'processing' : 'idle';
	const progress: ChatSessionNotification['progress'] = {
		type: 'indeterminate',
		message: input.hasActiveTurn ? 'Working on a response…' : 'Paused — tap to resume'
	};
	const data: ChatSessionNotification['data'] = {
		sessionId: input.sessionId,
		title: input.title,
		contextType: input.contextType,
		entityId: input.entityId ?? null,
		projectId: input.projectId ?? null,
		hasActiveTurn: input.hasActiveTurn,
		responsePreview: null,
		hasSentMessage: input.hasSentMessage
	};

	let notificationId: string;
	if (existingId && get(notificationStore).notifications.has(existingId)) {
		notificationId = existingId;
		notificationStore.update(notificationId, {
			status,
			data,
			progress,
			actions: buildActions(input.sessionId),
			isMinimized: true
		});
	} else {
		const notification: Omit<ChatSessionNotification, 'id' | 'createdAt' | 'updatedAt'> = {
			type: 'chat-session',
			status,
			isMinimized: true,
			isPersistent: true,
			autoCloseMs: null,
			data,
			progress,
			actions: buildActions(input.sessionId)
		};
		notificationId = notificationStore.add(notification);
		parked.set(input.sessionId, notificationId);
	}

	if (input.hasActiveTurn) {
		startProbe(input.sessionId);
	} else {
		stopProbe(input.sessionId);
	}

	return notificationId;
}

/**
 * Drop a parked card without any side effects (used when the chat is reopened
 * through a path the bridge didn't initiate, e.g. the history page).
 */
export function resolveParkedChatSession(sessionId: string): void {
	const id = parked.get(sessionId);
	stopProbe(sessionId);
	parked.delete(sessionId);
	if (id && get(notificationStore).notifications.has(id)) {
		notificationStore.remove(id);
	}
}

export function initChatSessionNotificationBridge(): void {
	if (!browser || initialized) return;

	// Re-attach to cards persisted in sessionStorage: hydrated action invokers
	// point at an empty registry, so re-register the live handlers, and
	// reconcile any card still marked processing (its turn almost certainly
	// finished — or died — while we were away).
	const current = get(notificationStore);
	for (const notification of current.notifications.values()) {
		if (notification.type !== 'chat-session') continue;
		const sessionId = notification.data.sessionId;
		if (!sessionId) continue;
		parked.set(sessionId, notification.id);
		notificationStore.update(notification.id, { actions: buildActions(sessionId) });
		if (notification.status === 'processing') {
			startProbe(sessionId);
		}
	}

	initialized = true;
	console.log('[ChatSessionNotificationBridge] Initialized');
}

export function destroyChatSessionNotificationBridge(): void {
	if (!initialized) return;
	for (const timer of probeTimers.values()) clearTimeout(timer);
	probeTimers.clear();
	parked.clear();
	initialized = false;
	console.log('[ChatSessionNotificationBridge] Destroyed');
}

// ============================================================================
// Actions
// ============================================================================

function buildActions(sessionId: string): ChatSessionNotification['actions'] {
	return {
		view: () => openParkedChatSession(sessionId),
		dismiss: () => dismissParkedChatSession(sessionId)
	};
}

function openParkedChatSession(sessionId: string): void {
	const id = parked.get(sessionId);
	const notification = id ? getCard(id) : undefined;

	stopProbe(sessionId);
	parked.delete(sessionId);
	if (id) notificationStore.remove(id);

	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent('buildos:open-agent-chat', {
			detail: {
				sessionId,
				contextType: notification?.data.contextType ?? null,
				entityId: notification?.data.entityId ?? null,
				projectId: notification?.data.projectId ?? null,
				source: 'chat-session-notification'
			}
		})
	);
}

function dismissParkedChatSession(sessionId: string): void {
	const id = parked.get(sessionId);
	const notification = id ? getCard(id) : undefined;

	stopProbe(sessionId);
	parked.delete(sessionId);
	if (id) notificationStore.remove(id);

	// Dismiss = end the chat: run the close + classify the modal's own
	// teardown skipped when the session was parked.
	void finalizeSessionRemotely(sessionId, notification?.data ?? null);

	// Let a hidden keep-alive instance hosting this session know it should
	// unmount (Navigation listens).
	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent('buildos:chat-session-dismissed', { detail: { sessionId } })
		);
	}
}

async function finalizeSessionRemotely(
	sessionId: string,
	data: ChatSessionNotification['data'] | null
): Promise<void> {
	const hasSentMessage = data?.hasSentMessage ?? true;
	try {
		// The close endpoint's schema is strict and context_type is not
		// nullable — only include the fields we actually have.
		const body: Record<string, unknown> = {
			reason: 'close',
			has_messages_sent: hasSentMessage,
			entity_id: data?.entityId ?? null
		};
		if (data?.contextType) {
			body.context_type = data.contextType;
		}
		const response = await fetch(`/api/chat/sessions/${sessionId}/close`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			keepalive: true,
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(`close returned ${response.status}`);
	} catch (error) {
		console.warn('[ChatSessionNotificationBridge] Session close failed:', error);
		if (hasSentMessage) {
			fetch(`/api/chat/sessions/${sessionId}/classify`, {
				method: 'POST',
				keepalive: true
			}).catch(() => {});
		}
	}
}

// ============================================================================
// Active-turn probe
// ============================================================================

function startProbe(sessionId: string): void {
	stopProbe(sessionId);
	if (typeof window === 'undefined') return;

	const startedAt = Date.now();
	let attempt = 0;

	const schedule = () => {
		const delay = PROBE_DELAYS_MS[Math.min(attempt, PROBE_DELAYS_MS.length - 1)];
		attempt += 1;
		probeTimers.set(
			sessionId,
			setTimeout(() => {
				void tick();
			}, delay)
		);
	};

	const tick = async () => {
		probeTimers.delete(sessionId);
		if (!getParkedCardId(sessionId)) return;

		const result = await probeActiveTurnRun(sessionId).catch(() => null);

		// Re-check after the await — the card may have been opened/dismissed.
		const notificationId = getParkedCardId(sessionId);
		if (!notificationId) return;

		if (result && !result.hasActiveTurnRun) {
			await markTurnFinished(sessionId, notificationId);
			return;
		}

		if (Date.now() - startedAt > PROBE_MAX_TOTAL_MS) {
			markTurnStale(notificationId);
			return;
		}

		schedule();
	};

	schedule();
}

function stopProbe(sessionId: string): void {
	const timer = probeTimers.get(sessionId);
	if (timer) {
		clearTimeout(timer);
		probeTimers.delete(sessionId);
	}
}

async function markTurnFinished(sessionId: string, notificationId: string): Promise<void> {
	const preview = await fetchResponsePreview(sessionId);
	const current = getCard(notificationId);
	if (!current || getParkedCardId(sessionId) !== notificationId) return;

	notificationStore.update(notificationId, {
		status: 'success',
		data: { ...current.data, hasActiveTurn: false, responsePreview: preview },
		progress: { type: 'indeterminate', message: 'Response ready — tap to review' }
	});
	toastService.success(`${current.data.title}: response ready.`);
}

function markTurnStale(notificationId: string): void {
	const current = getCard(notificationId);
	if (!current) return;
	notificationStore.update(notificationId, {
		status: 'warning',
		data: { ...current.data, hasActiveTurn: false },
		progress: { type: 'indeterminate', message: 'Still unfinished — reopen to check' }
	});
}

async function fetchResponsePreview(sessionId: string): Promise<string | null> {
	try {
		const response = await fetch(`/api/chat/sessions/${sessionId}`);
		if (!response.ok) return null;
		const result = await response.json().catch(() => null);
		const messages = Array.isArray(result?.data?.messages) ? result.data.messages : [];
		// Messages come back oldest-first — walk backwards for the newest reply.
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (
				message &&
				message.role === 'assistant' &&
				typeof message.content === 'string' &&
				message.content.trim()
			) {
				// One-line plain-text preview: drop markdown syntax tokens.
				const text = message.content
					.replace(/[#*_`>|]+/g, ' ')
					.replace(/\s+/g, ' ')
					.trim();
				if (!text) return null;
				return text.length > RESPONSE_PREVIEW_MAX_CHARS
					? `${text.slice(0, RESPONSE_PREVIEW_MAX_CHARS)}…`
					: text;
			}
		}
		return null;
	} catch {
		return null;
	}
}

// ============================================================================
// Helpers
// ============================================================================

function getCard(notificationId: string): ChatSessionNotification | undefined {
	const notification = get(notificationStore).notifications.get(notificationId);
	return notification?.type === 'chat-session' ? notification : undefined;
}

/** The card id for a session, or null if the card was opened/dismissed. */
function getParkedCardId(sessionId: string): string | null {
	const id = parked.get(sessionId);
	if (!id) return null;
	if (!get(notificationStore).notifications.has(id)) {
		parked.delete(sessionId);
		return null;
	}
	return id;
}
