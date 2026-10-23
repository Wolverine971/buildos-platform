// apps/web/src/lib/components/project/ProjectCollaborationModal.test.ts
// @vitest-environment jsdom
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectCollaborationModal from './ProjectCollaborationModal.svelte';

const { logOntologyClientErrorMock } = vi.hoisted(() => ({
	logOntologyClientErrorMock: vi.fn()
}));

vi.mock('$lib/utils/ontology-client-logger', () => ({
	logOntologyClientError: logOntologyClientErrorMock
}));

const { toastSuccessMock, toastErrorMock, copyTextMock } = vi.hoisted(() => ({
	toastSuccessMock: vi.fn(),
	toastErrorMock: vi.fn(),
	copyTextMock: vi.fn()
}));

vi.mock('$lib/utils/public-page-url', () => ({ copyTextToClipboard: copyTextMock }));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: toastSuccessMock, error: toastErrorMock, info: vi.fn() }
}));

const PROJECT_A_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_B_ID = '22222222-2222-4222-8222-222222222222';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

interface PendingRequest {
	url: string;
	signal: AbortSignal | null;
	response: Deferred<Response>;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function jsonResponse(payload: unknown, jsonError?: Error): Response {
	return {
		ok: true,
		status: 200,
		json: jsonError ? async () => Promise.reject(jsonError) : async () => payload
	} as Response;
}

function responseFor(url: string, projectId: string, memberName: string): Response {
	if (url.endsWith('/members')) {
		return jsonResponse({
			data: {
				actorId: `${projectId}-actor`,
				members: [
					{
						id: `${projectId}-member`,
						actor_id: `${projectId}-actor`,
						role_key: 'owner',
						access: 'admin',
						actor: {
							id: `${projectId}-actor`,
							name: memberName,
							email: `${memberName.toLowerCase().replaceAll(' ', '.')}@example.com`
						}
					}
				]
			}
		});
	}

	if (url.endsWith('/invites')) {
		return jsonResponse({ data: { invites: [] } });
	}

	return jsonResponse({
		data: {
			settings: {
				project_id: projectId,
				member_count: 1,
				is_shared_project: false,
				project_default_enabled: true,
				member_enabled: true,
				effective_enabled: true,
				member_overridden: false,
				can_manage_default: true
			}
		}
	});
}

async function settleRequests(requests: PendingRequest[]) {
	await Promise.all(requests.map(({ response }) => response.promise));
	await Promise.resolve();
	await tick();
}

describe('ProjectCollaborationModal request coordination', () => {
	let requests: PendingRequest[];

	beforeEach(() => {
		requests = [];
		logOntologyClientErrorMock.mockReset();
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
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const response = deferred<Response>();
				requests.push({
					url: String(input),
					signal: init?.signal ?? null,
					response
				});
				// Deliberately ignore AbortSignal so the request-id guard is tested too.
				return response.promise;
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('keeps the latest project when an aborted request resolves late', async () => {
		const view = render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: 'Project A'
			}
		});

		await waitFor(() => expect(requests).toHaveLength(3));
		const projectARequests = requests.slice();

		await view.rerender({
			isOpen: true,
			projectId: PROJECT_B_ID,
			projectName: 'Project B'
		});

		await waitFor(() => expect(requests).toHaveLength(6));
		expect(projectARequests.every(({ signal }) => signal?.aborted)).toBe(true);

		const projectBRequests = requests.slice(3);
		for (const request of projectBRequests) {
			request.response.resolve(responseFor(request.url, PROJECT_B_ID, 'Project B Member'));
		}
		await settleRequests(projectBRequests);
		await waitFor(() => expect(screen.getByText('Project B Member')).toBeInTheDocument());

		for (const request of projectARequests) {
			request.response.resolve(responseFor(request.url, PROJECT_A_ID, 'Project A Member'));
		}
		await settleRequests(projectARequests);

		expect(screen.queryByText('Project A Member')).not.toBeInTheDocument();
		expect(screen.getByText('Project B Member')).toBeInTheDocument();
	});

	it('cancels on close and ignores a stale error and finally after reopening', async () => {
		const onClose = vi.fn();
		const view = render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				onClose,
				projectId: PROJECT_A_ID,
				projectName: 'Project A'
			}
		});

