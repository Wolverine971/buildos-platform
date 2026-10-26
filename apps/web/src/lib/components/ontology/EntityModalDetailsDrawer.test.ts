// apps/web/src/lib/components/ontology/EntityModalDetailsDrawer.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EntityModalDetailsDrawer from './EntityModalDetailsDrawer.svelte';

const children = createRawSnippet(() => ({
	render: () => '<button type="button">Edit due date</button>'
}));
const props = { panelLabel: 'Task details', children };
function setDesktop(desktop: boolean) {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({
			matches: desktop,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		}))
	);
}

beforeEach(() => {
	localStorage.clear();
	setDesktop(true);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('EntityModalDetailsDrawer', () => {
	it('starts closed on desktop, exposes its controlled panel, and toggles accessibility', async () => {
		render(EntityModalDetailsDrawer, props);
		const toggle = screen.getByRole('button', { name: 'Open Task details' });
		const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(panel).toHaveAttribute('aria-label', 'Task details');
		expect(panel).toHaveAttribute('aria-hidden', 'true');
		expect(panel.inert).toBe(true);
		expect(screen.queryByRole('button', { name: 'Edit due date' })).not.toBeInTheDocument();
		await fireEvent.click(toggle);
		expect(screen.getByRole('button', { name: 'Close Task details' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(panel).toHaveAttribute('aria-hidden', 'false');
		expect(panel.inert).toBe(false);
		expect(screen.getByRole('button', { name: 'Edit due date' })).toBeInTheDocument();
		await fireEvent.click(toggle);
		expect(panel.inert).toBe(true);
		expect(screen.queryByRole('button', { name: 'Edit due date' })).not.toBeInTheDocument();
	});

	it('opens a fresh desktop drawer closed after the previous modal unmounts', async () => {
		const first = render(EntityModalDetailsDrawer, props);
		await fireEvent.click(screen.getByRole('button', { name: 'Open Task details' }));
		first.unmount();
		render(EntityModalDetailsDrawer, props);
		expect(screen.getByRole('button', { name: 'Open Task details' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});

	it('keeps details accessible on mobile when collapsing is not requested', () => {
		setDesktop(false);
		render(EntityModalDetailsDrawer, props);
		expect(screen.getByRole('complementary', { name: 'Task details' })).toHaveAttribute(
			'aria-hidden',
			'false'
		);
		expect(screen.getByRole('button', { name: 'Edit due date' })).toBeInTheDocument();
	});

	it('remembers the mobile disclosure choice across modal opens', async () => {
		setDesktop(false);
		const view = render(EntityModalDetailsDrawer, { ...props, mobileCollapsible: true });
		const toggle = screen.getByRole('button', { name: 'Details' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByRole('button', { name: 'Edit due date' })).not.toBeInTheDocument();
		await fireEvent.click(toggle);
		expect(screen.getByRole('button', { name: 'Edit due date' })).toBeInTheDocument();
		view.unmount();
		render(EntityModalDetailsDrawer, { ...props, mobileCollapsible: true });
		expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
		expect(screen.queryByRole('button', { name: 'Edit due date' })).not.toBeInTheDocument();
	});

	it('still opens when browser storage is unavailable', async () => {
		setDesktop(false);
		const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('unavailable');
		});
		const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('unavailable');
		});
		try {
			render(EntityModalDetailsDrawer, { ...props, mobileCollapsible: true });
			await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
			expect(screen.getByRole('button', { name: 'Edit due date' })).toBeInTheDocument();
		} finally {
			get.mockRestore();
			set.mockRestore();
		}
	});
});
