// apps/web/src/lib/components/admin/chat/TimelinePromptSnapshotDetails.test.ts
// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import TimelinePromptSnapshotDetails from './TimelinePromptSnapshotDetails.svelte';

afterEach(cleanup);

it('lazily shows the structured snapshot already attached to the turn when the retired text dump is absent', async () => {
	render(TimelinePromptSnapshotDetails, {
		props: {
			event: {
				id: 'prompt_snapshot:1',
				type: 'prompt_snapshot',
				timestamp: '2026-09-05T00:00:00Z',
				title: 'Prompt',
				summary: '',
				severity: 'info',
				payload: {}
			},
			payload: { id: 'snapshot-1', approx_prompt_tokens: 123 },
			snapshot: {
				model_messages: [
					{ role: 'system', content: 'Actual initial system' },
					{ role: 'user', content: 'Actual request' }
				],
				tool_definitions: [{ type: 'function', function: { name: 'create_onto_goal' } }]
			}
		}
	});
	expect(screen.getByText('Initial model messages')).toBeInTheDocument();
	expect(screen.queryByText(/Actual initial system/)).not.toBeInTheDocument();
	const messages = screen.getByText('Initial model messages').closest('details')!;
	await fireEvent.click(screen.getByText('Initial model messages'));
	await fireEvent(messages, new Event('toggle'));
	expect(screen.getByText(/Actual initial system/)).toBeInTheDocument();
	const tools = screen.getByText('Tool definitions').closest('details')!;
	await fireEvent.click(screen.getByText('Tool definitions'));
	await fireEvent(tools, new Event('toggle'));
	expect(screen.getByText(/create_onto_goal/)).toBeInTheDocument();
});
