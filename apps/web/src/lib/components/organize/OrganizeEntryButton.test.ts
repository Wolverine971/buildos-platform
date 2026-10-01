// apps/web/src/lib/components/organize/OrganizeEntryButton.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OrganizeEntryButton from './OrganizeEntryButton.svelte';
const nav = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => nav);

/**
 * Mirrors SvelteKit's client router (client.js): a goto loads before it commits,
 * and any popstate meanwhile replaces the navigation token, which silently
 * abandons that goto. `onRouteChange` stands in for the page swap that
 * unmounts the editor hosting the button.
 */
function installRouter(onRouteChange: () => void) {
	let token = {};
	const onPopState = () => {
		token = {};
	};
	window.addEventListener('popstate', onPopState);
	nav.goto.mockImplementation(async (url: string) => {
		const navigation = (token = {});
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (navigation !== token) return;
		window.history.pushState({}, '', url);
		onRouteChange();
	});
	return () => window.removeEventListener('popstate', onPopState);
}

let uninstall: (() => void) | null = null;
beforeEach(() => {
	vi.clearAllMocks();
	window.history.replaceState({}, '', '/projects/project');
});
afterEach(() => {
	uninstall?.();
	uninstall = null;
	cleanup();
});

it.each(['document', 'task'] as const)(
	'lands on Organize with the %s selected when closing the editor pops its history entry',
	async (kind) => {
		// The workspace pushes an entry when it opens an editor and closes it with
		// history.back() (ProjectWorkspace closeEntityEditor).
		window.history.pushState({}, '', `/projects/project?entity=${kind}&entity_id=item`);
		const closeEditor = vi.fn(() => window.history.back());
		const view = render(OrganizeEntryButton, {
			projectId: 'project',
			itemId: 'item',
			kind,
			onNavigate: closeEditor
		});
		uninstall = installRouter(() => view.unmount());
		await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
		await waitFor(() => expect(window.location.pathname).toBe('/projects/project/organize'));
		expect(window.location.search).toBe(`?${kind}=item`);
		// Nothing pops back off Organize once the route change unmounted the editor.
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(window.location.pathname).toBe('/projects/project/organize');
		expect(closeEditor).not.toHaveBeenCalled();
	}
);

it('closes an editor that is still open after Organize loads', async () => {
	const onNavigate = vi.fn();
	render(OrganizeEntryButton, {
		projectId: 'project',
		itemId: 'item',
		kind: 'task',
		onNavigate
	});
	uninstall = installRouter(() => {});
	await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
	await waitFor(() => expect(onNavigate).toHaveBeenCalledOnce());
	expect(window.location.pathname).toBe('/projects/project/organize');
});

it('keeps an editor with pending changes in place', async () => {
	const onNavigate = vi.fn();
	render(OrganizeEntryButton, {
		projectId: 'project',
		itemId: 'item',
		kind: 'document',
		disabled: true,
		onNavigate
	});
	await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
	expect(nav.goto).not.toHaveBeenCalled();
	expect(onNavigate).not.toHaveBeenCalled();
});

it('works as a row in an open menu, waiting for Organize before closing it', async () => {
	const onNavigate = vi.fn();
	render(OrganizeEntryButton, {
		projectId: 'project',
		itemId: 'item',
		kind: 'document',
		variant: 'menuitem',
		label: 'Move between projects…',
		onNavigate
	});
	uninstall = installRouter(() => {});
	const item = screen.getByRole('menuitem', { name: 'Move between projects…' });
	await fireEvent.click(item);
	expect(item).toBeDisabled();
	await waitFor(() => expect(onNavigate).toHaveBeenCalledOnce());
	expect(window.location.search).toBe('?document=item');
});
