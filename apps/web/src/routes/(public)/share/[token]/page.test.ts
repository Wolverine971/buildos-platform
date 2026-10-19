// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedChatSnapshotV1 } from '$lib/types/chat-share';

vi.mock('$lib/services/posthog', () => ({ captureEvent: vi.fn() }));
import { captureEvent } from '$lib/services/posthog';
import SharedChatPage from './+page.svelte';

const snapshot: SharedChatSnapshotV1 = {
	version: 1,
	title: 'A launch plan',
	messages: [
		{ role: 'assistant', markdown: 'Start with a clear plan.', at: '2026-10-18T12:00:00Z' }
	]
};
const data = {
	share: {
		id: 'opaque-token',
		title: snapshot.title,
		snapshot,
		showAuthor: true,
		authorName: 'DJ',
		updatedAt: '2026-10-18T13:00:00Z',
		createdAt: '2026-10-18T12:00:00Z'
	},
	viewerSignedIn: false
};

describe('public shared chat page', () => {
	beforeEach(() =>
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ success: true }))
		)
	);
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('stays noindex, uses the default card, and shows the frozen byline', async () => {
		render(SharedChatPage, { data });
		expect(screen.getByRole('heading', { name: 'A launch plan' })).toBeInTheDocument();
		expect(screen.getByText(/Shared by DJ/)).toBeInTheDocument();
		expect(screen.getByText('Oct 18, 2026')).toBeInTheDocument();
		await waitFor(() =>
			expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
				'content',
				'noindex, nofollow'
			)
		);
		expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute(
			'content',
			snapshot.title
		);
		expect(document.head.querySelector('meta[property="og:description"]')).toHaveAttribute(
			'content',
			'A BuildOS chat shared by DJ'
		);
		expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute(
			'content',
			'https://build-os.com/twitter_card_light.png'
		);
	});

	it('hides the author in the page and metadata when the owner chooses anonymity', async () => {
		render(SharedChatPage, { data: { ...data, share: { ...data.share, showAuthor: false } } });
		expect(screen.queryByText(/Shared by DJ/)).not.toBeInTheDocument();
		await waitFor(() =>
			expect(document.head.querySelector('meta[property="og:description"]')).toHaveAttribute(
				'content',
				'A BuildOS chat'
			)
		);
		expect(document.head.querySelector('meta[name="author"]')).toHaveAttribute(
			'content',
			'BuildOS'
		);
	});

	it('records one view per page and routes the CTA through the sharing attribution', async () => {
		const component = render(SharedChatPage, { data });
		await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
		expect(fetch).toHaveBeenCalledWith(
			'/api/share/opaque-token/view',
			expect.objectContaining({ method: 'POST' })
		);
		expect(captureEvent).toHaveBeenCalledWith('shared_chat_viewed', {
			share_id: 'opaque-token',
			viewer_signed_in: false
		});
		await component.rerender({ data: { ...data } });
		expect(fetch).toHaveBeenCalledOnce();
		const cta = screen.getByRole('link', { name: 'Try BuildOS' });
		expect(cta).toHaveAttribute(
			'href',
			'/signup?utm_source=shared-chat&utm_medium=share&utm_campaign=chat-share'
		);
		cta.addEventListener('click', (event) => event.preventDefault());
		await fireEvent.click(cta);
		expect(captureEvent).toHaveBeenCalledWith('shared_chat_cta_clicked', {
			share_id: 'opaque-token'
		});
	});
});