		await waitFor(() => expect(requests).toHaveLength(3));
		const projectARequests = requests.slice();
		await fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(projectARequests.every(({ signal }) => signal?.aborted)).toBe(true);

		await view.rerender({
			isOpen: true,
			onClose,
			projectId: PROJECT_B_ID,
			projectName: 'Project B'
		});
		await waitFor(() => expect(requests).toHaveLength(6));
		expect(screen.getByText('Loading people…')).toBeInTheDocument();

		for (const request of projectARequests) {
			request.response.resolve(
				request.url.endsWith('/members')
					? jsonResponse(null, new Error('stale project failure'))
					: responseFor(request.url, PROJECT_A_ID, 'Project A Member')
			);
		}
		await settleRequests(projectARequests);

		expect(screen.getByText('Loading people…')).toBeInTheDocument();
		expect(logOntologyClientErrorMock).not.toHaveBeenCalled();

		const projectBRequests = requests.slice(3);
		for (const request of projectBRequests) {
			request.response.resolve(responseFor(request.url, PROJECT_B_ID, 'Project B Member'));
		}
		await settleRequests(projectBRequests);
		await waitFor(() => expect(screen.getByText('Project B Member')).toBeInTheDocument());
	});

	it('ignores a notification update that resolves after switching projects', async () => {
		const view = render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: 'Project A'
			}
		});

		await waitFor(() => expect(requests).toHaveLength(3));
		const projectARequests = requests.slice();
		for (const request of projectARequests) {
			request.response.resolve(responseFor(request.url, PROJECT_A_ID, 'Project A Member'));
		}
		await settleRequests(projectARequests);

		// Your own row opens by default for members: notifications live there now.
		const notificationToggle = await screen.findByRole('switch', {
			name: /Notify me when people change things here/i
		});
		expect(notificationToggle).toHaveAttribute('aria-checked', 'true');
		await fireEvent.click(notificationToggle);
		await waitFor(() => expect(requests).toHaveLength(4));
		const projectAUpdate = requests[3];
		expect(requireTestValue(projectAUpdate).url).toBe(
			`/api/onto/projects/${PROJECT_A_ID}/notification-settings`
		);

		await view.rerender({
			isOpen: true,
			projectId: PROJECT_B_ID,
			projectName: 'Project B'
		});
		await waitFor(() => expect(requests).toHaveLength(7));

		const projectBRequests = requests.slice(4);
		for (const request of projectBRequests) {
			request.response.resolve(responseFor(request.url, PROJECT_B_ID, 'Project B Member'));
		}
		await settleRequests(projectBRequests);
		await waitFor(() => expect(screen.getByText('Project B Member')).toBeInTheDocument());
		expect(
			screen.getByRole('switch', { name: /Notify me when people change things here/i })
		).toHaveAttribute('aria-checked', 'true');

		requireTestValue(projectAUpdate).response.resolve(
			jsonResponse({
				data: {
					settings: {
						project_id: PROJECT_A_ID,
						member_count: 1,
						is_shared_project: false,
						project_default_enabled: false,
						member_enabled: false,
						effective_enabled: false,
						member_overridden: true,
						can_manage_default: true
					}
				}
			})
		);
		await requireTestValue(projectAUpdate).response.promise;
		await Promise.resolve();
		await tick();

		expect(requests).toHaveLength(7);
		expect(
			screen.getByRole('switch', { name: /Notify me when people change things here/i })
		).toHaveAttribute('aria-checked', 'true');
	});
});

