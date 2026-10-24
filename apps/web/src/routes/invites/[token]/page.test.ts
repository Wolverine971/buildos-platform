// apps/web/src/routes/invites/[token]/page.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto, invalidate } from '$app/navigation';
import { toastService } from '$lib/stores/toast.store';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn()
}));

vi.mock('$lib/services/browser-push.service', () => ({
	browserPushService: {
		isSupported: vi.fn(() => false),
		requestPermission: vi.fn(),
		subscribe: vi.fn()
	}
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn()
	}
}));

vi.mock('$lib/utils/ontology-client-logger', () => ({
	logOntologyClientError: vi.fn()
}));

import InviteTokenPage from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('/invites/[token] page', () => {
	it('renders project-specific social metadata without allowing invite indexing', () => {
		render(InviteTokenPage, {
			props: {
				data: {
					status: 'unauthenticated',
					redirectTo: '/invites/invite-token',
					invite: {
						invite_id: 'invite-1',
						project_name: 'Project Alpha',
						role_key: 'editor',
						invited_by_name: 'Owner'
					}
				}
			}
		});

		expect(document.title).toBe('Project Alpha | BuildOS Project Invite');
		expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute(
			'content',
			'Project Alpha | BuildOS Project Invite'
		);
		expect(document.head.querySelector('meta[name="twitter:title"]')).toHaveAttribute(
			'content',
			'Project Alpha | BuildOS Project Invite'
		);
		expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
			'content',
			'noindex, nofollow'
		);
	});

	it('renders login and registration links that preserve the invite token path', () => {
		render(InviteTokenPage, {
			props: {
				data: {
					status: 'unauthenticated',
					redirectTo: '/invites/invite-token',
					invite: {
						invite_id: 'invite-1',
						project_name: 'Project Alpha',
						role_key: 'editor',
						invited_by_name: 'Owner',
						expires_at: '2026-04-30T00:00:00.000Z'
					}
				}
			}
		});

		expect(screen.getByRole('link', { name: /sign in to accept/i })).toHaveAttribute(
			'href',
			'/auth/login?redirect=%2Finvites%2Finvite-token'
		);
		expect(screen.getByRole('link', { name: /create account/i })).toHaveAttribute(
			'href',
			'/auth/register?redirect=%2Finvites%2Finvite-token'
		);
	});

	it('allows a recoverable declined invite to be accepted again', () => {
		render(InviteTokenPage, {
			props: {
				data: {
					status: 'ready',
					redirectTo: '/invites/invite-token',
					userEmail: 'invitee@example.com',
					emailMatches: true,
					invite: {
						invite_id: 'invite-1',
						project_name: 'Project Alpha',
						role_key: 'editor',
						status: 'declined',
						can_accept: true,
						recoverable_until: '2026-05-23T12:00:00.000Z',
						invitee_email: 'invitee@example.com',
						invited_by_name: 'Owner',
						expires_at: '2026-05-30T00:00:00.000Z'
					}
				}
			}
		});

		expect(screen.getByText(/declined · recoverable/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /accept anyway/i })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /decline invite/i })).not.toBeInTheDocument();
	});

	it('says who invited them and their role in plain words', () => {
		render(InviteTokenPage, {
			props: {
				data: {
					status: 'unauthenticated',
					redirectTo: '/invites/invite-token',
					invite: {
						invite_id: 'invite-1',
						project_name: 'Project Alpha',
						role_key: 'viewer',
						status: 'pending',
						invited_by_name: 'Owner',
						expires_at: '2026-04-30T12:00:00.000Z'
					}
				}
			}
		});

		expect(
			screen.getByRole('heading', { name: 'Owner invited you to Project Alpha' })
		).toBeInTheDocument();
		expect(screen.getByText('You’ll join as a viewer.')).toBeInTheDocument();
		expect(screen.getByText(/This invite works until Apr 30/)).toBeInTheDocument();
	});

	it('tells someone already in the project and links to it', () => {
		render(InviteTokenPage, {
			props: {
				data: {
					status: 'ready',
					redirectTo: '/invites/invite-token',
					userEmail: 'invitee@example.com',
					emailMatches: true,
					alreadyMember: true,
					invite: {
						invite_id: 'invite-1',
						project_id: 'project-1',
						project_name: 'Project Alpha',
						role_key: 'editor',
						status: 'pending',
						invitee_email: 'invitee@example.com',
						invited_by_name: 'Owner'
					}
				}
			}
		});

		expect(screen.getByText('You’re already in Project Alpha.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Open Project Alpha/ })).toHaveAttribute(
			'href',
			'/projects/project-1'
		);
		expect(screen.queryByRole('button', { name: /accept invite/i })).not.toBeInTheDocument();
	});

	it('explains the wrong account and an expired or canceled invite', () => {
		const base = {
			status: 'ready',
			redirectTo: '/invites/invite-token',
			userEmail: 'other@example.com',
			emailMatches: false,
			invite: {
				invite_id: 'invite-1',
				project_name: 'Project Alpha',
				role_key: 'viewer',
				status: 'pending',
				invitee_email: 'invitee@example.com',
				invited_by_name: 'Owner',
				expires_at: '2026-04-30T12:00:00.000Z'
			}
		};
		const view = render(InviteTokenPage, {
			props: { data: { ...base, inviteeEmailHint: 'i•••@e•••.com' } }
		});
		expect(screen.getByText(/Switch to the invited account to accept it/)).toBeInTheDocument();
		expect(screen.getByText('i•••@e•••.com')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Switch account/ })).toBeInTheDocument();
		view.unmount();

		render(InviteTokenPage, {
			props: { data: { ...base, invite: { ...base.invite, status: 'revoked' } } }
		});
		expect(screen.getByText(/Owner canceled this invite/)).toBeInTheDocument();
	});
});

