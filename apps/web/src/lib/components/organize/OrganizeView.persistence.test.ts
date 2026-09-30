// apps/web/src/lib/components/organize/OrganizeView.persistence.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizeView from './OrganizeView.svelte';
import { organizeFixtures } from './organize-fixtures';
import { previewOrganizePlan, type OrganizeMove } from './organize-plan';
import type { OrganizeImpact, OrganizeReceipt, OrganizeBatch } from './organize-api';

const nav = vi.hoisted(() => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
const toast = vi.hoisted(() => ({ add: vi.fn(), error: vi.fn() }));
vi.mock('$app/navigation', () => nav);
vi.mock('$lib/stores/toast.store', () => ({ toastService: toast }));
const token = 'a'.repeat(32);
const impact: OrganizeImpact = {
	source_project_id: 'source',
	destination_project_id: 'dest',
	blockers: [],
	items: 2,
	relationships_to_detach: 2,
	assignees_to_remove: 1,
	finished_proposals_to_remove: 0,
	task_links_to_clear: 0,
	events_to_rebuild: 0,
	tasks_to_reconcile: 0,
	assets_to_move: 1,
	comments_to_move: 2,
	public_pages_to_move: 1,
	relationships_to_move: 1
};
const preview = {
	confirmation_token: token,
	impact: [impact],
	// The forward-preview RPC omits skipped; the client normalizes it to [].
	manifest: [{ id: 'brief', kind: 'document' }]
};
const respond = (data: unknown, status = 200) =>
	new Response(JSON.stringify(status === 200 ? { data } : { error: data }), { status });
let projects = organizeFixtures();
let batches: OrganizeBatch[] = [];
let requests: { path: string; body: any }[] = [];
let handler: (path: string, body: any) => Response | Promise<Response>;
function receipt(body: any, inverse: string | null = null): OrganizeReceipt {
	return {
		status: 'applied',
		batch_id: body.batch_id,
		inverse_of: inverse,
		operations: 1,
		impact: [impact],
		skipped: [],
		restoration: {},
		calendar_sync: 'not_needed',
		replayed: false
	};
}
async function defaultHandler(path: string, body: any): Promise<Response> {
	if (path.endsWith('/preview')) return respond(preview);
	if (path.endsWith('/apply') || (path.endsWith('/undo') && body.confirmation_token)) {
		projects = path.endsWith('/apply')
			? previewOrganizePlan(projects, body.moves as OrganizeMove[]).projects
			: organizeFixtures();
		projects = projects.map((p) => ({ ...p, updated_at: '2026-09-30T13:00:00Z' }));
		const saved = receipt(body, body.source_batch_id ?? null);
		batches.unshift({
			id: saved.batch_id,
			inverse_of: saved.inverse_of,
			receipt: saved,
			created_at: '2026-09-30T13:00:00Z'
		});
		return respond(saved);
	}
	if (path.endsWith('/undo')) return respond(preview);
	if (path.includes('/snapshot?'))
		return respond({
			project: projects.find(
				(p) => p.id === new URL(path, 'http://test').searchParams.get('project_id')
			)
		});
	if (path.includes('/history?')) return respond({ batches });
	throw new Error(`Unexpected request: ${path}`);
}
function setup(initialRef = false) {
	const [project, secondaryProject] = organizeFixtures();
	return render(OrganizeView, {
		project: project!,
		secondaryProject,
		...(initialRef
			? { initialRef: { kind: 'document' as const, id: 'brief', project_id: 'source' } }
			: {})
	});
}
async function stage() {
	await fireEvent.keyDown(screen.getByRole('button', { name: 'Brief', exact: true }), {
		key: ' '
	});
	await fireEvent.keyDown(window, { key: 'ArrowRight' });
	await fireEvent.keyDown(window, { key: 'Enter' });
}
async function reviewPlan() {
	await stage();
	await fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
	return screen.findByRole('button', { name: 'Apply changes' });
}
async function save() {
	await fireEvent.click(await reviewPlan());
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Undo saved moves' })).toBeEnabled()
	);
}
beforeEach(() => {
	vi.clearAllMocks();
	projects = organizeFixtures();
	requests = [];
	batches = [];
	handler = defaultHandler;
	vi.stubGlobal('scrollTo', vi.fn());
	vi.stubGlobal(
		'fetch',
		vi.fn(async (path: string, init?: RequestInit) => {
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			requests.push({ path, body });
			return handler(path, body);
		})
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Organize persistence', () => {
	it('reviews authoritative impact, saves once, refreshes both panes and offers a persisted Undo toast', async () => {
		setup();
		const apply = await reviewPlan();
		expect(screen.getByText('2 relationships unlinked')).toBeInTheDocument();
		expect(screen.getByText('1 assignee removed')).toBeInTheDocument();
		expect(screen.getByText('1 published page keeps its URL')).toBeInTheDocument();
		expect(requests.some((r) => r.path.endsWith('/apply'))).toBe(false);
		await fireEvent.click(apply);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Undo saved moves' })).toBeEnabled()
		);
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
		expect(
			within(screen.getByRole('region', { name: 'Business' })).getByRole('button', {
				name: 'Brief',
				exact: true
			})
		).toBeInTheDocument();
		const written = requests.filter((r) => r.path.endsWith('/apply'));
		expect(written).toHaveLength(1);
		expect(written[0]!.body).toMatchObject({
			confirmation_token: token,
			project_versions: { source: '2026-09-30T12:00:00Z', dest: '2026-09-30T12:00:00Z' }
		});
		expect(written[0]!.body.batch_id).toMatch(/^[a-f0-9-]{36}$/);
		expect(written[0]!.body).not.toHaveProperty('trees');
		expect(toast.add).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Applied 1 move',
				action: expect.objectContaining({ label: 'Undo' })
			})
		);
		toast.add.mock.calls[0]![0].action.onClick();
		await fireEvent.click(await screen.findByRole('button', { name: 'Apply undo' }));
		await waitFor(() => expect(screen.getByText('Reversed 1 move')).toBeInTheDocument());
		expect(
			requests.find((r) => r.path.endsWith('/undo') && r.body.confirmation_token)?.body
				.source_batch_id
		).toBe(written[0]!.body.batch_id);
	});
	it('shows rollout blockers and never enables Apply for that preview', async () => {
		handler = (path, body) =>
			path.endsWith('/preview')
				? respond({
						...preview,
						impact: [{ ...impact, blockers: ['calendar_sync_not_deployed'] }]
					})
				: defaultHandler(path, body);
		setup();
		const apply = await reviewPlan();
		expect(apply).toBeDisabled();
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Moving scheduled tasks is not available yet'
		);
		await fireEvent.click(apply);
		expect(requests.filter((r) => r.path.endsWith('/apply'))).toHaveLength(0);
	});
	it('retries a lost response with the identical token, moves and batch ID', async () => {
		let writes = 0;
		handler = (path, body) => {
			if (path.endsWith('/apply') && ++writes === 1) throw new TypeError('Network lost');
			return defaultHandler(path, body);
		};
		setup();
		await fireEvent.click(await reviewPlan());
		expect(await screen.findByRole('button', { name: 'Retry save' })).toBeEnabled();
		expect(screen.getByRole('button', { name: 'Back to plan' })).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
		await waitFor(() => expect(screen.getByText('Applied 1 move')).toBeInTheDocument());
		const writesSent = requests.filter((r) => r.path.endsWith('/apply'));
		expect(writesSent).toHaveLength(2);
		expect(writesSent[1]!.body).toEqual(writesSent[0]!.body);
	});
	it('rebuilds a stale preview with refreshed versions before allowing another apply', async () => {
		let writes = 0;
		handler = (path, body) => {
			if (path.endsWith('/apply') && ++writes === 1) {
				projects = projects.map((p) => ({ ...p, updated_at: '2026-09-30T14:00:00Z' }));
				return respond(
					'The projects or move impact changed. Preview again before applying.',
					409
				);
			}
			return defaultHandler(path, body);
		};
		setup();
		await fireEvent.click(await reviewPlan());
		await fireEvent.click(await screen.findByRole('button', { name: 'Refresh and review' }));
		const apply = await screen.findByRole('button', { name: 'Apply changes' });
		expect(
			requests.filter((r) => r.path.endsWith('/preview')).at(-1)!.body.project_versions.source
		).toBe('2026-09-30T14:00:00Z');
		await fireEvent.click(apply);
		await waitFor(() => expect(screen.getByText('Applied 1 move')).toBeInTheDocument());
	});
	it('keeps a confirmed save successful when the pane refresh fails', async () => {
		handler = (path, body) =>
			path.includes('/snapshot?')
				? respond('Refresh unavailable', 503)
				: defaultHandler(path, body);
		setup();
		await fireEvent.click(await reviewPlan());
		await screen.findByText(
			'Changes are saved. Refresh the projects to see their current contents.'
		);
		expect(screen.getByText('0 pending moves')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
		expect(requests.filter((r) => r.path.endsWith('/apply'))).toHaveLength(1);
		handler = defaultHandler;
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Refresh projects' })).toBeEnabled()
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Undo saved moves' })).toBeEnabled()
		);
	});
	it('loads persisted history and reviews skip reasons before applying a partial undo', async () => {
		const saved = receipt({ batch_id: 'old-batch' });
		batches = [
			{
				id: saved.batch_id,
				inverse_of: null,
				receipt: saved,
				created_at: '2026-09-30T12:00:00Z'
			}
		];
		handler = (path, body) =>
			path.endsWith('/undo') && !body.confirmation_token
				? respond({
						...preview,
						skipped: [
							{
								id: 'task',
								kind: 'task',
								reason: 'The task is no longer where this batch left it.'
							}
						]
					})
				: defaultHandler(path, body);
		setup();
		await fireEvent.click(screen.getByRole('button', { name: 'History' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Undo batch' }));
		expect(await screen.findByText('1 skipped')).toBeInTheDocument();
		expect(screen.getByText(/Send proposal — The task is no longer/)).toBeInTheDocument();
		expect(
			requests.filter((r) => r.path.endsWith('/undo') && r.body.confirmation_token)
		).toHaveLength(0);
		await fireEvent.click(screen.getByRole('button', { name: 'Apply undo' }));
		await waitFor(() => expect(screen.getByText('Reversed 1 move')).toBeInTheDocument());
	});
	it('does not let history Undo replace a staged plan', async () => {
		const saved = receipt({ batch_id: 'old-batch' });
		batches = [
			{
				id: saved.batch_id,
				inverse_of: null,
				receipt: saved,
				created_at: '2026-09-30T12:00:00Z'
			}
		];
		setup();
		await stage();
		await fireEvent.click(screen.getByRole('button', { name: 'History' }));
		expect(await screen.findByRole('button', { name: 'Undo batch' })).toBeDisabled();
	});
	it('opens the destination sheet for a focused single-item entry', async () => {
		setup(true);
		expect(await screen.findByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
		expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('dest');
		expect(requests).toHaveLength(0);
	});
	it('supports the command-enter review shortcut without saving immediately', async () => {
		setup();
		await stage();
		await fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
		expect(await screen.findByRole('button', { name: 'Apply changes' })).toBeEnabled();
		expect(requests.map((r) => r.path)).toEqual(['/api/onto/organize/preview']);
	});
});