describe('ProjectCollaborationModal ownership handoff', () => {
	let ownershipBodies: unknown[];

	beforeEach(() => {
		ownershipBodies = [];
		toastSuccessMock.mockReset();
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
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.endsWith('/ownership')) {
					ownershipBodies.push(JSON.parse(String(init?.body)));
					return jsonResponse({
						success: true,
						data: {
							project_id: PROJECT_A_ID,
							new_owner_actor_id: 'actor-sam',
							previous_owner_left: true
						}
					});
				}
				if (url.endsWith('/members')) {
					return jsonResponse({
						data: {
							actorId: 'actor-dana',
							members: [
								{
									id: 'member-dana',
									actor_id: 'actor-dana',
									role_key: 'owner',
									access: 'admin',
									actor: {
										id: 'actor-dana',
										name: 'Dana',
										email: 'dana@example.com'
									}
								},
								{
									id: 'member-sam',
									actor_id: 'actor-sam',
									role_key: 'editor',
									access: 'write',
									actor: {
										id: 'actor-sam',
										name: 'Sam',
										email: 'sam@example.com'
									}
								}
							]
						}
					});
				}
				return responseFor(url, PROJECT_A_ID, 'Unused');
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('lets the owner hand the project off and leave', async () => {
		const onLeftProject = vi.fn();
		const onOwnershipChanged = vi.fn();
		render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: 'Garden plan',
				canManageMembers: true,
				onLeftProject,
				onOwnershipChanged
			}
		});

		// "Make owner…" lives in each person's role menu and opens a confirm under their row.
		await fireEvent.change(await screen.findByLabelText('Role for Sam'), {
			target: { value: 'make-owner' }
		});
		expect(await screen.findByText('Make Sam the owner of Garden plan?')).toBeInTheDocument();
		// The menu snaps back to their real role.
		expect(screen.getByLabelText('Role for Sam')).toHaveValue('editor');
		expect(screen.getByText(/You’ll stay on as an editor\./)).toBeInTheDocument();

		await fireEvent.click(
			screen.getByRole('checkbox', { name: 'Leave the project after handing it off' })
		);
		expect(screen.getByText(/You’ll leave the project and lose access\./)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Hand off and leave' }));

		await waitFor(() => expect(onLeftProject).toHaveBeenCalledTimes(1));
		expect(ownershipBodies).toEqual([{ member_id: 'member-sam', leave: true }]);
		expect(toastSuccessMock).toHaveBeenCalledWith(
			'Sam now owns Garden plan. You’ve left the project.'
		);
		// Leaving navigates away, so the page's permissions are not reloaded.
		expect(onOwnershipChanged).not.toHaveBeenCalled();
	});
});

