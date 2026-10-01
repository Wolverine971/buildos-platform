// apps/web/src/lib/components/agent/AgentMessageList.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import AgentMessageList from './AgentMessageList.svelte';
import type { UIMessage } from './agent-chat.types';

const at = new Date('2026-09-22T12:00:00Z');

// Long enough that the stream reveal paints it at once (resume path), so the
// assertions see the full text without driving animation frames.
const longReply = [
	`**Plan** — ${'steady progress on the launch copy. '.repeat(8)}`,
	'',
	`Second paragraph ${'with more detail about the rollout. '.repeat(8)}`
].join('\n');

function baseProps(messages: UIMessage[], streamingMessageId: string | null = null) {
	return {
		messages,
		streamingMessageId,
		onToggleThinkingBlock: vi.fn(),
		onScroll: vi.fn(),
		displayContextLabel: 'Global'
	};
}

describe('AgentMessageList', () => {
	afterEach(cleanup);

	it('plays the send entrance only for bubbles sent from this client', () => {
		render(
			AgentMessageList,
			baseProps([
				{ id: 'u-old', type: 'user', content: 'Restored question', timestamp: at },
				{
					id: 'u-new',
					renderKey: 'rk-new',
					type: 'user',
					content: 'Fresh question',
					timestamp: at,
					delivery: 'sending'
				}
			])
		);
		const [restored, fresh] = screen.getAllByTestId('agent-chat-user-message');
		expect(restored).not.toHaveClass('bubble-send');
		expect(fresh).toHaveClass('bubble-send');
	});

	it('keeps the same bubble DOM across an optimistic → persisted id swap', async () => {
		const optimistic: UIMessage = {
			id: 'tmp-1',
			renderKey: 'rk-1',
			type: 'user',
			content: 'Ship it?',
			timestamp: at,
			delivery: 'sending'
		};
		const { rerender } = render(AgentMessageList, baseProps([optimistic]));
		const before = screen.getByTestId('agent-chat-user-message');

		await rerender(baseProps([{ ...optimistic, id: 'db-1', delivery: 'sent' }]));

		expect(screen.getByTestId('agent-chat-user-message')).toBe(before);
	});

	it('does not rebuild a finished reply: streaming and final share block DOM', async () => {
		const reply: UIMessage = {
			id: 'a-1',
			type: 'assistant',
			content: longReply,
			timestamp: at
		};
		const { rerender } = render(AgentMessageList, baseProps([reply], 'a-1'));
		const bubble = screen.getByTestId('agent-chat-assistant-message');
		const firstParagraph = bubble.querySelector('.agent-markdown p');
		expect(firstParagraph?.textContent).toContain('Plan');
		expect(bubble.querySelector('.agent-markdown strong')).not.toBeNull();

		await rerender(baseProps([reply], null));

		expect(screen.getByTestId('agent-chat-assistant-message')).toBe(bubble);
		expect(bubble.querySelector('.agent-markdown p')).toBe(firstParagraph);
	});

	it('renders the live preview after durable text on the streaming bubble only', async () => {
		const reply: UIMessage = {
			id: 'a-live',
			type: 'assistant',
			content: longReply,
			timestamp: at,
			metadata: { turn_run_id: 'turn-live' }
		};
		const withPreview = {
			...baseProps([reply], 'a-live'),
			livePreview: { turnRunId: 'turn-live', text: '\n\nStill writing this part' }
		};
		const { rerender } = render(AgentMessageList, withPreview);
		const bubble = () => screen.getByTestId('agent-chat-assistant-message');
		expect(bubble().textContent).toContain('Still writing this part');
		expect(bubble().querySelector('.agent-live-preview')).not.toBeNull();
		// Display-only: the message itself never carries preview text.
		expect(reply.content).toBe(longReply);

		await rerender({ ...withPreview, livePreview: null });
		expect(bubble().textContent).not.toContain('Still writing this part');
		expect(bubble().querySelector('.agent-live-preview')).toBeNull();

		await rerender({ ...withPreview, streamingMessageId: null });
		expect(bubble().textContent).not.toContain('Still writing this part');
	});

	it('renders a shared-document confirm card under the reply that proposed it', () => {
		const card = {
			status: 'confirmation_required',
			confirmation_kind: 'shared_document_edit_v1',
			card_version: 2,
			client_action: {
				kind: 'confirm_shared_document_edit',
				action_id: '00000000-0000-4000-8000-000000000001',
				card_id: '00000000-0000-4000-8000-000000000001',
				session_id: '00000000-0000-4000-8000-000000000002',
				document_id: '00000000-0000-4000-8000-000000000003',
				document_title: 'Rate card',
				parent_project_id: '00000000-0000-4000-8000-000000000004',
				parent_name: 'Wayne Strategies',
				child_project_id: '00000000-0000-4000-8000-000000000005',
				shared_with_count: 5,
				change: null,
				field_changes: [{ field: 'title', from: 'Rate card', to: 'Rates 2027' }],
				expires_at: '2099-01-01T00:00:00.000Z'
			}
		};
		const { container } = render(
			AgentMessageList,
			baseProps([
				{ id: 'u1', type: 'user', content: 'Raise the strategy rate', timestamp: at },
				{
					id: 'b1',
					type: 'thinking_block',
					content: '',
					timestamp: at,
					status: 'completed',
					activities: [
						{
							id: 'a1',
							content: 'update_onto_document',
							timestamp: at,
							activityType: 'tool_call',
							status: 'completed',
							metadata: { toolName: 'update_onto_document', result: card }
						}
					]
				} as UIMessage,
				{
					id: 'r1',
					type: 'assistant',
					content: 'I’d update "Rate card" in Wayne Strategies.',
					timestamp: at
				}
			])
		);
		const reply = screen.getByTestId('agent-chat-assistant-message');
		const cards = screen.getByTestId('shared-document-edit-cards');
		// Directly after the reply, not above it.
		expect(reply.nextElementSibling).toBe(cards);
		expect(container.textContent).toContain('Title: Rate card → Rates 2027');
		expect(screen.getByRole('button', { name: 'Update shared doc' })).not.toBeDisabled();
	});

	it('exposes scrollToLatest for the modal', () => {
		const { component } = render(
			AgentMessageList,
			baseProps([{ id: 'a-2', type: 'assistant', content: 'Hello', timestamp: at }])
		);
		const list = component as unknown as {
			scrollToLatest: (o?: { smooth?: boolean }) => void;
		};
		expect(typeof list.scrollToLatest).toBe('function');
		expect(() => list.scrollToLatest({ smooth: true })).not.toThrow();
	});
});
