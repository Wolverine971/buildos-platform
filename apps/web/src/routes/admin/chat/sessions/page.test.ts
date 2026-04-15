// apps/web/src/routes/admin/chat/sessions/page.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const {
	pageStore,
	setPageUrl,
	replaceStateMock,
	fetchChatSessionAuditPayloadMock,
	downloadChatSessionAuditMarkdownMock
} = vi.hoisted(() => {
	type PageValue = {
		url: URL;
		state: Record<string, unknown>;
	};

	let currentPage: PageValue = {
		url: new URL('http://localhost/admin/chat/sessions'),
		state: {}
	};
	const subscribers = new Set<(value: PageValue) => void>();

	function notifyPageSubscribers() {
		for (const subscriber of subscribers) {
			subscriber(currentPage);
		}
	}

	return {
		pageStore: {
			subscribe(callback: (value: PageValue) => void) {
				callback(currentPage);
				subscribers.add(callback);
				return () => subscribers.delete(callback);
			}
		},
		setPageUrl(url: string) {
			currentPage = {
				...currentPage,
				url: new URL(url)
			};
			window.history.replaceState(
				{},
				'',
				`${currentPage.url.pathname}${currentPage.url.search}${currentPage.url.hash}`
			);
			notifyPageSubscribers();
		},
		replaceStateMock: vi.fn((url: string | URL, state: Record<string, unknown>) => {
			currentPage = {
				...currentPage,
				state
			};
			const nextUrl = new URL(url, window.location.href);
			window.history.replaceState(
				{},
				'',
				`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
			);

			// This mirrors SvelteKit shallow routing: the visible URL changes, but
			// the legacy $page.url store can still publish the previous URL value.
			notifyPageSubscribers();
		}),
		fetchChatSessionAuditPayloadMock: vi.fn(),
		downloadChatSessionAuditMarkdownMock: vi.fn()
	};
});

vi.mock('$app/stores', () => ({
	page: pageStore
}));

vi.mock('$app/navigation', () => ({
	replaceState: replaceStateMock
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		success: vi.fn(),
		error: vi.fn()
	}
}));

vi.mock('$lib/services/admin/chat-session-audit-export', () => ({
	fetchChatSessionAuditPayload: fetchChatSessionAuditPayloadMock,
	downloadChatSessionAuditMarkdown: downloadChatSessionAuditMarkdownMock
}));

import ChatSessionsPage from './+page.svelte';

const SESSION_ID = 'session-1';

const sessionListItem = {
	id: SESSION_ID,
	title: 'Clicked test session',
	user: { id: 'user-1', email: 'admin@example.com', name: 'Admin User' },
	status: 'active',
	context_type: 'global',
	entity_id: null,
	message_count: 1,
	total_tokens: 0,
	tool_call_count: 0,
	llm_call_count: 0,
	tool_failure_count: 0,
	cost_estimate: 0.0142,
	has_errors: false,
	has_agent_state: false,
	has_context_shift: false,
	last_tool_at: null,
	created_at: '2026-04-12T12:00:00.000Z',
	updated_at: '2026-04-12T12:05:00.000Z',
	last_message_at: '2026-04-12T12:05:00.000Z'
};

function sessionDetailPayload() {
	return {
		session: {
			id: SESSION_ID,
			title: 'Clicked test session',
			user: { id: 'user-1', email: 'admin@example.com', name: 'Admin User' },
			status: 'active',
			context_type: 'global',
			entity_id: null,
			has_errors: false,
			created_at: '2026-04-12T12:00:00.000Z',
			updated_at: '2026-04-12T12:05:00.000Z'
		},
		metrics: {
			messages: 1,
			tool_calls: 0,
			llm_calls: 0,
			total_tokens: 0,
			total_cost_usd: 0,
			tool_failures: 0,
			llm_failures: 0
		},
		turn_runs: [],
		timeline: []
	};
}

function okJson(payload: Record<string, unknown>) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

function mockFetch(sessions = [sessionListItem]) {
	global.fetch = vi.fn((input: RequestInfo | URL) => {
		const url = String(input);
		if (url.startsWith('/api/admin/chat/sessions?')) {
			return okJson({
				success: true,
				data: {
					sessions,
					total: sessions.length
				}
			});
		}
		if (url === '/api/admin/chat/evals/scenarios') {
			return okJson({
				success: true,
				data: {
					scenarios: []
				}
			});
		}
		throw new Error(`Unhandled fetch: ${url}`);
	}) as typeof fetch;
}

async function openSessionFromList() {
	const card = await screen.findByRole('button', { name: /clicked test session/i });
	await fireEvent.click(card);
	return screen.findByRole('dialog', { name: /chat session detail/i });
}

describe('/admin/chat/sessions modal URL state', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		setPageUrl('http://localhost/admin/chat/sessions');
		mockFetch();
		fetchChatSessionAuditPayloadMock.mockResolvedValue(sessionDetailPayload());
		window.scrollTo = vi.fn();
		Element.prototype.animate = vi.fn(() => {
			let finishHandler: ((event: AnimationPlaybackEvent) => void) | null = null;
			const animation = {
				cancel: vi.fn(),
				currentTime: 0,
				effect: null,
				finished: Promise.resolve(),
				playState: 'finished',
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				get onfinish() {
					return finishHandler;
				},
				set onfinish(handler: ((event: AnimationPlaybackEvent) => void) | null) {
					finishHandler = handler;
					if (handler) {
						setTimeout(() => handler({} as AnimationPlaybackEvent), 0);
					}
				}
			};
			return animation as unknown as Animation;
		});
		window.matchMedia = vi.fn().mockImplementation(() => ({
			matches: false,
			media: '(pointer: coarse)',
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		}));
	});

	it('keeps the modal open after a session card click when shallow routing publishes a stale page URL', async () => {
		render(ChatSessionsPage);

		const dialog = await openSessionFromList();

		expect(dialog).toBeInTheDocument();
		expect(window.location.search).toBe(`?chat_session_id=${SESSION_ID}`);
		expect(fetchChatSessionAuditPayloadMock).toHaveBeenCalledWith(SESSION_ID);
	});

	it('renders the session cost on each session card', async () => {
		render(ChatSessionsPage);

		expect(await screen.findByText('Cost $0.0142')).toBeInTheDocument();
	});

	it('closes a deep-linked session modal and removes the URL parameter', async () => {
		setPageUrl(`http://localhost/admin/chat/sessions?chat_session_id=${SESSION_ID}`);
		render(ChatSessionsPage);

		const dialog = await screen.findByRole('dialog', { name: /chat session detail/i });
		expect(dialog).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

		await waitFor(() => {
			expect(window.location.search).toBe('');
		});
		await waitFor(() => {
			expect(
				screen.queryByRole('dialog', { name: /chat session detail/i })
			).not.toBeInTheDocument();
		});
		expect(window.location.search).toBe('');
	});
});
