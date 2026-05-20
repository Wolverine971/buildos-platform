// apps/web/src/lib/components/ui/WelcomeModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WelcomeModal from './WelcomeModal.svelte';

function createStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: vi.fn(() => store.clear()),
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
		removeItem: vi.fn((key: string) => store.delete(key)),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, value);
		})
	};
}

describe('WelcomeModal', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createStorage());
		Object.defineProperty(window, 'scrollTo', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			writable: true,
			value: vi.fn(() => ({
				cancel: vi.fn(),
				commitStyles: vi.fn(),
				finished: Promise.resolve(),
				play: vi.fn()
			}))
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('shows an explicit close button and calls the dismiss handler', async () => {
		let view: ReturnType<typeof render>;
		const onDismiss = vi.fn(() => {
			void view.rerender({
				isOpen: false,
				title: 'Welcome to BuildOS!',
				onDismiss
			});
		});

		view = render(WelcomeModal, {
			props: {
				isOpen: true,
				title: 'Welcome to BuildOS!',
				onDismiss
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /close welcome dialog/i }));

		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('opens when the parent changes isOpen after mount', async () => {
		const view = render(WelcomeModal, {
			props: {
				isOpen: false,
				title: 'Welcome to BuildOS!'
			}
		});

		expect(screen.queryByText('Welcome to BuildOS!')).not.toBeInTheDocument();

		await view.rerender({
			isOpen: true,
			title: 'Welcome to BuildOS!'
		});

		expect(screen.getByText('Welcome to BuildOS!')).toBeInTheDocument();
	});
});
