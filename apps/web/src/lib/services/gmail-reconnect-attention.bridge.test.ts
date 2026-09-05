// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	loadAiInboxCount: vi.fn(),
	startGmailOAuth: vi.fn(),
	warning: vi.fn<typeof import('$lib/stores/toast.store').toastService.warning>(() => 'toast-1'),
	success: vi.fn(),
	error: vi.fn(),
	remove: vi.fn()
}));

vi.mock('$lib/stores/aiInboxCount.store', () => ({
	loadAiInboxCount: mocks.loadAiInboxCount
}));

vi.mock('$lib/stores/toast.store', () => ({
	TOAST_DURATION: { PERSISTENT: 0 },
	toastService: {
		warning: mocks.warning,
		success: mocks.success,
		error: mocks.error,
		remove: mocks.remove
	}
}));

vi.mock('$lib/services/gmail-oauth.client', () => ({
	startGmailOAuth: mocks.startGmailOAuth
}));

import {
	destroyGmailReconnectAttentionBridge,
	initGmailReconnectAttentionBridge
} from './gmail-reconnect-attention.bridge';

type RealtimePayload = {
	eventType: string;
	new: Record<string, unknown>;
	old: Record<string, unknown>;
};

function attentionRow(status = 'pending') {
	return {
		id: 'attention-1',
		source_type: 'integration_attention',
		source_ref_id: '11111111-1111-4111-8111-111111111111',
		status,
		title: 'Reconnect Work',
		created_at: '2026-08-03T16:00:00.000Z',
		source_payload: {
			account_label: 'Work',
			email_address: 'work@example.com'
		}
	};
}

function createRealtimeClient() {
	let onChange: ((payload: RealtimePayload) => void) | null = null;
	const channel: any = {
		on: vi.fn((_event, _filter, callback) => {
			onChange = callback;
			return channel;
		}),
		subscribe: vi.fn((callback) => {
			callback('SUBSCRIBED');
			return channel;
		})
	};
	const client = {
		channel: vi.fn(() => channel),
		removeChannel: vi.fn()
	};
	return {
		client,
		channel,
		emit(payload: RealtimePayload) {
			onChange?.(payload);
		}
	};
}

beforeEach(() => {
	sessionStorage.clear();
	vi.clearAllMocks();
	mocks.warning.mockReturnValue('toast-1');
	mocks.startGmailOAuth.mockResolvedValue({ accountLabel: 'Work' });
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ success: true, data: { items: [attentionRow()] } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		)
	);
});

afterEach(() => {
	destroyGmailReconnectAttentionBridge();
	vi.unstubAllGlobals();
});

describe('Gmail reconnect attention bridge', () => {
	it('hydrates one persistent alert, reconnects from its action, and clears on resolution', async () => {
		const realtime = createRealtimeClient();
		initGmailReconnectAttentionBridge(realtime.client as any, 'user-1');

		await vi.waitFor(() => expect(mocks.warning).toHaveBeenCalledOnce());
		expect(mocks.warning).toHaveBeenCalledWith(
			'Work needs to be reconnected',
			expect.objectContaining({
				duration: 0,
				action: expect.objectContaining({ label: 'Reconnect' })
			})
		);

		const warningOptions = mocks.warning.mock.calls[0]?.[1] as {
			action: { onClick: () => void };
		};
		warningOptions.action.onClick();
		await vi.waitFor(() => expect(mocks.startGmailOAuth).toHaveBeenCalledOnce());
		expect(mocks.startGmailOAuth).toHaveBeenCalledWith(
			expect.objectContaining({
				connectionId: '11111111-1111-4111-8111-111111111111'
			})
		);
		await vi.waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith('Work reconnected with read-only access')
		);

		realtime.emit({
			eventType: 'UPDATE',
			new: attentionRow('decided'),
			old: attentionRow('pending')
		});
		expect(mocks.remove).toHaveBeenCalledWith('toast-1');
		expect(mocks.loadAiInboxCount).toHaveBeenCalledWith({ force: true });
	});
});
