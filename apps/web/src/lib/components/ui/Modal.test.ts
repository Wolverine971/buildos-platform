// apps/web/src/lib/components/ui/Modal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal.svelte';

// Children snippet: a textarea that marks itself as the preferred initial focus
// and (optionally) consumes Escape the way the chat composer does mid-stream.
// `mounts` counts how many times the child DOM is created.
function createChildren(options: { consumeEscape?: boolean } = {}) {
	const counters = { mounts: 0 };
	const children = createRawSnippet(() => ({
		render: () =>
			'<div><button type="button">First action</button><textarea aria-label="Composer" data-autofocus></textarea></div>',
		setup(node: Element) {
			counters.mounts += 1;
			if (!options.consumeEscape) return;
			const textarea = node.querySelector('textarea')!;
			const onKeydown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') event.preventDefault();
			};
			textarea.addEventListener('keydown', onKeydown);
			return () => textarea.removeEventListener('keydown', onKeydown);
		}
	}));
	return { children, counters };
}

function stubPointer(fine: boolean) {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: query === '(pointer: fine)' ? fine : false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	})) as typeof window.matchMedia;
}

describe('Modal', () => {
	const originalMatchMedia = window.matchMedia;

	beforeEach(() => {
		Object.defineProperty(window, 'scrollTo', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
		// Svelte drives transitions through WAAPI and waits on `onfinish`;
		// finish on the next macrotask so outros actually complete.
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			writable: true,
			value: vi.fn(() => {
				const animation = {
					cancel: vi.fn(),
					commitStyles: vi.fn(),
					finished: Promise.resolve(),
					play: vi.fn(),
					pause: vi.fn(),
					currentTime: 0,
					onfinish: null as null | (() => void)
				};
				setTimeout(() => animation.onfinish?.(), 0);
				return animation;
			})
		});
		// jsdom has no layout; treat every node as rendered unless it sits
		// under a hidden ancestor.
		Object.defineProperty(HTMLElement.prototype, 'checkVisibility', {
			configurable: true,
			writable: true,
			value(this: HTMLElement) {
				return !this.closest('[hidden]');
			}
		});
		stubPointer(false);
	});

	afterEach(() => {
		cleanup();
		window.matchMedia = originalMatchMedia;
		delete (HTMLElement.prototype as { checkVisibility?: unknown }).checkVisibility;
	});

	it('closes on Escape', async () => {
		const onClose = vi.fn();
		const { children } = createChildren();
		render(Modal, { props: { isOpen: true, title: 'Dialog', onClose, children } });

		await fireEvent.keyDown(screen.getByLabelText('Composer'), { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('ignores an Escape that an inner control already consumed', async () => {
		const onClose = vi.fn();
		const { children } = createChildren({ consumeEscape: true });
		render(Modal, { props: { isOpen: true, title: 'Dialog', onClose, children } });

		await fireEvent.keyDown(screen.getByLabelText('Composer'), { key: 'Escape' });

		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog')).toBeInTheDocument();
	});

	it('unmounts children on close by default', async () => {
		const { children, counters } = createChildren();
		const view = render(Modal, { props: { isOpen: true, title: 'Dialog', children } });
		expect(counters.mounts).toBe(1);

		await view.rerender({ isOpen: false });
		await waitFor(() => expect(screen.queryByLabelText('Composer')).toBeNull());

		await view.rerender({ isOpen: true });
		expect(counters.mounts).toBe(2);
	});

	it('keepMounted parks the dialog hidden + inert and reopens without remounting', async () => {
		const onClose = vi.fn();
		const { children, counters } = createChildren();
		const view = render(Modal, {
			props: { isOpen: true, title: 'Dialog', keepMounted: true, onClose, children }
		});
		const composer = screen.getByLabelText('Composer') as HTMLTextAreaElement;
		composer.value = 'draft survives';

		await view.rerender({ isOpen: false });
		await tick();

		const root = document.querySelector<HTMLElement>('.modal-root')!;
		expect(root).toHaveAttribute('hidden');
		// Svelte sets `inert` as a property (reflected to the attribute in browsers).
		expect(root.inert).toBe(true);
		expect(root).toHaveClass('modal-root--parked');
		expect(composer.isConnected).toBe(true);

		// Parked: Escape is not handled.
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();

		await view.rerender({ isOpen: true });
		await tick();

		expect(root).not.toHaveAttribute('hidden');
		expect(root.inert).toBe(false);
		expect(screen.getByLabelText('Composer')).toBe(composer);
		expect(composer.value).toBe('draft survives');
		expect(counters.mounts).toBe(1);
	});

	it('focuses the [data-autofocus] target on fine-pointer devices', async () => {
		stubPointer(true);
		const { children } = createChildren();
		render(Modal, { props: { isOpen: true, title: 'Dialog', children } });

		await waitFor(() => expect(screen.getByLabelText('Composer')).toHaveFocus());
	});

	it('keeps the first focusable on touch devices so the keyboard stays down', async () => {
		stubPointer(false);
		const { children } = createChildren();
		render(Modal, { props: { isOpen: true, title: 'Dialog', children } });

		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
		);
		expect(screen.getByLabelText('Composer')).not.toHaveFocus();
	});
});
