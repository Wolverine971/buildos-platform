// apps/web/src/lib/components/people/PeopleRequests.test.ts
// (Moved from the old /people page; the request cards now live in Profile > People & agents.)
// @vitest-environment jsdom
import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const { toastSuccessMock, toastWarningMock } = vi.hoisted(() => ({
	toastSuccessMock: vi.fn(),
	toastWarningMock: vi.fn()
}));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: toastSuccessMock, error: vi.fn(), warning: toastWarningMock }
}));

import PeopleRequests from './PeopleRequests.svelte';
import { readPeopleRequests } from '$lib/components/people/people-types';

const rejoin = {
	id: 'req-1',
	created_at: '2026-10-23T12:00:00.000Z',
	expires_at: '2026-11-06T12:00:00.000Z',
	kind: 'rejoin',
	role_requested: 'viewer',
	agent_access_requested: 'read',
	project_hint: '9takes',
	project: { id: 'project-1', name: '9takes' },
	note: null,
	via: 'web',
	via_agent_label: null,
	from: { name: 'Sam Rivera', handle: 'sam', email: null }
};

function page(incoming: unknown[] = [rejoin]) {
	return {
		requests: readPeopleRequests({ incoming, outgoing: [] }),
		ownedProjects: [{ id: 'project-1', name: '9takes' }]
	} as any;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	toastSuccessMock.mockReset();
	toastWarningMock.mockReset();
});

describe('PeopleRequests: rejoin requests', () => {
	it('reads a rejoin request with its project', () => {
		const [request] = readPeopleRequests({ incoming: [rejoin], outgoing: [] }).incoming;
		expect(request).toMatchObject({
			kind: 'rejoin',
			project: { id: 'project-1', name: '9takes' },
			agent_access_requested: 'read'
		});
	});

	it('lets a former member back into the one project with the link’s role and agents', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, data: { status: 'approved' } })
		});
		vi.stubGlobal('fetch', fetchMock);
		render(PeopleRequests, { props: page() });

		expect(screen.getByText(/Wants to rejoin/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Choose what to share' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Let back in' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const call = fetchMock.mock.calls[0];
		assert.isDefined(call, 'Expected the decision request to be sent');
		const [url, init] = call;
		expect(url).toBe('/api/people/requests/req-1/decide');
		expect(JSON.parse(init.body)).toEqual({
			decision: 'approve',
			grants: [{ project_id: 'project-1', role: 'viewer', agent_access: 'read' }]
		});
		await waitFor(() =>
			expect(toastSuccessMock).toHaveBeenCalledWith('Sam Rivera is back in 9takes')
		);
	});

	it('warns that a deny is final before sending it', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, data: { status: 'declined' } })
		});
		vi.stubGlobal('fetch', fetchMock);
		render(PeopleRequests, { props: page() });

		await fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
		expect(screen.getByText(/can’t ask to rejoin 9takes again/)).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
		await waitFor(() =>
			expect(sentBody(fetchMock)).toEqual({
				decision: 'decline',
				grants: []
			})
		);
	});
});

const upgradeItem = (overrides: Record<string, unknown>) => ({
	project_id: 'project-1',
	project_name: '9takes',
	need: 'agents_write',
	role: 'editor',
	agent_access: 'read',
	editor_agents_write: false,
	...overrides
});

const upgrade = {
	id: 'req-2',
	created_at: '2026-10-23T12:00:00.000Z',
	expires_at: '2026-10-30T12:00:00.000Z',
	kind: 'upgrade',
	role_requested: 'editor',
	agent_access_requested: 'write',
	project_hint: null,
	project: { id: 'project-1', name: '9takes' },
	items: [upgradeItem({})],
	note: 'Need to update the launch task',
	via: 'agent',
	via_agent_label: 'Claude',
	from: { name: 'Sam Rivera', handle: 'sam', email: null }
};

const batchUpgrade = {
	...upgrade,
	id: 'req-3',
	items: [
		upgradeItem({}),
		upgradeItem({
			project_id: 'project-2',
			project_name: 'Garden',
			need: 'edit',
			role: 'viewer',
			agent_access: 'off'
		}),
		upgradeItem({
			project_id: 'project-3',
			project_name: 'Launch',
			need: 'agents_read',
			role: 'viewer',
			agent_access: 'off'
		})
	]
};

function decideFetch(data: Record<string, unknown>) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({ success: true, data })
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) => {
	const call = fetchMock.mock.calls[0];
	assert.isDefined(call, 'Expected the decision request to be sent');
	return JSON.parse(call[1].body);
};

