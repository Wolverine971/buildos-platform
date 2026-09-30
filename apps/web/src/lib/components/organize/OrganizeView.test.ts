// apps/web/src/lib/components/organize/OrganizeView.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizeView from './OrganizeView.svelte';
import { organizeFixtures } from './organize-fixtures';

const navigation = vi.hoisted(() => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
vi.mock('$app/navigation', () => navigation);

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
		const brief = screen.getByRole('button', { name: 'Brief', exact: true });
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
				name: 'Brief',
				exact: true
			})
		).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('opens Move to from M, stages a task, then discards the plan', async () => {
		setup();
		await fireEvent.keyDown(
			screen.getByRole('button', { name: 'Send proposal', exact: true }),
			{ key: 'm' }
		);
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
		await fireEvent.keyDown(screen.getByRole('button', { name: 'START HERE', exact: true }), {
			key: ' '
		});
		expect(screen.getByRole('status')).toHaveTextContent('START HERE stays in this project.');
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief', exact: true }), {
			key: ' '
		});
		await fireEvent.keyDown(window, { key: 'Escape' });
		await fireEvent.keyDown(window, { key: 'Enter' });
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
	});

	it('protects a staged plan from accidental navigation', async () => {
		setup();
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief', exact: true }), {
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
});
