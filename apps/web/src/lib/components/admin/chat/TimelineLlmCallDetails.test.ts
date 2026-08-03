// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type {
	AuditTimelineEvent,
	SessionTurnRun,
	TimelineGroup
} from '$lib/services/admin/chat-session-audit-types';
import TimelineLlmCallDetails from './TimelineLlmCallDetails.svelte';

const event: AuditTimelineEvent = {
	id: 'llm:call-1',
	timestamp: '2026-08-03T16:52:37.000Z',
	type: 'llm_call',
	severity: 'info',
	title: 'LLM Call: deepseek/deepseek-v4-flash',
	summary: '22184 tokens',
	turn_index: 1,
	payload: {}
};

const turnRun = {
	id: 'run-1',
	turn_index: 1,
	request_message: 'Ask the planning agent to identify the next concrete milestone.',
	prompt_snapshot: {
		prompt_variant: 'agent_delegate_v1',
		model_messages: [
			{ role: 'system', content: 'Coordinate clearly with peer agents.' },
			{
				role: 'user',
				content: 'Ask the planning agent to identify the next concrete milestone.'
			}
		]
	}
} as SessionTurnRun;

const group = {
	id: 'turn:1',
	kind: 'turn',
	title: 'Turn 1',
	summary: '',
	timestamp: event.timestamp,
	severity: 'info',
	turnIndex: 1,
	run: turnRun,
	items: [event],
	counts: {
		total: 1,
		messages: 0,
		promptSnapshots: 0,
		llmCalls: 1,
		toolExecutions: 0,
		turnEvents: 0,
		operations: 0,
		evalRuns: 0,
		errors: 0
	}
} as TimelineGroup;

describe('TimelineLlmCallDetails', () => {
	afterEach(() => cleanup());

	it('shows the inter-agent turn request and exposes the complete captured prompt', async () => {
		render(TimelineLlmCallDetails, {
			props: {
				event,
				group,
				payload: {
					model_used: 'deepseek/deepseek-v4-flash',
					provider: 'deepinfra',
					prompt_tokens: 21_641,
					completion_tokens: 543,
					total_tokens: 22_184,
					total_cost_usd: 0.00204082,
					response_time_ms: 19_216
				}
			}
		});

		expect(screen.getByText('agent_delegate_v1')).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'LLM input messages' })).toHaveTextContent(
			'Ask the planning agent to identify the next concrete milestone.'
		);

		const fullInputSummary = screen.getByText(/View all captured prompt messages/);
		const fullInput = fullInputSummary.closest('details') as HTMLDetailsElement;
		expect(fullInput.open).toBe(false);
		expect(screen.queryByText('Coordinate clearly with peer agents.')).not.toBeInTheDocument();

		await fireEvent.click(fullInputSummary);
		expect(fullInput.open).toBe(true);
		await fireEvent(fullInput, new Event('toggle'));
		expect(screen.getByText('Coordinate clearly with peer agents.')).toBeInTheDocument();
		expect(screen.getByText('User / calling agent')).toBeInTheDocument();
	});

	it('explains when a historical call has no stored message content', () => {
		render(TimelineLlmCallDetails, {
			props: {
				event,
				group: { ...group, run: null, items: [event] },
				payload: { total_tokens: 22_184 }
			}
		});

		expect(
			screen.getByText(/Prompt content was not captured for this historical call/)
		).toBeInTheDocument();
	});
});
