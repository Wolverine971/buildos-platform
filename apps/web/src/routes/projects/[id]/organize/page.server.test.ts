// apps/web/src/routes/projects/[id]/organize/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
import { loadOrganizeSnapshot } from '$lib/server/organize/organize-snapshot';
import { organizeFixtures } from '$lib/components/organize/organize-fixtures';
vi.mock('$lib/server/organize/organize-snapshot', () => ({
	loadOrganizeSnapshot: vi.fn(),
	OrganizeSnapshotError: class extends Error {}
}));
const projectId = 'a0000000-0000-4000-8000-000000000001';
const docId = 'd0000000-0000-4000-8000-000000000001';
const taskId = 'e0000000-0000-4000-8000-000000000001';
function event(search: string) {
	return {
		params: { id: projectId },
		url: new URL(`https://example.test/projects/${projectId}/organize${search}`),
		locals: { safeGetSession: async () => ({ user: { id: 'user' } }), supabase: {} }
	} as any;
}
beforeEach(() => {
	const project = organizeFixtures()[0]!;
	vi.mocked(loadOrganizeSnapshot).mockResolvedValue({
		project: {
			...project,
			id: projectId,
			documents: [{ ...project.documents[0]!, id: docId }],
			tasks: [{ ...project.tasks[0]!, id: taskId }]
		},
		related_projects: []
	});
});
describe('Organize single-item entry', () => {
	it.each([
		['document', docId],
		['task', taskId]
	])('focuses an authorized %s from the snapshot', async (kind, id) => {
		expect(await load(event(`?${kind}=${id}`))).toMatchObject({
			initialRef: { kind, id, project_id: projectId }
		});
	});
	it('rejects an item that is no longer in the authorized project', async () => {
		await expect(
			load(event('?document=d0000000-0000-4000-8000-000000000099'))
		).rejects.toMatchObject({ status: 404 });
	});
	it('rejects ambiguous or malformed item selectors without turning them into 500s', async () => {
		await expect(load(event(`?document=${docId}&task=${taskId}`))).rejects.toMatchObject({
			status: 400
		});
		await expect(load(event('?document=invalid'))).rejects.toMatchObject({ status: 400 });
	});
});
