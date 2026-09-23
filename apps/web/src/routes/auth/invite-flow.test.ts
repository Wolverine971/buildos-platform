// apps/web/src/routes/auth/invite-flow.test.ts
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
	replaceState: replaceStateMock,
	preloadCode: vi.fn().mockResolvedValue(undefined),
	afterNavigate: (callback: () => void) => callback()
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
import { AUTH_ERROR_COPY, AUTH_NOTICE_COPY, GENERIC_AUTH_ERROR } from '$lib/utils/auth-status';

const PHISHING_TEXT = 'Your account is locked. Verify at evil.co';
const CLEAN_URL_OPTIONS = { replaceState: true, keepFocus: true, noScroll: true };

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
						user: { id: 'user-1', email: 'invitee@example.com' },
						hasPendingInvites: true
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
				'/invites?message=You%20have%20project%20invites%20to%20review',
				{
					invalidateAll: true
				}
			);
		});
		// The login response answers the invite check; no second round trip before navigating.
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it('lands on /today after login when there is no redirect or pending invite', async () => {
		setPageUrl('http://localhost/auth/login');
		(global.fetch as any).mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/auth/login') {
				return okJson({
					success: true,
					data: {
						user: { id: 'user-1', email: 'user@example.com' },
						hasPendingInvites: false
					}
				});
			}
			throw new Error(`Unhandled fetch: ${url}`);
		});

		render(LoginPage);

		await fireEvent.input(screen.getByLabelText(/email/i), {
			target: { value: 'user@example.com' }
		});
		await fireEvent.input(screen.getByLabelText(/^password/i), {
			target: { value: 'Password1' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

		await waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/today', { invalidateAll: true });
		});
	});

	it('shows the signed-out state and URL errors inline, then clears them from history', async () => {
		setPageUrl('http://localhost/auth/login?signed_out=1&error=state_mismatch&redirect=/today');

		render(LoginPage);

		expect(screen.getByRole('heading', { name: /you’re signed out/i })).toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent(AUTH_ERROR_COPY.state_mismatch);
		// A replacing goto (not shallow replaceState) so Back can't bring the status back.
		await waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith(
				'/auth/login?redirect=%2Ftoday',
				CLEAN_URL_OPTIONS
			);
		});
		expect(replaceStateMock).not.toHaveBeenCalled();
		expect(toastErrorMock).not.toHaveBeenCalled();
	});

	it('never renders URL text as a sign-in notice or error', async () => {
		const params = new URLSearchParams({ message: PHISHING_TEXT, error: PHISHING_TEXT });
		setPageUrl(`http://localhost/auth/login?${params}`);

		render(LoginPage);

		expect(screen.queryByText(PHISHING_TEXT)).not.toBeInTheDocument();
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent(GENERIC_AUTH_ERROR);
		await waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/auth/login', CLEAN_URL_OPTIONS);
		});
	});

	it('shows known notice codes with fixed copy and ignores unknown ones', async () => {
		setPageUrl('http://localhost/auth/login?notice=account_exists');
		const { unmount } = render(LoginPage);
		expect(screen.getByRole('status')).toHaveTextContent(AUTH_NOTICE_COPY.account_exists);
		unmount();

		setPageUrl(`http://localhost/auth/login?notice=${encodeURIComponent(PHISHING_TEXT)}`);
		render(LoginPage);
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
		expect(screen.queryByText(PHISHING_TEXT)).not.toBeInTheDocument();
	});

	it('maps register error codes to fixed copy and never shows URL text', async () => {
		setPageUrl('http://localhost/auth/register?error=policy_unverified&redirect=/today');
		const { unmount } = render(RegisterPage);
		await waitFor(() => {
			expect(screen.getByText(AUTH_ERROR_COPY.policy_unverified)).toBeInTheDocument();
		});
		await waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith(
				'/auth/register?redirect=%2Ftoday',
				CLEAN_URL_OPTIONS
			);
		});
		unmount();

		setPageUrl(`http://localhost/auth/register?error=${encodeURIComponent(PHISHING_TEXT)}`);
		render(RegisterPage);
		await waitFor(() => {
			expect(screen.getByText(GENERIC_AUTH_ERROR)).toBeInTheDocument();
		});
		expect(screen.queryByText(PHISHING_TEXT)).not.toBeInTheDocument();
		expect(toastSuccessMock).not.toHaveBeenCalled();
	});

	it('keeps the invite redirect on the sign-in link after registration requires email confirmation', async () => {
		setPageUrl('http://localhost/auth/register?redirect=/invites/invite-token');
		(global.fetch as any).mockImplementation((input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/legal/acceptance-intent') {
				return okJson({
					success: true,
					data: { token: 'legal-token' }
				});
			}
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
		await fireEvent.click(
			screen.getByRole('checkbox', { name: /terms of use.*privacy policy/i })
		);
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