describe('ProjectCollaborationModal owner sharing', () => {
	let calls: Array<{ url: string; method: string; body: unknown }>;

	beforeEach(() => {
		calls = [];
		toastSuccessMock.mockReset();
		copyTextMock.mockReset();
		copyTextMock.mockResolvedValue(true);
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
		const confirmSpy = vi.fn(() => true);
		vi.stubGlobal('confirm', confirmSpy);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? 'GET';
				calls.push({
					url,
					method,
					body: init?.body ? JSON.parse(String(init.body)) : null
				});
				if (url.endsWith('/invites') && method === 'POST') {
					return jsonResponse({
						success: true,
						data: {
							inviteId: 'invite-9',
							email_sent: true,
							invite_url: 'https://build-os.com/invites/abc123'
						}
					});
				}
				if (url.endsWith('/invite-link')) {
					return jsonResponse({ success: true, data: { link: null } });
				}
				if (url.includes('/members/member-sam') && method === 'DELETE') {
					return jsonResponse({ success: true, data: {} });
				}
				if (url.endsWith('/members')) {
					return jsonResponse({
						data: {
							actorId: 'actor-dana',
							members: [
								{
									id: 'member-dana',
									actor_id: 'actor-dana',
									role_key: 'owner',
									access: 'admin',
									actor: {
										id: 'actor-dana',
										name: 'Dana',
										email: 'dana@example.com'
									}
								},
								{
									id: 'member-sam',
									actor_id: 'actor-sam',
									role_key: 'viewer',
									access: 'read',
									agent_access: 'read',
									joined_via_invite_link_id: 'link-1',
									actor: {
										id: 'actor-sam',
										name: 'Sam',
										email: 'sam@example.com'
									}
								}
							]
						}
					});
				}
				return responseFor(url, PROJECT_A_ID, 'Unused');
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('shows owners one view: add people, everyone with access, and the invite link', async () => {
		render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: '9takes',
				canManageMembers: true
			}
		});

		expect(screen.queryByRole('tab')).toBeNull();
		expect(await screen.findByRole('heading', { name: 'Add people' })).toBeInTheDocument();
		expect(screen.getByLabelText('Email or @handle')).toBeInTheDocument();
		expect(await screen.findByText(/People with access · 2/)).toBeInTheDocument();
		// You first, then everyone else; the owner sees emails.
		expect(screen.getByText('(you)')).toBeInTheDocument();
		expect(screen.getByText(/sam@example\.com/)).toBeInTheDocument();
		expect(
			await screen.findByRole('button', { name: /Create invite link/ })
		).toBeInTheDocument();
	});

	it('offers the sent invite’s link to copy', async () => {
		render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: '9takes',
				canManageMembers: true
			}
		});

		await fireEvent.input(await screen.findByLabelText('Email or @handle'), {
			target: { value: 'lee@example.com' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

		expect(await screen.findByText('Invite sent to lee@example.com.')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /Copy invite link/ }));
		expect(copyTextMock).toHaveBeenCalledWith('https://build-os.com/invites/abc123');
	});

	it('marks people who joined by link and removes with an inline confirmation', async () => {
		render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: '9takes',
				canManageMembers: true
			}
		});

		expect(await screen.findByText(/Joined with the invite link/)).toBeInTheDocument();
		expect(screen.getByLabelText('Role for Sam')).toHaveValue('viewer');

		await fireEvent.change(screen.getByLabelText('Role for Sam'), {
			target: { value: 'remove' }
		});
		expect(
			await screen.findByText(/you get a request and decide whether they/)
		).toBeInTheDocument();
		expect(screen.getByLabelText('Role for Sam')).toHaveValue('viewer');
		const group = screen.getByRole('group', { name: 'Remove Sam' });
		await fireEvent.click(within(group).getByRole('button', { name: 'Remove' }));

		await waitFor(() =>
			expect(
				calls.some(
					(call) => call.method === 'DELETE' && call.url.endsWith('/members/member-sam')
				)
			).toBe(true)
		);
		expect(window.confirm).not.toHaveBeenCalled();
	});
});

