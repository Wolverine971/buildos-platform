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
