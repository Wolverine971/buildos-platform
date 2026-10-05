// apps/web/src/lib/components/project/ProjectDeleteConfirmModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectDeleteConfirmModal from './ProjectDeleteConfirmModal.svelte';

function member(id: string, name: string, role_key = 'editor') {
	return { id: `member-${id}`, actor_id: `actor-${id}`, role_key, actor: { name, email: null } };
}

function membersResponse(viewerRole: string, others: ReturnType<typeof member>[]): Response {
	return new Response(
		JSON.stringify({
			success: true,
			data: { actorId: 'actor-me', members: [member('me', 'Me', viewerRole), ...others] }
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
}

describe('ProjectDeleteConfirmModal', () => {
	beforeEach(() => {
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

	it('says who loses access and offers the owner a handoff instead', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				membersResponse('owner', [
					member('sam', 'Sam'),
					member('lee', 'Lee'),
					member('ana', 'Ana'),
					member('bo', 'Bo', 'viewer')
				])
			)
		);
		const onconfirm = vi.fn();
		const onHandOff = vi.fn();
		render(ProjectDeleteConfirmModal, {
			props: {
				isOpen: true,
				projectId: 'project-1',
				projectName: 'Garden plan',
				onconfirm,
				oncancel: vi.fn(),
				onHandOff
			}
		});

		expect(screen.getByText(/moves to Trash\. You can restore it from Projects/)).toBeTruthy();
		expect(
			await screen.findByText(
				'4 people will lose access: Sam, Lee, Ana, and 1 more. We’ll email them.'
			)
		).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Hand it off instead' }));
		expect(onHandOff).toHaveBeenCalledTimes(1);
		await fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
		expect(onconfirm).toHaveBeenCalledTimes(1);
	});

	it('skips the callout and handoff for a project only the owner is in', async () => {
		const fetchMock = vi.fn(async () => membersResponse('owner', []));
		vi.stubGlobal('fetch', fetchMock);
		render(ProjectDeleteConfirmModal, {
			props: {
				isOpen: true,
				projectId: 'project-1',
				projectName: 'Solo notes',
				onconfirm: vi.fn(),
				oncancel: vi.fn(),
				onHandOff: vi.fn()
			}
		});

		const confirm = await screen.findByRole('button', { name: 'Move to Trash' });
		await vi.waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
		expect(screen.queryByText(/will lose access/)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Hand it off instead' })).toBeNull();
	});
});