describe('PeopleRequests: upgrade requests', () => {
	it('shows what the member asks for, what they have now, and who sent it', () => {
		decideFetch({});
		render(PeopleRequests, { props: page([upgrade]) });

		expect(screen.getByText(/Wants their agents to make changes in/)).toBeInTheDocument();
		expect(screen.getByText('Now: Editor · agents Read')).toBeInTheDocument();
		expect(
			screen.getByText(
				/Their agents only add tasks and documents, and change what Sam Rivera/
			)
		).toBeInTheDocument();
		expect(screen.getByText(/Need to update the launch task/)).toBeInTheDocument();
		expect(screen.getByText(/Sent by Claude for Sam Rivera/)).toBeInTheDocument();
		expect(
			screen.getByRole('checkbox', {
				name: 'Let every editor’s agents make changes in 9takes'
			})
		).not.toBeChecked();
		expect(screen.getByText(/Editors won’t need to ask/)).toBeInTheDocument();
		// No sheet to fill in and no block for a member asking for more.
		expect(screen.queryByRole('button', { name: 'Choose what to share' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
	});

	it('allows the one project with a tap', async () => {
		const fetchMock = decideFetch({
			status: 'approved',
			kind: 'upgrade',
			projects: [
				{
					project_id: 'project-1',
					role: 'editor',
					agent_access: 'write',
					need: 'agents_write'
				}
			],
			agent_grant: 'granted',
			standing_approval: 'none'
		});
		render(PeopleRequests, { props: page([upgrade]) });

		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/people/requests/req-2/decide',
			expect.any(Object)
		);
		expect(sentBody(fetchMock)).toEqual({
			decision: 'approve',
			items: [{ project_id: 'project-1', need: 'agents_write', allow: true }]
		});
		await waitFor(() =>
			expect(toastSuccessMock).toHaveBeenCalledWith(
				'Sam Rivera’s agents can now make changes in 9takes'
			)
		);
		expect(toastWarningMock).not.toHaveBeenCalled();
		expect(screen.queryByText(/Wants their agents to make changes in/)).toBeNull();
	});

	it('sends the standing approval when ticked, and warns when it didn’t save', async () => {
		const fetchMock = decideFetch({
			status: 'approved',
			kind: 'upgrade',
			projects: [{ project_id: 'project-1' }],
			agent_grant: 'failed',
			standing_approval: 'failed'
		});
		render(PeopleRequests, { props: page([upgrade]) });

		await fireEvent.click(
			screen.getByRole('checkbox', {
				name: 'Let every editor’s agents make changes in 9takes'
			})
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(sentBody(fetchMock)).toEqual({
			decision: 'approve',
			items: [{ project_id: 'project-1', need: 'agents_write', allow: true }],
			editor_agents_write_project_ids: ['project-1']
		});
		await waitFor(() =>
			expect(toastWarningMock).toHaveBeenCalledWith(
				'Allowed, but the editors setting didn’t save. Try it in the project’s Share window.'
			)
		);
		expect(toastWarningMock).toHaveBeenCalledWith(
			expect.stringContaining('Sam Rivera’s agent couldn’t be connected to it yet')
		);
	});

	it('lists each project in a batch and sends only the checked ones', async () => {
		const fetchMock = decideFetch({
			status: 'approved',
			kind: 'upgrade',
			projects: [{ project_id: 'project-1' }, { project_id: 'project-3' }],
			agent_grant: 'granted',
			standing_approval: 'saved'
		});
		render(PeopleRequests, { props: page([batchUpgrade]) });

		const garden = screen.getByRole('checkbox', {
			name: 'Wants to edit Garden with their agents'
		});
		expect(garden).toBeChecked();
		expect(
			screen.getByText('Now: Viewer · agents Off', {
				selector: '#upgrade-now-req-3-project-2'
			})
		).toBeInTheDocument();
		expect(
			screen.getByRole('checkbox', { name: 'Wants their agents to see Launch' })
		).toBeChecked();

		await fireEvent.click(garden);
		await fireEvent.click(
			screen.getByRole('checkbox', {
				name: 'Let every editor’s agents make changes in these projects'
			})
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		// Every item goes back as shown; Garden was unchecked, so the standing approval
		// only reaches 9takes.
		expect(sentBody(fetchMock)).toEqual({
			decision: 'approve',
			items: [
				{ project_id: 'project-1', need: 'agents_write', allow: true },
				{ project_id: 'project-2', need: 'edit', allow: false },
				{ project_id: 'project-3', need: 'agents_read', allow: true }
			],
			editor_agents_write_project_ids: ['project-1']
		});
		await waitFor(() =>
			expect(toastSuccessMock).toHaveBeenCalledWith(
				'Allowed. Sam Rivera has what they asked for in 2 projects'
			)
		);
	});

	it('turns Allow off when nothing is checked', async () => {
		decideFetch({});
		render(PeopleRequests, { props: page([batchUpgrade]) });

		for (const name of [
			'Wants their agents to make changes in 9takes',
			'Wants to edit Garden with their agents',
			'Wants their agents to see Launch'
		]) {
			await fireEvent.click(screen.getByRole('checkbox', { name }));
		}
		expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
		expect(
			screen.getByRole('checkbox', {
				name: 'Let every editor’s agents make changes in these projects'
			})
		).toBeDisabled();
	});

	it('says not now without a confirm step, and that they can ask again in a week', async () => {
		const fetchMock = decideFetch({ status: 'declined' });
		render(PeopleRequests, { props: page([upgrade]) });

		await fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(sentBody(fetchMock)).toEqual({ decision: 'decline' });
		await waitFor(() =>
			expect(toastSuccessMock).toHaveBeenCalledWith(
				'Not now. Sam Rivera can ask again in a week.'
			)
		);
	});

	it('reloads the card instead of approving when the request changed meanwhile', async () => {
		const changed = {
			...upgrade,
			items: [upgradeItem({ need: 'edit', role: 'viewer', agent_access: 'off' })]
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 409,
				json: async () => ({ success: false, error: 'This request changed.' })
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ success: true, data: { incoming: [changed], outgoing: [] } })
			});
		vi.stubGlobal('fetch', fetchMock);
		render(PeopleRequests, { props: page([upgrade]) });

		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Sam Rivera changed this request. Look again before you allow it.'
		);
		expect(fetchMock).toHaveBeenCalledWith('/api/people/requests', expect.any(Object));
		expect(await screen.findByText(/Wants to edit/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled();
		expect(toastSuccessMock).not.toHaveBeenCalled();
	});

	it('keeps the card and shows the error when the decision fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ success: false, error: 'This request was already answered' })
			})
		);
		render(PeopleRequests, { props: page([upgrade]) });

		await fireEvent.click(screen.getByRole('button', { name: 'Allow' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'This request was already answered'
		);
		expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled();
		expect(toastSuccessMock).not.toHaveBeenCalled();
	});
});
