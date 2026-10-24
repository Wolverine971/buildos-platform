// apps/web/src/routes/join/[token]/page.test.ts
// @vitest-environment jsdom
import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const { gotoMock, toastSuccessMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	toastSuccessMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: toastSuccessMock, error: vi.fn(), warning: vi.fn() }
}));
vi.mock('$lib/utils/ontology-client-logger', () => ({ logOntologyClientError: vi.fn() }));

import JoinPage from './+page.svelte';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const ACTIVE = {
	status: 'active',
	project_name: '9takes',
	inviter_name: 'DJ',
	role_key: 'viewer',
	agent_access: 'read',
	expires_at: '2026-10-30T12:00:00.000Z',
	already_member: false,
	project_id: null
};

function page(overrides: Record<string, unknown> = {}) {
	return {
		data: {
			token: TOKEN,
			redirectTo: `/join/${TOKEN}`,
			viewer: null,
			loadError: false,
			preview: ACTIVE,
			...overrides
		}
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	gotoMock.mockReset();
	toastSuccessMock.mockReset();
});

describe('/join/[token] page', () => {
	it('signed out: shows who invited them, the role in plain words, and comes back after sign-in', () => {
		render(JoinPage, { props: page() });

		expect(
			screen.getByRole('heading', { name: 'DJ invited you to 9takes' })
		).toBeInTheDocument();
		expect(screen.getByText('You’ll join as a viewer.')).toBeInTheDocument();
		expect(screen.getByText(/see everything in it and follow along/)).toBeInTheDocument();
		expect(screen.getByText(/it can read this project for you/)).toBeInTheDocument();
		expect(screen.getByText(/This link works until Oct 30/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Create an account to join/ })).toHaveAttribute(
			'href',
			`/auth/register?redirect=${encodeURIComponent(`/join/${TOKEN}`)}`
		);
		expect(screen.getByRole('link', { name: /Sign in to join/ })).toHaveAttribute(
			'href',
			`/auth/login?redirect=${encodeURIComponent(`/join/${TOKEN}`)}`
		);
		expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
			'content',
			'noindex, nofollow'
		);
	});

	it('signed in: joins and lands in the project', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				success: true,
				data: { status: 'joined', project_id: 'project-1', project_name: '9takes' }
			})
		});
		vi.stubGlobal('fetch', fetchMock);
		render(JoinPage, { props: page({ viewer: { email: 'sam@example.com', name: 'Sam' } }) });

		expect(screen.getByText('sam@example.com')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Not you? Switch account' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /Join 9takes/ }));

		await waitFor(() =>
			expect(gotoMock).toHaveBeenCalledWith('/projects/project-1?joined=1', {
				invalidateAll: true
			})
		);
		const call = fetchMock.mock.calls[0];
		assert.isDefined(call, 'Expected the join request to be sent');
		expect(JSON.parse(call[1].body)).toEqual({ token: TOKEN });
		// The authenticated destination shows the one named toast.
		expect(toastSuccessMock).not.toHaveBeenCalled();
	});

	it('explains a link that changed while the page was open', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({ success: true, data: { status: 'reset', project_id: null } })
			})
		);
		render(JoinPage, { props: page({ viewer: { email: 'sam@example.com', name: 'Sam' } }) });
		await fireEvent.click(screen.getByRole('button', { name: /Join 9takes/ }));

		expect(
			await screen.findByRole('heading', { name: 'This invite link was replaced' })
		).toBeInTheDocument();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('a former member asks to rejoin instead of joining', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				success: true,
				data: { status: 'rejoin_requested', project_id: null, project_name: '9takes' }
			})
		});
		vi.stubGlobal('fetch', fetchMock);
		render(JoinPage, {
			props: page({
				viewer: { email: 'sam@example.com', name: 'Sam' },
				preview: { ...ACTIVE, rejoin: 'ask' }
			})
		});

		expect(screen.getByText('You were in 9takes before')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Join 9takes/ })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Ask to rejoin' }));

		expect(await screen.findByText('Request sent')).toBeInTheDocument();
		expect(screen.getByText(/DJ decides whether you come back to 9takes/)).toBeInTheDocument();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('shows a waiting rejoin request and a final deny', () => {
		render(JoinPage, {
			props: page({
				viewer: { email: 'sam@example.com', name: 'Sam' },
				preview: { ...ACTIVE, rejoin: 'pending' }
			})
		});
		expect(screen.getByText('Your request is waiting')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Ask to rejoin' })).not.toBeInTheDocument();
		cleanup();

		render(JoinPage, {
			props: page({
				viewer: { email: 'sam@example.com', name: 'Sam' },
				preview: { ...ACTIVE, rejoin: 'denied' }
			})
		});
		expect(
			screen.getByRole('heading', { name: 'You can’t rejoin 9takes' })
		).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('tells a member they are already in', () => {
		render(JoinPage, {
			props: page({
				viewer: { email: 'sam@example.com', name: 'Sam' },
				preview: { ...ACTIVE, already_member: true, project_id: 'project-1' }
			})
		});
		expect(screen.getByText('You’re already in 9takes.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Open 9takes/ })).toHaveAttribute(
			'href',
			'/projects/project-1'
		);
		expect(screen.queryByRole('button', { name: /Join/ })).not.toBeInTheDocument();
	});

	it.each([
		['expired', 'This invite link expired'],
		['reset', 'This invite link was replaced'],
		['turned_off', 'This invite link is turned off'],
		['not_found', 'This invite link doesn’t work']
	])('shows a clear message for a %s link', (status, title) => {
		render(JoinPage, { props: page({ preview: { status } }) });
		expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
		expect(screen.queryByText(/9takes/)).not.toBeInTheDocument();
	});
});
