// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSharePreview } from '$lib/types/chat-share';

vi.mock('$lib/components/ui/Modal.svelte', async () => ({
	default: (await import('./__fixtures__/ChatShareModalHarness.svelte')).default
}));
vi.mock('$lib/services/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({ toastService: { success: vi.fn(), error: vi.fn() } }));

import { captureEvent } from '$lib/services/posthog';
import { toastService } from '$lib/stores/toast.store';
import ChatShareSheet from './ChatShareSheet.svelte';

const BASE: ChatSharePreview = {
	title: 'Plan the launch',
	authorName: 'DJ',
	truncated: null,
	existing: null,
	messages: [
		{ id: 'm1', role: 'user', markdown: 'A public question', at: '2026-10-18T12:00:00Z' },
		{ id: 'm2', role: 'assistant', markdown: 'A personal reply', at: '2026-10-18T12:01:00Z' },
		{
			id: 'm3',
			role: 'assistant',
			markdown: 'A credential was removed',
			at: '2026-10-18T12:02:00Z'
		}
	]
};
const REVIEW: ChatSharePreview = {
	...BASE,
	fingerprint: 'review-1',
	flags: [
		{ messageId: 'm2', locked: false, reasons: ['Personal information'] },
		{ messageId: 'm3', locked: true, reasons: ['Credential'] }
	]
};
const URL = 'https://build-os.com/share/opaque-token';
const success = (data: unknown) => Response.json({ success: true, data });

describe('chat sharing sheet', () => {
	const writeText = vi.fn();
	let fetchMock: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		writeText.mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
			if (_url.endsWith('/prepare')) return success(REVIEW);
			if (options?.method === 'DELETE')
				return success({ messagesShared: 2, messagesFlagged: 2 });
			if (options?.method === 'POST')
				return success({ url: URL, updated: false, messagesShared: 2, messagesFlagged: 2 });
			return success(BASE);
		});
		vi.stubGlobal('fetch', fetchMock);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('loads a free preview and never runs review or publishing on open', async () => {
		render(ChatShareSheet, { sessionId: 'session', onClose: vi.fn() });
		await screen.findByText('Plan the launch');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]![0]).toBe('/api/chat/sessions/session/share');
		expect(fetchMock.mock.calls[0]![1]?.method).toBeUndefined();
		expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
	});

	it('unchecks findings, locks credentials and publishes only the explicit selection', async () => {
		render(ChatShareSheet, { sessionId: 'session', onClose: vi.fn() });
		await screen.findByText('Plan the launch');
		await fireEvent.click(screen.getByRole('button', { name: 'Review for sharing' }));
		await screen.findByText('Preview reviewed');
		const personal = screen.getByRole('checkbox', { name: 'Include message 2 from BuildOS' });
		const locked = screen.getByRole('checkbox', { name: 'Include message 3 from BuildOS' });
		expect(personal).not.toBeChecked();
		expect(personal).toBeEnabled();
		expect(locked).not.toBeChecked();
		expect(locked).toBeDisabled();
		await fireEvent.click(personal);
		await fireEvent.click(screen.getByRole('switch', { name: 'Shared by DJ' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
		const publish = fetchMock.mock.calls.find(
			([_url, options]) => _url.endsWith('/share') && options?.method === 'POST'
		);
		expect(JSON.parse(publish![1]!.body as string)).toEqual({
			includedMessageIds: ['m1', 'm2'],
			showAuthor: false,
			fingerprint: 'review-1'
		});
		expect(toastService.success).toHaveBeenCalledWith(
			'Link copied. Anyone with it can read this chat.'
		);
		expect(captureEvent).toHaveBeenCalledWith('chat_share_created', {
			messages_shared: 2,
			messages_flagged: 2
		});
	});

	it('fails closed when the requested safety review cannot run', async () => {
		fetchMock.mockImplementation(async (url: string) =>
			url.endsWith('/prepare')
				? Response.json({ success: false }, { status: 503 })
				: success(BASE)
		);
		render(ChatShareSheet, { sessionId: 'session', onClose: vi.fn() });
		await screen.findByText('Plan the launch');
		await fireEvent.click(screen.getByRole('button', { name: 'Review for sharing' }));
		await screen.findByText("Safety check couldn't run. Try again.");
		expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
	});

	it('shows a refreshed 409 preview and waits for another publish click', async () => {
		fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
			if (url.endsWith('/prepare')) return success(REVIEW);
			if (options?.method === 'POST')
				return Response.json(
					{
						success: false,
						details: {
							preview: {
								...REVIEW,
								fingerprint: 'review-2',
								title: 'Updated launch plan'
							}
						}
					},
					{ status: 409 }
				);
			return success(BASE);
		});
		render(ChatShareSheet, { sessionId: 'session', onClose: vi.fn() });
		await screen.findByText('Plan the launch');
		await fireEvent.click(screen.getByRole('button', { name: 'Review for sharing' }));
		await screen.findByText('Preview reviewed');
		await fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
		await screen.findByText(
			'This conversation changed. Check the refreshed preview, then publish again.'
		);
		expect(screen.getByText('Updated launch plan')).toBeInTheDocument();
		expect(
			fetchMock.mock.calls.filter(
				([url, options]) => url.endsWith('/share') && options?.method === 'POST'
			)
		).toHaveLength(1);
		expect(writeText).not.toHaveBeenCalled();
		expect(captureEvent).not.toHaveBeenCalled();
	});

	it('revokes an existing share without requiring another review', async () => {
		fetchMock.mockImplementation(async (_url: string, options?: RequestInit) =>
			options?.method === 'DELETE'
				? success({ messagesShared: 2, messagesFlagged: 2 })
				: success({
						...BASE,
						existing: {
							url: URL,
							showAuthor: false,
							includedMessageIds: ['m1', 'm2'],
							updatedAt: '2026-10-18T13:00:00Z'
						}
					})
		);
		render(ChatShareSheet, { sessionId: 'session', onClose: vi.fn() });
		await screen.findByRole('button', { name: 'Stop sharing' });
		await fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
		await screen.findByText('Sharing stopped. The old link no longer opens this chat.');
		expect(captureEvent).toHaveBeenCalledWith('chat_share_revoked', {
			messages_shared: 2,
			messages_flagged: 2
		});
		expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/prepare'))).toBe(false);
		expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
	});

	it('requires another review after the signed review expires', async () => {
		fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
			if (url.endsWith('/prepare')) return success(REVIEW);
			if (options?.method === 'POST')
				return Response.json(
					{
						success: false,
						code: 'REVIEW_REQUIRED',
						error: 'Review this chat again before sharing.'
					},
					{ status: 409 }
				);
			return success(BASE);
		});
		render(ChatShareSheet, { sessionId: 'session', onClose: vi.fn() });
		await screen.findByText('Plan the launch');
		await fireEvent.click(screen.getByRole('button', { name: 'Review for sharing' }));
		await screen.findByText('Preview reviewed');
		await fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
		await screen.findByText('Review this chat again before sharing.');
		expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
	});

	it('shows the actionable structured review-blocked message', async () => {
		fetchMock.mockImplementation(async (url: string) =>
			url.endsWith('/prepare')
				? Response.json(
						{
							success: false,
							code: 'REVIEW_BLOCKED',
							error: 'Edit the chat title or display name before sharing.'
						},
						{ status: 422 }
					)
				: success(BASE)
		);
		render(ChatShareSheet, { sessionId: 'session', onClose: vi.fn() });
		await screen.findByText('Plan the launch');
		await fireEvent.click(screen.getByRole('button', { name: 'Review for sharing' }));
		await screen.findByText('Edit the chat title or display name before sharing.');
		expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
	});
});
