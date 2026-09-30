// apps/web/src/routes/api/onto/projects/[id]/inherited-docs/copy/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const { projectId, parentId, documentId } = vi.hoisted(() => ({
	projectId: '11111111-1111-4111-8111-111111111111',
	parentId: '22222222-2222-4222-8222-222222222222',
	documentId: '33333333-3333-4333-8333-333333333333'
}));

vi.mock('$lib/server/ontology-api-access', () => ({
	requireOntologyActor: vi.fn(async () => ({ ok: true, actor: { actorId: 'actor' } })),
	requireCurrentActorProjectAccess: vi.fn(async () => ({ ok: true }))
}));
vi.mock('$lib/services/ontology/project-hierarchy.service', () => ({
	getProjectFamily: vi.fn(async () => ({
		parent: { id: parentId },
		shelf: [{ id: documentId }]
	})),
	hierarchyErrorApiCode: vi.fn(),
	toProjectHierarchyError: vi.fn()
}));
vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	addDocumentToTree: vi.fn(async () => undefined)
}));
vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(async () => undefined),
	toDocumentSnapshot: vi.fn(() => ({}))
}));
vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'form')
}));

async function copy(typeKey: string) {
	const inserted: Record<string, unknown>[] = [];
	const from = vi.fn(() => {
		const query: any = {};
		for (const method of ['select', 'eq', 'is']) query[method] = vi.fn(() => query);
		query.maybeSingle = vi.fn(async () => ({
			data: { title: 'Doc', description: null, content: 'Body', type_key: typeKey },
			error: null
		}));
		query.insert = vi.fn((row: Record<string, unknown>) => {
			inserted.push(row);
			query.single = vi.fn(async () => ({ data: { id: 'copy', ...row }, error: null }));
			return query;
		});
		return query;
	});
	const response = await POST({
		params: { id: projectId },
		locals: {
			safeGetSession: async () => ({ user: { id: 'user' } }),
			supabase: { from }
		},
		request: new Request('https://buildos.test/copy', {
			method: 'POST',
			body: JSON.stringify({ document_id: documentId })
		})
	} as never);
	return { status: response.status, typeKey: inserted[0]?.type_key };
}

describe('POST inherited-docs/copy', () => {
	it("turns the parent's START HERE and thinking log into ordinary documents", async () => {
		expect(await copy('document.context.project')).toEqual({
			status: 200,
			typeKey: 'document.default'
		});
		expect(await copy('document.context.thinking_log')).toEqual({
			status: 200,
			typeKey: 'document.default'
		});
	});
	it('keeps other document types', async () => {
		expect((await copy('document.spec')).typeKey).toBe('document.spec');
	});
});
