// apps/web/src/lib/components/project/ProjectCollaborationModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectCollaborationModal from './ProjectCollaborationModal.svelte';

const { logOntologyClientErrorMock } = vi.hoisted(() => ({
	logOntologyClientErrorMock: vi.fn()
}));

vi.mock('$lib/utils/ontology-client-logger', () => ({
	logOntologyClientError: logOntologyClientErrorMock
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
		expect(screen.getByText('Loading members...')).toBeInTheDocument();

		for (const request of projectARequests) {
			request.response.resolve(
				request.url.endsWith('/members')
					? jsonResponse(null, new Error('stale project failure'))
					: responseFor(request.url, PROJECT_A_ID, 'Project A Member')
			);
		}
		await settleRequests(projectARequests);

		expect(screen.getByText('Loading members...')).toBeInTheDocument();
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
		await fireEvent.click(screen.getByRole('tab', { name: 'My Role' }));

		const notificationToggle = await screen.findByRole('checkbox', {
			name: /Notify me about project activity/i
		});
		expect(notificationToggle).toBeChecked();
		await fireEvent.click(notificationToggle);
		await waitFor(() => expect(requests).toHaveLength(4));
		const projectAUpdate = requests[3];
		expect(projectAUpdate.url).toBe(`/api/onto/projects/${PROJECT_A_ID}/notification-settings`);

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
		await fireEvent.click(screen.getByRole('tab', { name: 'My Role' }));
		expect(
			screen.getByRole('checkbox', { name: /Notify me about project activity/i })
		).toBeChecked();

		projectAUpdate.response.resolve(
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
		await projectAUpdate.response.promise;
		await Promise.resolve();
		await tick();

		expect(requests).toHaveLength(7);
		expect(
			screen.getByRole('checkbox', { name: /Notify me about project activity/i })
		).toBeChecked();
	});
});
