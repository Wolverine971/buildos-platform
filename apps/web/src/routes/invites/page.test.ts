// apps/web/src/routes/invites/page.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { toastService } from '$lib/stores/toast.store';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({ toastService: { success: vi.fn() } }));
vi.mock('$lib/utils/ontology-client-logger', () => ({ logOntologyClientError: vi.fn() }));

import InvitesPage from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('invite list arrival', () => {
	it.each(['joined', 'rejoined', 'already_member'])(
		'opens the actual project for %s results',
		async (status) => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					success: true,
					data: { projectId: 'project-1', project_name: '9takes', status }
				})
			});
			vi.stubGlobal('fetch', fetchMock);
			render(InvitesPage, {
				props: {
					data: {
						invites: [
							{
								invite_id: 'invite-1',
								project_id: 'project-1',
								project_name: '9takes',
								role_key: 'editor',
								agent_access: 'off',
								status: 'pending'
							}
						]
					}
				}
			});
			expect(screen.getByText(/add and change tasks, docs, and plans/)).toBeInTheDocument();
			expect(
				screen.getByText(/AI agents you connect to BuildOS won’t be able to open/)
			).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
			await waitFor(() =>
				expect(goto).toHaveBeenCalledWith(
					`/projects/project-1${status === 'already_member' ? '' : '?joined=1'}`,
					{ invalidateAll: true }
				)
			);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			if (status === 'already_member')
				expect(toastService.success).toHaveBeenCalledExactlyOnceWith(
					'You’re already in 9takes'
				);
			else expect(toastService.success).not.toHaveBeenCalled();
		}
	);
});