describe('accepting a direct invite', () => {
	const data = {
		status: 'ready',
		emailMatches: true,
		userEmail: 'sam@example.com',
		invite: {
			invite_id: 'invite-1',
			project_id: 'project-1',
			project_name: '9takes',
			role_key: 'editor',
			agent_access: 'off',
			status: 'pending'
		}
	};

	it.each(['joined', 'rejoined'])(
		'opens a %s project immediately, with no notification preference writes',
		async (status) => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					success: true,
					data: { projectId: 'project-1', project_name: '9takes', status }
				})
			});
			vi.stubGlobal('fetch', fetchMock);
			render(InviteTokenPage, { props: { data } });
			expect(
				screen.getByText(/AI agents you connect to BuildOS won’t be able to open/)
			).toBeInTheDocument();
			await fireEvent.click(screen.getByRole('button', { name: 'Accept invite' }));
			await waitFor(() =>
				expect(goto).toHaveBeenCalledWith('/projects/project-1?joined=1', {
					invalidateAll: true
				})
			);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock).toHaveBeenCalledWith('/api/onto/invites/invite-1/accept', {
				method: 'POST'
			});
			expect(invalidate).toHaveBeenCalledWith('app:invites');
			expect(screen.queryByRole('button', { name: /Enable push/ })).not.toBeInTheDocument();
			expect(toastService.success).not.toHaveBeenCalled();
		}
	);

	it('handles a stale page without claiming a new join or offering the old permissions', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					success: true,
					data: {
						projectId: 'project-1',
						project_name: '9takes',
						status: 'already_member'
					}
				})
			})
		);
		render(InviteTokenPage, { props: { data } });
		await fireEvent.click(screen.getByRole('button', { name: 'Accept invite' }));
		await waitFor(() =>
			expect(goto).toHaveBeenCalledWith('/projects/project-1', { invalidateAll: true })
		);
		expect(toastService.success).toHaveBeenCalledExactlyOnceWith('You’re already in 9takes');
	});
});