describe('ProjectCollaborationModal editors’ agents setting', () => {
	let calls: Array<{ url: string; method: string; body: unknown }>;
	let patchResponse: Deferred<Response> | null;

	const SWITCH_NAME = 'Editors’ agents can make changes';
	const LIFTED_NOTE = /Their agents can make changes through the editors’ setting/;

	function failedResponse(status: number, payload: unknown): Response {
		return { ok: false, status, json: async () => payload } as Response;
	}

	beforeEach(() => {
		calls = [];
		patchResponse = null;
		toastSuccessMock.mockReset();
		toastErrorMock.mockReset();
		logOntologyClientErrorMock.mockReset();
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
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? 'GET';
				calls.push({
					url,
					method,
					body: init?.body ? JSON.parse(String(init.body)) : null
				});
				if (url.endsWith('/agent-settings') && method === 'PATCH') {
					patchResponse = deferred<Response>();
					return patchResponse.promise;
				}
				if (url.endsWith('/agent-settings')) {
					return jsonResponse({
						success: true,
						data: { editor_agents_write: false, external_agent_access: 'standard' }
					});
				}
				if (url.endsWith('/invite-link')) {
					return jsonResponse({ success: true, data: { link: null } });
				}
				if (url.endsWith('/members')) {
					return jsonResponse({
						data: {
							actorId: 'actor-dana',
							members: [
								{
									id: 'member-dana',
									actor_id: 'actor-dana',
									role_key: 'owner',
									access: 'admin',
									actor: {
										id: 'actor-dana',
										name: 'Dana',
										email: 'dana@example.com'
									}
								},
								{
									id: 'member-sam',
									actor_id: 'actor-sam',
									role_key: 'editor',
									access: 'write',
									agent_access: 'read',
									actor: {
										id: 'actor-sam',
										name: 'Sam',
										email: 'sam@example.com'
									}
								}
							]
						}
					});
				}
				return responseFor(url, PROJECT_A_ID, 'Unused');
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	async function openAsOwner() {
		render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: '9takes',
				canManageMembers: true
			}
		});
		return screen.findByRole('switch', { name: SWITCH_NAME });
	}

	it('loads the setting for the owner and saves a change', async () => {
		const toggle = await openAsOwner();
		expect(
			calls.some(
				(call) =>
					call.method === 'GET' &&
					call.url === `/api/onto/projects/${PROJECT_A_ID}/agent-settings`
			)
		).toBe(true);
		expect(toggle).toHaveAttribute('aria-checked', 'false');
		expect(toggle).toHaveAccessibleDescription(/unless you turned that person’s agents off/);
		expect(screen.queryByText(LIFTED_NOTE)).toBeNull();

		await fireEvent.click(toggle);
		// Optimistic: on before the save answers.
		expect(toggle).toHaveAttribute('aria-checked', 'true');
		expect(toggle).toBeDisabled();
		const patch = calls.find((call) => call.method === 'PATCH');
		expect(patch).toEqual({
			url: `/api/onto/projects/${PROJECT_A_ID}/agent-settings`,
			method: 'PATCH',
			body: { editor_agents_write: true }
		});

		requireTestValue(patchResponse).resolve(
			jsonResponse({ success: true, data: { editor_agents_write: true } })
		);
		await waitFor(() =>
			expect(toastSuccessMock).toHaveBeenCalledWith(
				'Editors’ agents can now make changes here'
			)
		);
		expect(toggle).toHaveAttribute('aria-checked', 'true');
		expect(toggle).toBeEnabled();
		// Sam's own setting stays Read; the row says the editors' setting lifts it.
		expect(screen.getByLabelText('What Sam’s agents can do')).toHaveValue('read');
		expect(screen.getByText(LIFTED_NOTE)).toBeInTheDocument();
	});

	it('puts the switch back and says why when the save fails', async () => {
		const toggle = await openAsOwner();

		await fireEvent.click(toggle);
		expect(toggle).toHaveAttribute('aria-checked', 'true');

		requireTestValue(patchResponse).resolve(
			failedResponse(403, { success: false, error: 'Only the owner can change this' })
		);
		await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
		expect(toastErrorMock).toHaveBeenCalledWith('Only the owner can change this');
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(screen.queryByText(LIFTED_NOTE)).toBeNull();
		expect(logOntologyClientErrorMock).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'project_agent_settings_update' })
		);
	});

	it('moves Restricted here: the owner turns it on with one switch', async () => {
		await openAsOwner();
		const restricted = await screen.findByRole('switch', {
			name: 'Only agents you pick can reach this project'
		});
		expect(restricted).toHaveAttribute('aria-checked', 'false');

		await fireEvent.click(restricted);

		expect(restricted).toHaveAttribute('aria-checked', 'true');
		await waitFor(() =>
			expect(calls.find((call) => call.url.endsWith('/external-agent-access'))).toEqual({
				url: `/api/onto/projects/${PROJECT_A_ID}/external-agent-access`,
				method: 'PATCH',
				body: { external_agent_access: 'restricted' }
			})
		);
	});

	it('shows a member their own agents, names only, and none of the owner controls', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				calls.push({ url, method: init?.method ?? 'GET', body: null });
				if (url.endsWith('/agent-settings')) {
					return jsonResponse({ success: true, data: { editor_agents_write: false } });
				}
				if (url.endsWith('/members')) {
					return jsonResponse({
						data: {
							actorId: 'actor-sam',
							members: [
								{
									id: 'member-dana',
									actor_id: 'actor-dana',
									role_key: 'owner',
									access: 'admin',
									handle: 'dana',
									actor: { id: 'actor-dana', name: 'Dana', email: null }
								},
								{
									id: 'member-sam',
									actor_id: 'actor-sam',
									role_key: 'editor',
									access: 'write',
									agent_access: 'read',
									actor: {
										id: 'actor-sam',
										name: 'Sam',
										email: 'sam@example.com'
									}
								}
							]
						}
					});
				}
				return responseFor(url, PROJECT_A_ID, 'Unused');
			})
		);
		render(ProjectCollaborationModal, {
			props: { isOpen: true, projectId: PROJECT_A_ID, projectName: '9takes' }
		});

		expect(await screen.findByText('Your agents here: Read')).toBeInTheDocument();
		expect(screen.getByText(/Dana set this\./)).toBeInTheDocument();
		expect(screen.getByText('Only Dana can add people to this project.')).toBeInTheDocument();
		expect(screen.getByText('@dana')).toBeInTheDocument();
		expect(screen.queryByRole('switch', { name: SWITCH_NAME })).toBeNull();
		expect(
			screen.queryByRole('switch', { name: 'Only agents you pick can reach this project' })
		).toBeNull();
		expect(screen.queryByLabelText('Email or @handle')).toBeNull();
		expect(screen.queryByLabelText(/Role for/)).toBeNull();
		expect(calls.some((call) => call.url.endsWith('/invites'))).toBe(false);
	});
});

