// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
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

describe('/invites/[token] page', () => {
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
});
