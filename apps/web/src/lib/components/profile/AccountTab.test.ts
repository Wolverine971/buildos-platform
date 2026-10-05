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

	it('opens straight to account deletion when linked from Your data', () => {
		render(AccountTab, { props: { user: accountUser(), initialSection: 'danger' } });
		expect(screen.getByRole('button', { name: 'Delete My Account' })).toBeTruthy();
		expect(screen.queryByRole('textbox', { name: /full name/i })).toBeNull();
	});
});

describe('AccountTab shared projects before account deletion', () => {
	const fetchMock = vi.fn();
	let sharedProjects: unknown[] = [];
	let deleteResponses: Array<{ status: number; body: unknown }> = [];

	const sam = {
		member_id: 'm-1',
		actor_id: 'a-1',
		name: 'Sam',
		email: 'sam@example.com',
		role_key: 'editor',
		access: 'write'
	};
	const lee = {
		...sam,
		member_id: 'm-2',
		actor_id: 'a-2',
		name: 'Lee',
		email: 'lee@example.com'
	};
	const ana = {
		...sam,
		member_id: 'm-3',
		actor_id: 'a-3',
		name: 'Ana',
		email: 'ana@example.com'
	};

	function deleteBodies() {
		return fetchMock.mock.calls
			.filter(
				([input, init]) =>
					String(input) === '/api/account/settings' && init?.method === 'DELETE'
			)
			.map(([, init]) => JSON.parse(String(init?.body)));
	}

	beforeEach(() => {
		sharedProjects = [];
		deleteResponses = [];
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
		fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? 'GET';
			if (url === '/api/profile/me/username') {
				return jsonResponse({ data: { username: null, derived_fallback: 'alice' } });
			}
			if (url === '/api/account/shared-projects' && method === 'GET') {
				return jsonResponse({ success: true, data: { projects: sharedProjects } });
			}
			if (url === '/api/account/settings' && method === 'DELETE') {
				const next = deleteResponses.shift() ?? {
					status: 500,
					body: { success: false, error: 'Stopped by test' }
				};
				return jsonResponse(next.body, next.status);
			}
			throw new Error(`Unexpected request: ${method} ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	it('goes straight to the final confirmation when no shared projects are owned', async () => {
		render(AccountTab, { props: { user: accountUser(), initialSection: 'danger' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));

		await fireEvent.click(
			await screen.findByRole('button', { name: 'Yes, Delete My Account' })
		);
		await waitFor(() => expect(deleteBodies()).toHaveLength(1));
		expect(screen.queryByRole('heading', { name: 'Shared projects' })).toBeNull();
		expect(deleteBodies()[0]).toEqual({ shared_projects: [] });
	});

	it('hands each shared project to the chosen member before deleting', async () => {
		sharedProjects = [{ project_id: 'p-1', project_name: 'Garden plan', members: [sam, lee] }];
		render(AccountTab, { props: { user: accountUser(), initialSection: 'danger' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));

		expect(await screen.findByRole('heading', { name: 'Shared projects' })).toBeTruthy();
		expect(
			(screen.getByRole('radio', { name: 'Give it to' }) as HTMLInputElement).checked
		).toBe(true);
		expect(screen.getByText(/Delete it for everyone — 2 people lose access/)).toBeTruthy();
		const ownerSelect = screen.getByRole('combobox', {
			name: 'New owner of Garden plan'
		}) as HTMLSelectElement;
		expect(ownerSelect.value).toBe('m-1');

		await fireEvent.change(ownerSelect, { target: { value: 'm-2' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Yes, Delete My Account' })
		);

		await waitFor(() => expect(deleteBodies()).toHaveLength(1));
		expect(deleteBodies()[0]).toEqual({
			shared_projects: [{ project_id: 'p-1', action: 'handoff', member_id: 'm-2' }]
		});
	});

	it('reopens the step with the server list when a shared project still needs a decision', async () => {
		sharedProjects = [{ project_id: 'p-1', project_name: 'Garden plan', members: [sam] }];
		deleteResponses = [
			{
				status: 409,
				body: {
					success: false,
					error: 'Decide what happens to your shared projects first',
					code: 'shared_projects_decision_required',
					details: {
						projects: [
							{ project_id: 'p-1', project_name: 'Garden plan', members: [sam] },
							{ project_id: 'p-2', project_name: 'Book draft', members: [ana] }
						]
					}
				}
			}
		];
		render(AccountTab, { props: { user: accountUser(), initialSection: 'danger' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));
		await fireEvent.click(
			await screen.findByRole('radio', {
				name: /Delete it for everyone — 1 person loses access/
			})
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Yes, Delete My Account' })
		);

		expect(
			await screen.findByText('Your shared projects changed. Check each one, then continue.')
		).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'New owner of Book draft' })).toBeTruthy();
		expect(deleteBodies()[0]).toEqual({
			shared_projects: [{ project_id: 'p-1', action: 'delete' }]
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Yes, Delete My Account' })
		);
		await waitFor(() => expect(deleteBodies()).toHaveLength(2));
		expect(deleteBodies()[1]).toEqual({
			shared_projects: [
				{ project_id: 'p-1', action: 'delete' },
				{ project_id: 'p-2', action: 'handoff', member_id: 'm-3' }
			]
		});
	});
});
