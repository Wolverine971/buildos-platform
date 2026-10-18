// apps/web/src/lib/components/agent/agent-chat-pending-change.svelte.test.ts
import { describe, expect, it, vi } from 'vitest';
import { PendingChangeController, turnHadFailedStep } from './agent-chat-pending-change.svelte';
import type { PendingChangeViewV1 } from '$lib/services/agentic-chat-v2/pending-change';
import type { ActivityEntry } from './agent-chat.types';

const VIEW: PendingChangeViewV1 = {
	key: 'turn-1@2026-09-30T02:03:22.856Z',
	createdAt: '2026-09-30T02:03:22.856Z',
	items: ['Update plan "Launch"', 'Archive 6 docs']
};
const NEWER: PendingChangeViewV1 = {
	key: 'turn-2@2026-10-18T12:00:00.000Z',
	createdAt: '2026-10-18T12:00:00.000Z',
	items: ['Complete 2 tasks']
};

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('PendingChangeController', () => {
	it('re-reads after a turn only when the strip shows or a step failed', async () => {
		const fetchMock = vi.fn(async () =>
			json(200, { success: true, data: { pendingChange: NEWER } })
		);
		const controller = new PendingChangeController({ fetch: fetchMock as typeof fetch });
		controller.hydrate('session-1', null);

		await controller.refreshAfterTurn('session-1', { hadFailedStep: false });
		expect(fetchMock).not.toHaveBeenCalled();

		await controller.refreshAfterTurn('session-1', { hadFailedStep: true });
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/chat/sessions/session-1?probe=pending-change',
			{ cache: 'no-store' }
		);
		expect(controller.current).toEqual(NEWER);

		fetchMock.mockImplementationOnce(async () =>
			json(200, { success: true, data: { pendingChange: null } })
		);
		await controller.refreshAfterTurn('session-1', { hadFailedStep: false });
		expect(controller.current).toBeNull();
	});

	it('never applies a re-read for another chat', async () => {
		const fetchMock = vi.fn();
		const controller = new PendingChangeController({ fetch: fetchMock as typeof fetch });
		controller.hydrate('session-1', VIEW);
		await controller.refreshAfterTurn('session-2', { hadFailedStep: true });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(controller.current).toEqual(VIEW);
	});

	it('hides the strip at once on Dismiss and confirms', async () => {
		let resolve!: (response: Response) => void;
		const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
		const onDismissed = vi.fn();
		const controller = new PendingChangeController({
			fetch: fetchMock as typeof fetch,
			onDismissed
		});
		controller.hydrate('session-1', VIEW);

		const pending = controller.dismiss();
		expect(controller.current).toBeNull();
		expect(controller.busy).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			`/api/chat/sessions/session-1/pending-change?key=${encodeURIComponent(VIEW.key)}`,
			{ method: 'DELETE' }
		);
		resolve(json(200, { success: true, data: { dismissed: true, pendingChange: null } }));
		await pending;
		expect(controller.current).toBeNull();
		expect(controller.busy).toBe(false);
		expect(onDismissed).toHaveBeenCalledOnce();
	});

	it('shows the newer change when the server refuses a stale Dismiss', async () => {
		const onError = vi.fn();
		const controller = new PendingChangeController({
			fetch: (async () =>
				json(409, {
					success: false,
					error: 'These changes were updated since you last saw them.',
					details: { pendingChange: NEWER }
				})) as typeof fetch,
			onError
		});
		controller.hydrate('session-1', VIEW);
		await controller.dismiss();
		expect(controller.current).toEqual(NEWER);
		expect(onError).toHaveBeenCalledWith('These changes were updated since you last saw them.');
	});

	it('restores the strip when Dismiss fails', async () => {
		const onError = vi.fn();
		const controller = new PendingChangeController({
			fetch: (async () => {
				throw new Error('offline');
			}) as typeof fetch,
			onError
		});
		controller.hydrate('session-1', VIEW);
		await controller.dismiss();
		expect(controller.current).toEqual(VIEW);
		expect(controller.busy).toBe(false);
		expect(onError).toHaveBeenCalledWith('Could not dismiss these changes.');
	});

	it('drops an in-flight answer once the chat is reset', async () => {
		let resolve!: (response: Response) => void;
		const controller = new PendingChangeController({
			fetch: (() => new Promise<Response>((r) => (resolve = r))) as typeof fetch
		});
		controller.hydrate('session-1', VIEW);
		const pending = controller.refresh('session-1');
		controller.reset();
		resolve(json(200, { success: true, data: { pendingChange: NEWER } }));
		await pending;
		expect(controller.current).toBeNull();
	});
});

describe('turnHadFailedStep', () => {
	it('reads the steps’ structured status', () => {
		const step = (status: ActivityEntry['status']): ActivityEntry => ({
			id: 's',
			content: 'Update doc',
			timestamp: new Date(),
			activityType: 'tool_call',
			status
		});
		expect(turnHadFailedStep([step('completed'), step('failed')])).toBe(true);
		expect(turnHadFailedStep([step('completed')])).toBe(false);
		expect(turnHadFailedStep(undefined)).toBe(false);
	});
});
