// apps/web/src/lib/components/project/ProjectInviteLinkPanel.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectInviteLinkPanel from './ProjectInviteLinkPanel.svelte';

const { copyMock, toastSuccessMock } = vi.hoisted(() => ({
	copyMock: vi.fn(),
	toastSuccessMock: vi.fn()
}));

vi.mock('$lib/utils/public-page-url', () => ({ copyTextToClipboard: copyMock }));
vi.mock('$lib/utils/ontology-client-logger', () => ({ logOntologyClientError: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: toastSuccessMock, error: vi.fn(), info: vi.fn() }
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const URL_A = 'https://build-os.com/join/AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const URL_B = 'https://build-os.com/join/ZyXwVuTsRqPoNmLkJiHgFeDcBa543210';

function link(overrides: Record<string, unknown> = {}) {
	return {
		id: 'link-1',
		role_key: 'viewer',
		agent_access: 'read',
		expires_at: '2026-10-30T12:00:00.000Z',
		expired: false,
		join_count: 0,
		last_joined_at: null,
		url: URL_A,
		...overrides
	};
}

function json(payload: unknown, status = 200) {
	return { ok: status < 400, status, json: async () => payload } as Response;
}

let calls: Array<{ url: string; method: string; body: unknown }>;
let serverLink: Record<string, unknown> | null;

beforeEach(() => {
	calls = [];
	serverLink = null;
	copyMock.mockReset();
	copyMock.mockResolvedValue(true);
	toastSuccessMock.mockReset();
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
			const method = init?.method ?? 'GET';
			const body = init?.body ? JSON.parse(String(init.body)) : null;
			calls.push({ url: String(input), method, body });
			if (method === 'POST') {
				serverLink = link({
					role_key: body.role_key,
					agent_access: body.agent_access,
					url: serverLink ? URL_B : URL_A
				});
				return json({ success: true, data: { link: serverLink } });
			}
			if (method === 'PATCH') {
				serverLink = link({ ...serverLink, ...body });
				return json({ success: true, data: { link: serverLink } });
			}
			if (method === 'DELETE') {
				serverLink = null;
				return json({ success: true, data: { link: null, turned_off: true } });
			}
			return json({ success: true, data: { link: serverLink } });
		})
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('ProjectInviteLinkPanel', () => {
	it('creates a Viewer link with agents on Read by default, then copies it', async () => {
		render(ProjectInviteLinkPanel, { props: { projectId: PROJECT_ID, projectName: '9takes' } });

		const create = await screen.findByRole('button', { name: /Create invite link/ });
		expect(screen.getByLabelText('They join as')).toHaveValue('viewer');
		expect(screen.getByLabelText('Their agents')).toHaveValue('read');
		expect(screen.getByLabelText('Link works for')).toHaveValue('7');
		expect(
			screen.getByText(/Anyone with this link can join as a viewer until/)
		).toBeInTheDocument();

		await fireEvent.click(create);
		await waitFor(() =>
			expect(screen.getByLabelText('Invite link for 9takes')).toHaveValue(URL_A)
		);
		expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
			role_key: 'viewer',
			agent_access: 'read',
			expires_in_days: 7
		});
		// The QR code is drawn right away, from the link.
		expect(
			screen.getAllByRole('img', { name: 'QR code to join 9takes' }).length
		).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: /Copy link/ }));
		expect(copyMock).toHaveBeenCalledWith(URL_A);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Copied/ })).toBeInTheDocument()
		);
	});

	it('warns before an Editor link and never offers agent Write to viewers', async () => {
		render(ProjectInviteLinkPanel, { props: { projectId: PROJECT_ID, projectName: '9takes' } });
		const role = await screen.findByLabelText('They join as');
		const writeOption = screen.getByRole('option', { name: /Write \(Editors only\)/ });
		expect(writeOption).toBeDisabled();

		await fireEvent.change(role, { target: { value: 'editor' } });
		expect(
			screen.getByText(/Anyone with an Editor link can change the project/)
		).toBeInTheDocument();
	});

	it('resets and turns off with an inline confirmation', async () => {
		serverLink = link({ join_count: 2 });
		render(ProjectInviteLinkPanel, { props: { projectId: PROJECT_ID, projectName: '9takes' } });
		expect(await screen.findByText('2 people joined with this link.')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /Reset link/ }));
		expect(screen.getByText(/The current one stops working right away/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Make a new link' }));
		await waitFor(() =>
			expect(screen.getByLabelText('Invite link for 9takes')).toHaveValue(URL_B)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
		expect(screen.getByText(/People who already joined stay in 9takes/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Turn off link' }));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Create invite link/ })).toBeInTheDocument()
		);
		expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
	});

	it('changes who the same link lets in', async () => {
		serverLink = link();
		render(ProjectInviteLinkPanel, { props: { projectId: PROJECT_ID, projectName: '9takes' } });
		const role = await screen.findByLabelText('They join as');
		await fireEvent.change(role, { target: { value: 'editor' } });
		await waitFor(() =>
			expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
				role_key: 'editor',
				agent_access: 'read'
			})
		);
		await waitFor(() =>
			expect(
				screen.getByText(/Anyone with this link can join as an editor/)
			).toBeInTheDocument()
		);
		expect(screen.getByLabelText('Invite link for 9takes')).toHaveValue(URL_A);
	});
});
