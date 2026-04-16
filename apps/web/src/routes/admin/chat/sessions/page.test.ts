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
	has_libri_extraction: true,
	libri_candidate_count: 1,
	libri_handoff_status: 'sent',
	libri_handoff_result_count: 1,
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
			context_id: null,
			has_errors: false,
			created_at: '2026-04-12T12:00:00.000Z',
			updated_at: '2026-04-12T12:05:00.000Z',
			last_message_at: '2026-04-12T12:05:00.000Z',
			agent_metadata: {
				libri_handoff: {
					status: 'sent',
					results: [
						{
							entity_type: 'person',
							canonical_query: 'James Clear',
							status: 'found',
							resource_key: 'person:james-clear'
						}
					]
				}
			},
			extracted_entities: {
				libri_candidates: [
					{
						entity_type: 'person',
						display_name: 'James Clear',
						canonical_query: 'James Clear',
						confidence: 0.97,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						source_turn_indices: [1],
						evidence_snippets: ['James Clear']
					}
				],
				extraction_version: 'libri_session_synthesis_v1',
				extracted_at: '2026-04-12T12:04:00.000Z'
			}
		},
		metrics: {
			messages: 2,
			tool_calls: 1,
			llm_calls: 1,
			total_tokens: 0,
			total_cost_usd: 0,
			tool_failures: 0,
			llm_failures: 0
		},
		messages: [
			{
				id: 'message-user-1',
				role: 'user',
				content: 'What should I do next?',
				created_at: '2026-04-12T12:01:00.000Z',
				total_tokens: 8
			},
			{
				id: 'message-assistant-1',
				role: 'assistant',
				content: 'Draft the outline, then schedule the first writing block.',
				created_at: '2026-04-12T12:02:00.000Z',
				total_tokens: 18
			}
		],
		tool_executions: [],
		llm_calls: [],
		operations: [],
		timing_metrics: null,
		turn_runs: [
			{
				id: 'turn-run-1',
				turn_index: 1,
				stream_run_id: 'stream-1',
				client_turn_id: 'client-turn-1',
				status: 'completed',
				finished_reason: 'stop',
				context_type: 'global',
				entity_id: null,
				project_id: null,
				gateway_enabled: true,
				request_message: 'What should I do next?',
				user_message_id: 'message-user-1',
				assistant_message_id: 'message-assistant-1',
				tool_round_count: 1,
				tool_call_count: 1,
				validation_failure_count: 0,
				llm_pass_count: 1,
				first_lane: 'execute',
				first_help_path: 'project.search',
				first_skill_path: null,
				first_canonical_op: 'project.search',
				history_strategy: 'recent',
				history_compressed: false,
				raw_history_count: 2,
				history_for_model_count: 2,
				cache_source: null,
				cache_age_seconds: 0,
				request_prewarmed_context: false,
				started_at: '2026-04-12T12:01:00.000Z',
				finished_at: '2026-04-12T12:02:00.000Z',
				prompt_snapshot: null,
				events: [],
				eval_runs: []
			}
		],
		timeline: [
			{
				id: 'message:message-user-1',
				timestamp: '2026-04-12T12:01:00.000Z',
				type: 'message',
				severity: 'info',
				title: 'User Message',
				summary: 'What should I do next?',
				turn_index: 1,
				payload: {
					id: 'message-user-1',
					role: 'user',
					content: 'What should I do next?'
				}
			},
			{
				id: 'turn_event:tool-call-1',
				timestamp: '2026-04-12T12:01:20.000Z',
				type: 'turn_event',
				severity: 'info',
				title: 'Turn Event: tool_call_emitted',
				summary: 'op=project.search',
				turn_index: 1,
				payload: {
					id: 'tool-call-1',
					turn_run_id: 'turn-run-1',
					stream_run_id: 'stream-1',
					sequence_index: 1,
					phase: 'tool_call',
					event_type: 'tool_call_emitted',
					tool_call_id: 'call-1',
					tool_name: 'buildos_gateway',
					canonical_op: 'project.search',
					arguments: {
						query: 'outline'
					}
				}
			},
			{
				id: 'turn_event:tool-result-1',
				timestamp: '2026-04-12T12:01:21.000Z',
				type: 'turn_event',
				severity: 'info',
				title: 'Turn Event: tool_result_received',
				summary: 'op=project.search',
				turn_index: 1,
				payload: {
					id: 'tool-result-1',
					turn_run_id: 'turn-run-1',
					stream_run_id: 'stream-1',
					sequence_index: 2,
					phase: 'tool_result',
					event_type: 'tool_result_received',
					tool_call_id: 'call-1',
					tool_name: 'buildos_gateway',
					canonical_op: 'project.search',
					success: true,
					duration_ms: 321,
					result: {
						matches: 2
					},
					tool_result_source: 'chat_tool_executions',
					linked_tool_execution: {
						id: 'tool-execution-1',
						turn_run_id: 'turn-run-1',
						stream_run_id: 'stream-1',
						gateway_op: 'project.search',
						sequence_index: 1,
						success: true,
						execution_time_ms: 321,
						arguments: {
							query: 'outline'
						},
						result: {
							matches: 2
						}
					}
				}
			},
			{
				id: 'message:message-assistant-1',
				timestamp: '2026-04-12T12:02:00.000Z',
				type: 'message',
				severity: 'info',
				title: 'Assistant Message',
				summary: 'Draft the outline, then schedule the first writing block.',
				turn_index: 1,
				payload: {
					id: 'message-assistant-1',
					role: 'assistant',
					content: 'Draft the outline, then schedule the first writing block.'
				}
			}
		]
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
		expect(screen.getByText(/Libri 1/)).toBeInTheDocument();
	});

	it('renders a chat-style replay with expandable tool call details', async () => {
		render(ChatSessionsPage);

		await openSessionFromList();

		expect(await screen.findByText('Chat Replay')).toBeInTheDocument();
		expect(screen.getAllByText('What should I do next?').length).toBeGreaterThan(0);
		expect(
			screen.getAllByText('Draft the outline, then schedule the first writing block.').length
		).toBeGreaterThan(0);
		expect(screen.getByText('BuildOS activity')).toBeInTheDocument();
		expect(screen.getAllByText('buildos_gateway').length).toBeGreaterThan(0);
		expect(screen.getAllByText('project.search').length).toBeGreaterThan(0);
		expect(screen.getByText('Arguments')).toBeInTheDocument();
		expect(screen.getByText('Result')).toBeInTheDocument();
		expect(screen.getByText('Libri Entity Handoff')).toBeInTheDocument();
		expect(screen.getAllByText('James Clear').length).toBeGreaterThan(0);
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
