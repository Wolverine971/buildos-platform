// apps/web/src/lib/services/chat-session-notification.bridge.test.ts
// @vitest-environment jsdom
// apps/web/src/lib/services/chat-session-notification.bridge.test.ts

import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationStore } from '$lib/stores/notification.store';
import type { ChatSessionNotification } from '$lib/types/notification.types';
import {
	destroyChatSessionNotificationBridge,
	initChatSessionNotificationBridge,
	parkChatSession,
	resolveParkedChatSession
} from './chat-session-notification.bridge';

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function getCards(): ChatSessionNotification[] {
	return Array.from(get(notificationStore).notifications.values()).filter(
		(notification): notification is ChatSessionNotification =>
			notification.type === 'chat-session'
	);
}

describe('chat-session-notification.bridge', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		initChatSessionNotificationBridge();
	});

	afterEach(() => {
		destroyChatSessionNotificationBridge();
		notificationStore.clear();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('parks an idle chat as an idle card without scheduling a probe', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		parkChatSession({
			sessionId: 'session-idle',
			title: 'Morning planning',
			contextType: 'global',
			contextLabel: 'Workspace',
			hasActiveTurn: false,
			hasSentMessage: true
		});

		const cards = getCards();
		expect(cards).toHaveLength(1);
		expect(cards[0].status).toBe('idle');
		expect(cards[0].data.title).toBe('Morning planning');
		expect(cards[0].data.contextLabel).toBe('Workspace');
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('re-parking the same session updates the existing card instead of duplicating', () => {
		vi.stubGlobal('fetch', vi.fn());

		parkChatSession({
			sessionId: 'session-1',
			title: 'First title',
			contextType: 'global',
			hasActiveTurn: false,
			hasSentMessage: false
		});
		parkChatSession({
			sessionId: 'session-1',
			title: 'Renamed chat',
			contextType: 'project',
			entityId: 'project-9',
			hasActiveTurn: false,
			hasSentMessage: true
		});

		const cards = getCards();
		expect(cards).toHaveLength(1);
		expect(cards[0].data.title).toBe('Renamed chat');
		expect(cards[0].data.entityId).toBe('project-9');
	});

	it('view action removes the card and dispatches buildos:open-agent-chat with the parked context', () => {
		vi.stubGlobal('fetch', vi.fn());
		const openEvents: CustomEvent[] = [];
		const listener = (event: Event) => openEvents.push(event as CustomEvent);
		window.addEventListener('buildos:open-agent-chat', listener);

		try {
			parkChatSession({
				sessionId: 'session-2',
				title: 'Project chat',
				contextType: 'project',
				entityId: 'project-1',
				projectId: 'project-1',
				hasActiveTurn: false,
				hasSentMessage: true
			});

			const card = getCards()[0];
			card.actions.view?.();

			expect(getCards()).toHaveLength(0);
			expect(openEvents).toHaveLength(1);
			expect(openEvents[0].detail).toMatchObject({
				sessionId: 'session-2',
				contextType: 'project',
				entityId: 'project-1',
				projectId: 'project-1'
			});
		} finally {
			window.removeEventListener('buildos:open-agent-chat', listener);
		}
	});

	it('dismiss action removes the card and finalizes the session server-side', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
		vi.stubGlobal('fetch', fetchMock);

		parkChatSession({
			sessionId: 'session-3',
			title: 'To dismiss',
			contextType: 'project',
			entityId: 'project-2',
			hasActiveTurn: false,
			hasSentMessage: true
		});

		getCards()[0].actions.dismiss?.();
		await vi.runAllTimersAsync();

		expect(getCards()).toHaveLength(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/chat/sessions/session-3/close');
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({
			reason: 'close',
			has_messages_sent: true,
			entity_id: 'project-2',
			context_type: 'project'
		});
	});

	it('omits context_type from the close body when the parked context is null', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
		vi.stubGlobal('fetch', fetchMock);

		parkChatSession({
			sessionId: 'session-null-context',
			title: 'No context',
			contextType: null,
			hasActiveTurn: false,
			hasSentMessage: false
		});

		getCards()[0].actions.dismiss?.();
		await vi.runAllTimersAsync();

		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body).not.toHaveProperty('context_type');
		expect(body.has_messages_sent).toBe(false);
	});

	it('probes an active turn to completion and flips the card to response-ready with a preview', async () => {
		let probeCalls = 0;
		const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('probe=active-turn')) {
				probeCalls += 1;
				return Promise.resolve(
					jsonResponse({
						success: true,
						data: {
							turnRuns: probeCalls === 1 ? [{ id: 'turn-1', status: 'running' }] : []
						}
					})
				);
			}
			return Promise.resolve(
				jsonResponse({
					success: true,
					data: {
						messages: [
							{ role: 'user', content: 'Plan my day' },
							{ role: 'assistant', content: 'Here is your plan for today.' }
						]
					}
				})
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		parkChatSession({
			sessionId: 'session-4',
			title: 'Busy chat',
			contextType: 'global',
			hasActiveTurn: true,
			hasSentMessage: true
		});

		expect(getCards()[0].status).toBe('processing');

		// First probe (2s): still running. Second probe (3s later): finished.
		await vi.advanceTimersByTimeAsync(2_000);
		expect(getCards()[0].status).toBe('processing');
		await vi.advanceTimersByTimeAsync(3_000);

		const card = getCards()[0];
		expect(card.status).toBe('success');
		expect(card.data.hasActiveTurn).toBe(false);
		expect(card.data.responsePreview).toBe('Here is your plan for today.');
		expect(probeCalls).toBe(2);
	});

	it('stops probing once the card is resolved externally', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				success: true,
				data: { turnRuns: [{ id: 'turn-1', status: 'running' }] }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		parkChatSession({
			sessionId: 'session-5',
			title: 'Reopened elsewhere',
			contextType: 'global',
			hasActiveTurn: true,
			hasSentMessage: true
		});

		resolveParkedChatSession('session-5');
		expect(getCards()).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('marks a never-ending turn as stale after the probe window', async () => {
		// A Response body is single-use — mint a fresh one per probe call.
		const fetchMock = vi.fn().mockImplementation(() =>
			Promise.resolve(
				jsonResponse({
					success: true,
					data: { turnRuns: [{ id: 'turn-1', status: 'running' }] }
				})
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		parkChatSession({
			sessionId: 'session-6',
			title: 'Stuck chat',
			contextType: 'global',
			hasActiveTurn: true,
			hasSentMessage: true
		});

		// Well past the 6.5-minute probe window.
		await vi.advanceTimersByTimeAsync(8 * 60 * 1000);

		const card = getCards()[0];
		expect(card.status).toBe('warning');
		expect(card.data.hasActiveTurn).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
