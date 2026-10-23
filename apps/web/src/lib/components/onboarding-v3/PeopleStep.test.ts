// apps/web/src/lib/components/onboarding-v3/PeopleStep.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$lib/services/posthog', () => ({ captureEvent: vi.fn() }));

import PeopleStep from './PeopleStep.svelte';

type Reply = { status?: number; body: unknown };

function mockFetch(routes: Record<string, Reply | Reply[]>) {
	const calls: Array<{ url: string; method: string; body: unknown }> = [];
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const method = init?.method ?? 'GET';
		calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
		const key = `${method} ${url}`;
		const entry = routes[key];
		const reply = Array.isArray(entry) ? entry.shift() : entry;
		if (!reply) throw new Error(`Unexpected fetch ${key}`);
		return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
	});
	vi.stubGlobal('fetch', fetchMock);
	return calls;
}

const noHandle: Reply = {
	body: {
		success: true,
		data: { username: null, discoverability: 'none', derived_fallback: 'Sam Rivera' }
	}
};

describe('PeopleStep', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('explains the people layer, suggests a handle, and claims it as findable', async () => {
		const calls = mockFetch({
			'GET /api/profile/me/username': noHandle,
			'PATCH /api/profile/me/username': {
				body: { success: true, data: { username: 'samrivera' } }
			},
			'PATCH /api/profile/me/discoverability': { body: { success: true, data: {} } },
			'GET /api/onto/projects/p1/invite-link': {
				body: { success: true, data: { link: null } }
			}
		});
		render(PeopleStep, {
			props: { projectId: 'p1', projectName: 'Garden Book', onNext: vi.fn() }
		});

		expect(await screen.findByText('Find people you build with')).toBeInTheDocument();
		expect(screen.getByText('Invite people into Garden Book')).toBeInTheDocument();
		expect(screen.getByText('Let their agents pitch in')).toBeInTheDocument();
		const input = screen.getByLabelText('Your handle') as HTMLInputElement;
		expect(input.value).toBe('samrivera');
		expect(screen.getByText('What people see when they look you up')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Claim @samrivera' }));

		expect(await screen.findByText(/You're @samrivera/)).toBeInTheDocument();
		expect(
			calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/username'))?.body
		).toEqual({
			username: 'samrivera'
		});
		expect(calls.find((c) => c.url.endsWith('/discoverability'))?.body).toEqual({
			discoverability: 'handle'
		});
		expect(screen.getByText('Or invite someone by email')).toBeInTheDocument();
		expect(
			await screen.findByRole('button', { name: /Create invite link/ })
		).toBeInTheDocument();
	});

	it('claims the handle picked on the signup page without asking again', async () => {
		sessionStorage.setItem('buildos:onboarding:signup-handle', 'garden-sam');
		const calls = mockFetch({
			'GET /api/profile/me/username': noHandle,
			'PATCH /api/profile/me/username': {
				body: { success: true, data: { username: 'garden-sam' } }
			},
			'PATCH /api/profile/me/discoverability': { body: { success: true, data: {} } },
			'GET /api/onto/projects/p1/invite-link': {
				body: { success: true, data: { link: null } }
			}
		});
		render(PeopleStep, {
			props: { projectId: 'p1', projectName: 'Garden Book', onNext: vi.fn() }
		});

		expect(await screen.findByText(/You're @garden-sam/)).toBeInTheDocument();
		expect(
			calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/username'))?.body
		).toEqual({
			username: 'garden-sam'
		});
		expect(sessionStorage.getItem('buildos:onboarding:signup-handle')).toBeNull();
	});

	it('keeps the user on the form when the handle is taken, and does not turn on findability', async () => {
		const calls = mockFetch({
			'GET /api/profile/me/username': noHandle,
			'PATCH /api/profile/me/username': {
				status: 409,
				body: { success: false, error: 'That username is already taken. Try another.' }
			}
		});
		render(PeopleStep, { props: { projectId: null, onNext: vi.fn() } });

		await fireEvent.click(await screen.findByRole('button', { name: 'Claim @samrivera' }));

		expect(await screen.findByText('@samrivera is taken. Try another.')).toBeInTheDocument();
		expect(calls.some((c) => c.url.endsWith('/discoverability'))).toBe(false);
	});

	it('does not save findability when the user unticks it', async () => {
		const calls = mockFetch({
			'GET /api/profile/me/username': noHandle,
			'PATCH /api/profile/me/username': {
				body: { success: true, data: { username: 'samrivera' } }
			}
		});
		render(PeopleStep, { props: { projectId: null, onNext: vi.fn() } });

		await fireEvent.click(await screen.findByLabelText(/Let people find me by this handle/));
		await fireEvent.click(screen.getByRole('button', { name: 'Claim @samrivera' }));

		expect(await screen.findByText(/You're @samrivera/)).toBeInTheDocument();
		expect(calls.some((c) => c.url.endsWith('/discoverability'))).toBe(false);
	});

	it('blocks badly shaped handles and lets the user skip', async () => {
		mockFetch({ 'GET /api/profile/me/username': noHandle });
		const onNext = vi.fn();
		render(PeopleStep, { props: { projectId: null, onNext } });

		const input = await screen.findByLabelText('Your handle');
		await fireEvent.input(input, { target: { value: 'no spaces!' } });
		expect(screen.getByRole('button', { name: 'Claim your handle' })).toBeDisabled();

		await fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
		await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
	});

	it('invites by email as a viewer whose agents can read, for users who already have a handle', async () => {
		const calls = mockFetch({
			'GET /api/profile/me/username': {
				body: { success: true, data: { username: 'sam', discoverability: 'handle' } }
			},
			'POST /api/onto/projects/p1/invites': { body: { success: true, data: {} } },
			'GET /api/onto/projects/p1/invite-link': {
				body: { success: true, data: { link: null } }
			}
		});
		const onNext = vi.fn();
		render(PeopleStep, { props: { projectId: 'p1', projectName: 'Garden Book', onNext } });

		expect(await screen.findByText('Bring someone in')).toBeInTheDocument();
		await fireEvent.input(screen.getByLabelText('Their email'), {
			target: { value: 'friend@example.com' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

		expect(await screen.findByText('Invite sent to friend@example.com')).toBeInTheDocument();
		expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
			email: 'friend@example.com',
			role_key: 'viewer',
			agent_access: 'read'
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
	});
});
