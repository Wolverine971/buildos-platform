// apps/web/src/routes/people/page.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const { toastSuccessMock } = vi.hoisted(() => ({ toastSuccessMock: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: toastSuccessMock, error: vi.fn(), warning: vi.fn() }
}));

import PeoplePage from './+page.svelte';
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

function page() {
	return {
		data: {
			requests: readPeopleRequests({ incoming: [rejoin], outgoing: [] }),
			profile: {
				username: 'djwayne',
				discoverability: 'handle',
				accepts_agent_requests: true
			},
			ownedProjects: [{ id: 'project-1', name: '9takes' }],
			sharedWithYou: [],
			loadError: null
		}
	} as any;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	toastSuccessMock.mockReset();
});

describe('/people rejoin requests', () => {
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
		render(PeoplePage, { props: page() });

		expect(screen.getByText(/Wants to rejoin/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Choose what to share' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Let back in' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const [url, init] = fetchMock.mock.calls[0];
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
		render(PeoplePage, { props: page() });

		await fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
		expect(screen.getByText(/can’t ask to rejoin 9takes again/)).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
		await waitFor(() =>
			expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
				decision: 'decline',
				grants: []
			})
		);
	});
});
