// apps/web/src/lib/components/agent/agent-chat-modal-craft.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentChatHeader from './AgentChatHeader.svelte';
import AgentMessageList from './AgentMessageList.svelte';
import type { UIMessage } from './agent-chat.types';

function headerProps() {
	return {
		selectedContextType: 'global' as const,
		displayContextLabel: 'Global',
		displayContextSubtitle: 'All projects',
		isStreaming: false,
		showBackButton: true,
		onBack: vi.fn(),
		onClose: vi.fn(),
		onMinimize: vi.fn(),
		resolvedProjectFocus: null,
		onChangeFocus: vi.fn(),
		onClearFocus: vi.fn(),
		hasActiveThinkingBlock: false,
		currentActivity: ''
	};
}

beforeEach(() => {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({
			matches: false,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		}))
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('chat header interactions', () => {
	it('exposes named navigation controls and honors disabled Back', async () => {
		const props = headerProps();
		const view = render(AgentChatHeader, props);
		await fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
		expect(props.onBack).toHaveBeenCalledOnce();
		expect(props.onMinimize).toHaveBeenCalledOnce();
		expect(props.onClose).toHaveBeenCalledOnce();

		await view.rerender({ ...props, backDisabled: true });
		const back = screen.getByRole('button', { name: 'Go back' });
		expect(back).toBeDisabled();
		// Native activation honors disabled; dispatchEvent/fireEvent bypasses that gate.
		back.click();
		expect(props.onBack).toHaveBeenCalledOnce();
	});

	it('moves focus through enabled menu actions and contains Escape inside the menu', async () => {
		const props = headerProps();
		const complete = vi.fn();
		render(AgentChatHeader, {
			...props,
			headerActions: [
				{ id: 'complete', label: 'Complete review', onClick: complete },
				{ id: 'disabled', label: 'Unavailable action', disabled: true, onClick: vi.fn() },
				{ id: 'reject', label: 'Reject review', onClick: vi.fn() }
			]
		});
		const trigger = screen.getByRole('button', { name: 'More actions' });
		await fireEvent.click(trigger);
		const menu = screen.getByRole('menu');
		expect(screen.getByRole('menuitem', { name: 'Complete review' })).toHaveFocus();
		await fireEvent.keyDown(menu, { key: 'ArrowDown' });
		expect(screen.getByRole('menuitem', { name: 'Reject review' })).toHaveFocus();
		await fireEvent.keyDown(menu, { key: 'ArrowDown' });
		expect(screen.getByRole('menuitem', { name: 'Complete review' })).toHaveFocus();
		const outerKeydown = vi.fn();
		document.addEventListener('keydown', outerKeydown);
		await fireEvent.keyDown(menu, { key: 'Escape' });
		document.removeEventListener('keydown', outerKeydown);
		expect(outerKeydown).not.toHaveBeenCalled();
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
		expect(props.onClose).not.toHaveBeenCalled();

		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Complete review' }));
		expect(complete).toHaveBeenCalledOnce();
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});
});

describe('conversation scrolling', () => {
	it('preserves the reader position on new replies and jumps to real content only on request', async () => {
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 0;
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
		function measureFrame() {
			const pending = [...frames.values()];
			frames.clear();
			flushSync(() => pending.forEach((callback) => callback(performance.now())));
		}
		const messages: UIMessage[] = [
			{ id: 'u1', type: 'user', content: 'An earlier question', timestamp: new Date() },
			{ id: 'a1', type: 'assistant', content: 'An earlier answer', timestamp: new Date() }
		];
		const props = {
			messages,
			streamingMessageId: null,
			onToggleThinkingBlock: vi.fn(),
			onScroll: vi.fn(),
			displayContextLabel: 'Global'
		};
		const view = render(AgentMessageList, props);
		const scroller = view.container.querySelector<HTMLElement>('.agent-chat-scroll')!;
		const contentEnd = scroller.querySelector<HTMLElement>('.agent-chat-aux')!;
		Object.defineProperties(scroller, {
			clientHeight: { value: 400 },
			// Reply room extends below the real messages; the jump must not land there.
			scrollHeight: { value: 1800 }
		});
		let contentHeight = 1000;
		scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
		contentEnd.getBoundingClientRect = () =>
			({ top: contentHeight - scroller.scrollTop }) as DOMRect;
		const scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
			scroller.scrollTop = (typeof options === 'number' ? y : options?.top) ?? 0;
		});
		scroller.scrollTo = scrollTo;
		// Reading input cancels the initial session-restore positioning.
		await fireEvent.wheel(scroller);
		scroller.scrollTop = 100;
		measureFrame();

		contentHeight = 1200;
		await view.rerender({
			...props,
			messages: [
				...messages,
				{
					id: 'a2',
					type: 'assistant',
					content: 'A newly arrived reply',
					timestamp: new Date()
				}
			]
		});
		measureFrame();
		expect(scroller.scrollTop).toBe(100);
		expect(scrollTo).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Jump to latest message' }));
		expect(scrollTo).toHaveBeenLastCalledWith({ top: 800, behavior: 'smooth' });
		expect(scroller.scrollTop).toBe(800);
	});
});
