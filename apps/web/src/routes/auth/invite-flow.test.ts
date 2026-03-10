// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const {
	gotoMock,
	replaceStateMock,
	toastSuccessMock,
	toastErrorMock,
	logAuthClientErrorMock,
	logOntologyClientErrorMock,
	pageStore,
	setPageUrl
} = vi.hoisted(() => {
	let currentPage = {
		url: new URL('http://localhost/auth/login')
	};
	const subscribers = new Set<(value: typeof currentPage) => void>();

	return {
		gotoMock: vi.fn(),
		replaceStateMock: vi.fn(),
		toastSuccessMock: vi.fn(),
		toastErrorMock: vi.fn(),
		logAuthClientErrorMock: vi.fn(),
		logOntologyClientErrorMock: vi.fn(),
		pageStore: {
			subscribe(callback: (value: typeof currentPage) => void) {
				callback(currentPage);
				subscribers.add(callback);
				return () => subscribers.delete(callback);
			}
		},
		setPageUrl(url: string) {
			currentPage = { url: new URL(url) };
			for (const subscriber of subscribers) {
				subscriber(currentPage);
			}
		}
	};
});

vi.mock('$app/stores', () => ({
	page: pageStore
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	replaceState: replaceStateMock
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_GOOGLE_CLIENT_ID: 'google-client-id'
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		success: toastSuccessMock,
		error: toastErrorMock,
		warning: vi.fn()
	}
}));

vi.mock('$lib/utils/auth-client-logger', () => ({
	logAuthClientError: logAuthClientErrorMock
}));

vi.mock('$lib/utils/ontology-client-logger', () => ({
	logOntologyClientError: logOntologyClientErrorMock
}));

import LoginPage from './login/+page.svelte';
import RegisterPage from './register/+page.svelte';

function okJson(payload: Record<string, unknown>) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

describe('Auth invite flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		window.scrollTo = vi.fn();
		window.matchMedia = vi.fn().mockImplementation(() => ({
			matches: false,
			media: '(prefers-reduced-motion: reduce)',
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		}));
	});

	it('sends users back to the invite page after login when an invite redirect is present', async () => {
		setPageUrl('http://localhost/auth/login?redirect=/invites/invite-token');
		(global.fetch as any).mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/auth/login') {
				return okJson({
					success: true,
					data: {
						user: { id: 'user-1', email: 'invitee@example.com' }
					}
				});
			}
			throw new Error(`Unhandled fetch: ${url}`);
		});

		render(LoginPage);

		await fireEvent.input(screen.getByLabelText(/email/i), {
			target: { value: 'invitee@example.com' }
		});
		await fireEvent.input(screen.getByLabelText(/^password/i), {
			target: { value: 'Password1' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

		await waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/invites/invite-token', {
				invalidateAll: true
			});
		});
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it('falls back to the pending invites list after login when no explicit redirect is present', async () => {
		setPageUrl('http://localhost/auth/login');
		(global.fetch as any).mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/auth/login') {
				return okJson({
					success: true,
					data: {
						user: { id: 'user-1', email: 'invitee@example.com' }
					}
				});
			}
			if (url === '/api/onto/invites/pending') {
				return okJson({
					success: true,
					data: {
						invites: [{ invite_id: 'invite-1' }]
					}
				});
			}
			throw new Error(`Unhandled fetch: ${url}`);
		});

		render(LoginPage);

		await fireEvent.input(screen.getByLabelText(/email/i), {
			target: { value: 'invitee@example.com' }
		});
		await fireEvent.input(screen.getByLabelText(/^password/i), {
			target: { value: 'Password1' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

		await waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith(
				'/invites?message=You%20have%20pending%20invites',
				{
					invalidateAll: true
				}
			);
		});
	});

	it('keeps the invite redirect on the sign-in link after registration requires email confirmation', async () => {
		setPageUrl('http://localhost/auth/register?redirect=/invites/invite-token');
		(global.fetch as any).mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/auth/register') {
				return okJson({
					success: true,
					data: {
						requiresEmailConfirmation: true
					},
					message:
						'Registration successful! Please check your email to confirm your account before signing in.'
				});
			}
			throw new Error(`Unhandled fetch: ${url}`);
		});

		render(RegisterPage);

		await fireEvent.input(screen.getByLabelText(/email address/i), {
			target: { value: 'invitee@example.com' }
		});
		await fireEvent.input(screen.getByLabelText(/^password/i), {
			target: { value: 'Password1' }
		});
		await fireEvent.input(screen.getByLabelText(/confirm password/i), {
			target: { value: 'Password1' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^create account$/i }));

		await waitFor(() => {
			expect(screen.getByText(/check your email!/i)).toBeInTheDocument();
		});

		expect(screen.getByRole('link', { name: /go to sign in/i })).toHaveAttribute(
			'href',
			'/auth/login?redirect=%2Finvites%2Finvite-token'
		);
	});
});
