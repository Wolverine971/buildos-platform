// apps/web/src/lib/components/organize/OrganizeEntryButton.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OrganizeEntryButton from './OrganizeEntryButton.svelte';
const nav = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => nav);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it.each(['document', 'task'] as const)(
	'opens Organize with the saved %s selected',
	async (kind) => {
		const onNavigate = vi.fn();
		render(OrganizeEntryButton, { projectId: 'project', itemId: 'item', kind, onNavigate });
		await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
		expect(nav.goto).toHaveBeenCalledWith(`/projects/project/organize?${kind}=item`);
		expect(onNavigate).toHaveBeenCalledOnce();
	}
);
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
