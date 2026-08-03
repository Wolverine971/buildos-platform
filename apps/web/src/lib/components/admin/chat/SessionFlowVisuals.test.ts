// apps/web/src/lib/components/admin/chat/SessionFlowVisuals.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ChatSessionAuditPayload } from '$lib/services/admin/chat-session-audit-types';
import SessionFlowVisuals from './SessionFlowVisuals.svelte';

const { buildSessionFlowProfile, flowTarget } = vi.hoisted(() => {
	const target = {
		kind: 'tool' as const,
		domId: 'chat-flow-tool-turn%3A1-tool-call-1',
		fallbackDomId: 'chat-flow-turn-turn%3A1'
	};
	const event = {
		id: 'tool:turn:1:tool-call-1',
		turnId: 'turn:1',
		turnIndex: 1,
		category: 'tool' as const,
		label: 'search_email_messages',
		startMs: 1000,
		endMs: 2500,
		durationMs: 1500,
		isPoint: false,
		severity: 'success' as const,
		costUsd: null,
		costState: 'unmetered' as const,
		target
	};
	return {
		flowTarget: target,
		buildSessionFlowProfile: vi.fn(() => ({
			turns: [
				{
					id: 'turn:1',
					turnIndex: 1,
					label: 'Turn 1',
					startMs: 1000,
					endMs: 2500,
					durationMs: 1500,
					events: [event]
				}
			],
			events: [event],
			totalActiveDurationMs: 1500,
			totalCostUsd: 0,
			attributedCostUsd: 0,
			costDifferenceUsd: 0,
			slowestEvent: event
		}))
	};
});

vi.mock('$lib/services/admin/chat-session-flow-profile', () => ({ buildSessionFlowProfile }));

const detail: ChatSessionAuditPayload = {
	session: {
		id: 'session-1',
		title: 'Lazy chart test',
		user: { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
		context_type: 'global',
		context_id: null,
		status: 'completed',
		message_count: 0,
		total_tokens: 0,
		tool_call_count: 0,
		llm_call_count: 0,
		cost_estimate: 0,
		has_errors: false,
		created_at: '2026-08-03T12:00:00.000Z',
		updated_at: '2026-08-03T12:00:00.000Z',
		last_message_at: null,
		agent_metadata: {},
		extracted_entities: null
	},
	metrics: {
		total_tokens: 0,
		total_cost_usd: 0,
		tool_calls: 0,
		tool_failures: 0,
		llm_calls: 0,
		llm_failures: 0,
		messages: 0
	},
	messages: [],
	tool_executions: [],
	llm_calls: [],
	operations: [],
	timeline: [],
	timing_metrics: null,
	turn_runs: []
};

afterEach(() => {
	cleanup();
	buildSessionFlowProfile.mockClear();
});

describe('SessionFlowVisuals', () => {
	it('does not build or render either chart on mount', () => {
		render(SessionFlowVisuals, {
			props: {
				sessionDetail: detail,
				conversationTurns: [],
				onRevealTarget: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'See time chart' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'See cost chart' })).toBeInTheDocument();
		expect(screen.queryByText('Time waterfall')).not.toBeInTheDocument();
		expect(screen.queryByText('Cumulative cost waterfall')).not.toBeInTheDocument();
		expect(buildSessionFlowProfile).not.toHaveBeenCalled();
	});

	it('loads each chart independently and reuses the deferred profile', async () => {
		const onRevealTarget = vi.fn();
		render(SessionFlowVisuals, {
			props: {
				sessionDetail: detail,
				conversationTurns: [],
				onRevealTarget
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'See time chart' }));
		await waitFor(() => expect(screen.getByText('Time waterfall')).toBeInTheDocument());
		expect(screen.queryByText('Cumulative cost waterfall')).not.toBeInTheDocument();
		expect(buildSessionFlowProfile).toHaveBeenCalledTimes(1);
		await fireEvent.click(
			screen.getByRole('button', {
				name: 'search_email_messages, 1.50s. Select to open details.'
			})
		);
		expect(onRevealTarget).toHaveBeenCalledWith(flowTarget);

		await fireEvent.click(screen.getByRole('button', { name: 'See cost chart' }));
		await waitFor(() =>
			expect(screen.getByText('Cumulative cost waterfall')).toBeInTheDocument()
		);
		expect(screen.getByText('No metered spend')).toBeInTheDocument();
		expect(buildSessionFlowProfile).toHaveBeenCalledTimes(1);
	});
});