describe('ProjectCollaborationModal unanswered invites', () => {
	let calls: Array<{ url: string; method: string }>;

	beforeEach(() => {
		calls = [];
		toastSuccessMock.mockReset();
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
		let cleared = false;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? 'GET';
				calls.push({ url, method });
				if (url.endsWith('/invites/clear-expired')) {
					cleared = true;
					return jsonResponse({ success: true, data: { cleared: 1 } });
				}
				if (url.endsWith('/invites')) {
					return jsonResponse({
						data: {
							invites: cleared
								? []
								: [
										{
											id: 'invite-beau',
											invitee_email: 'beau@example.com',
											role_key: 'editor',
											access: 'write',
											agent_access: 'read',
											status: 'pending',
											effective_status: 'expired',
											created_at: '2026-03-02T00:00:00.000Z',
											expires_at: '2026-03-09T00:00:00.000Z'
										}
									]
						}
					});
				}
				if (url.endsWith('/invite-link')) {
					return jsonResponse({ success: true, data: { link: null } });
				}
				return responseFor(url, PROJECT_A_ID, 'Dana');
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('labels expired invites and clears them in one step', async () => {
		render(ProjectCollaborationModal, {
			props: {
				isOpen: true,
				projectId: PROJECT_A_ID,
				projectName: 'Cadre',
				canManageMembers: true
			}
		});

		expect(await screen.findByText('Invited, no answer · 1')).toBeInTheDocument();
		expect(screen.getByText(/Expired/)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear expired (1)' }));

		await waitFor(() =>
			expect(toastSuccessMock).toHaveBeenCalledWith('Cleared 1 expired invite')
		);
		expect(
			calls.some(
				(call) =>
					call.method === 'POST' &&
					call.url === `/api/onto/projects/${PROJECT_A_ID}/invites/clear-expired`
			)
		).toBe(true);
		await waitFor(() => expect(screen.queryByText(/Invited, no answer/)).toBeNull());
	});
});
