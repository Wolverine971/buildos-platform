// apps/web/src/lib/components/organize/OrganizeView.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizeView from './OrganizeView.svelte';
import { organizeFixtures } from './organize-fixtures';

const navigation = vi.hoisted(() => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
vi.mock('$lib/components/chat/project-selector-browser', () => ({
	fetchProjectSelectionSummaries: vi.fn(async () => [])
}));

describe('Organize preview interactions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', vi.fn());
		vi.stubGlobal('scrollTo', vi.fn());
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});
	function setup() {
		const [project, secondaryProject] = organizeFixtures();
		return render(OrganizeView, { project: project!, secondaryProject });
	}

	it('keyboard pickup, switch pane, enter folder, stage and undo never writes to the server', async () => {
		setup();
		const brief = screen.getByRole('button', { name: 'Brief' });
		await fireEvent.keyDown(brief, { key: ' ' });
		await fireEvent.keyDown(window, { key: 'ArrowRight' });
		await fireEvent.keyDown(window, { key: 'ArrowDown' });
		await fireEvent.keyDown(window, { key: 'Enter' });
		expect(screen.getByText('1 pending move')).toBeInTheDocument();
		expect(
			within(screen.getByRole('region', { name: 'Business' })).getByRole('button', {
				name: 'Brief, planned move'
			})
		).toBeInTheDocument();
		expect(
			within(screen.getByRole('region', { name: 'Business' })).getByRole('button', {
				name: 'Research, planned move'
			})
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled();
		expect(screen.getByText(/1 child doc moves too/)).toHaveTextContent(
			'Shared with 3 sub-projects'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Undo last' }));
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
		expect(
			within(screen.getByRole('region', { name: 'Client project' })).getByRole('button', {
				name: 'Brief'
			})
		).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('opens Move to from M, stages a task, then discards the plan', async () => {
		setup();
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Send proposal' }), {
			key: 'm'
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
		expect(screen.getByText('1 pending move')).toBeInTheDocument();
		expect(screen.getByText(/Calendar changes need review/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Discard all' }));
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('uses the Move to button for the same sheet on phones', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: 'Move Brief to…' }));
		await fireEvent.change(screen.getByLabelText('Place inside'), {
			target: { value: 'shared' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
		expect(screen.getByText('1 pending move')).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('blocks picking up pinned docs and cancels a carry with Escape', async () => {
		setup();
		await fireEvent.keyDown(screen.getByRole('button', { name: 'START HERE' }), {
			key: ' '
		});
		expect(screen.getByRole('status')).toHaveTextContent('START HERE stays in this project.');
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief' }), {
			key: ' '
		});
		await fireEvent.keyDown(window, { key: 'Escape' });
		await fireEvent.keyDown(window, { key: 'Enter' });
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
	});

	it('protects a staged plan from accidental navigation', async () => {
		setup();
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief' }), {
			key: ' '
		});
		await fireEvent.keyDown(window, { key: 'ArrowRight' });
		await fireEvent.keyDown(window, { key: 'Enter' });
		const cancel = vi.fn();
		navigation.beforeNavigate.mock.calls[0]![0]({
			cancel,
			willUnload: false,
			to: { url: new URL('https://example.test/projects') }
		});
		expect(cancel).toHaveBeenCalledOnce();
		expect(navigation.goto).not.toHaveBeenCalled();
	});

	it('leaves typing and other buttons alone while an item is picked up', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: 'Choose another project…' }));
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief' }), { key: ' ' });
		// A space typed into the project search is text, not a drop.
		await fireEvent.keyDown(screen.getByLabelText('Find a project'), { key: ' ' });
		// Enter on another button presses that button.
		await fireEvent.keyDown(screen.getByRole('button', { name: 'History' }), {
			key: 'Enter'
		});
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
		// The picked-up row itself still carries and drops.
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief' }), {
			key: 'ArrowRight'
		});
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief' }), { key: 'Enter' });
		expect(screen.getByText('1 pending move')).toBeInTheDocument();
	});

	it('cancels a pickup when the project picker opens', async () => {
		setup();
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief' }), { key: ' ' });
		await fireEvent.click(screen.getByRole('button', { name: 'Choose another project…' }));
		expect(screen.getByText('Move cancelled.')).toBeInTheDocument();
		await fireEvent.keyDown(window, { key: 'Enter' });
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
	});

	it('keeps focus on a keyboard-staged row after it moves panes', async () => {
		setup();
		const brief = screen.getByRole('button', { name: 'Brief' });
		brief.focus();
		await fireEvent.keyDown(brief, { key: ' ' });
		await fireEvent.keyDown(brief, { key: 'ArrowRight' });
		await fireEvent.keyDown(brief, { key: 'Enter' });
		const moved = within(screen.getByRole('region', { name: 'Business' })).getByRole('button', {
			name: 'Brief, planned move'
		});
		await waitFor(() => expect(document.activeElement).toBe(moved));
	});

	it('focuses the moved row after Add to plan in the Move to sheet', async () => {
		setup();
		await fireEvent.click(screen.getByRole('button', { name: 'Move Send proposal to…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
		const moved = within(screen.getByRole('region', { name: 'Business' })).getByRole('button', {
			name: 'Send proposal, planned move'
		});
		await waitFor(() => expect(document.activeElement).toBe(moved));
	});
});
