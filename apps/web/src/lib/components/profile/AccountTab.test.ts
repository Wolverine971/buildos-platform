// apps/web/src/lib/components/profile/AccountTab.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountTab from './AccountTab.svelte';

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		error: vi.fn(),
		success: vi.fn()
	}
}));

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function accountUser(overrides: Record<string, unknown> = {}) {
	return {
		id: 'user-1',
		email: 'alice@example.com',
		user_metadata: { name: 'Alice' },
		...overrides
	};
}

describe('AccountTab profile draft ownership', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url === '/api/profile/me/username') {
				return jsonResponse({ data: { username: null, derived_fallback: 'alice' } });
			}
			if (url === '/api/account/settings' && init?.method === 'PUT') {
				return jsonResponse({
					success: true,
					data: { message: 'Account updated successfully' }
				});
			}
			throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	it('does not overwrite an in-progress draft during a same-user prop refresh', async () => {
		const view = render(AccountTab, { props: { user: accountUser() } });
		const nameInput = screen.getByRole('textbox', { name: /full name/i }) as HTMLInputElement;
		const emailInput = screen.getByRole('textbox', {
			name: /email address/i
		}) as HTMLInputElement;

		await fireEvent.input(nameInput, { target: { value: 'Draft name' } });
		await fireEvent.input(emailInput, { target: { value: 'draft@example.com' } });

		await view.rerender({
			user: accountUser({
				email: 'refreshed@example.com',
				user_metadata: { name: 'Refreshed name' }
			})
		});

		expect(nameInput.value).toBe('Draft name');
		expect(emailInput.value).toBe('draft@example.com');
	});

	it('commits the normalized submitted values after a successful update', async () => {
		const onsuccess = vi.fn();
		render(AccountTab, { props: { user: accountUser(), onsuccess } });
		const nameInput = screen.getByRole('textbox', { name: /full name/i }) as HTMLInputElement;
		const emailInput = screen.getByRole('textbox', {
			name: /email address/i
		}) as HTMLInputElement;

		await fireEvent.input(nameInput, { target: { value: '  Dana Builder  ' } });
		await fireEvent.input(emailInput, { target: { value: '  dana@example.com  ' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update Profile' }));

		await waitFor(() => {
			expect(onsuccess).toHaveBeenCalledWith({ message: 'Account updated successfully' });
		});

		const updateCall = fetchMock.mock.calls.find(
			([input, init]) => String(input) === '/api/account/settings' && init?.method === 'PUT'
		);
		expect(updateCall).toBeDefined();
		expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({
			name: 'Dana Builder',
			email: 'dana@example.com'
		});
		expect(nameInput.value).toBe('Dana Builder');
		expect(emailInput.value).toBe('dana@example.com');
	});
});
