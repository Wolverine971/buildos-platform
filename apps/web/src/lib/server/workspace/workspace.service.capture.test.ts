// apps/web/src/lib/server/workspace/workspace.service.capture.test.ts
// captureLooseItem: the note path honors the idempotency key the phone's offline queue sends.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	rpc: vi.fn(),
	logCreateAsync: vi.fn(),
	createOrMergeDocumentVersion: vi.fn(async () => undefined),
	addDocumentToTree: vi.fn(async () => undefined)
}));

vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureWorkspaceProjectId: vi.fn(async () => 'ws')
}));
vi.mock('$lib/services/ontology/instantiation.service', () => ({ instantiateProject: vi.fn() }));
vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	addDocumentToTree: mocks.addDocumentToTree,
	findNodeById: vi.fn()
}));
vi.mock('$lib/services/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: mocks.createOrMergeDocumentVersion,
	toDocumentSnapshot: vi.fn((doc: unknown) => doc)
}));
vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	prepareRelationshipMutationPlan: vi.fn(async () => ({}))
}));
vi.mock('$lib/services/async-activity-logger', () => ({ logCreateAsync: mocks.logCreateAsync }));
vi.mock('$lib/components/organize/organize-plan', () => ({ visibleDocumentTree: vi.fn() }));
vi.mock('$lib/components/organize/organize-api', () => ({ blockerMessage: vi.fn() }));
vi.mock('$lib/server/organize/organize-snapshot', () => ({ loadOrganizeSnapshot: vi.fn() }));
vi.mock('$lib/server/organize/organize-service', () => ({
	OrganizeError: class extends Error {},
	previewOrApplyOrganize: vi.fn(),
	undoOrganize: vi.fn()
}));

import { captureLooseItem } from './workspace.service';

const KEY = 'cap_m2abc123_xyz789';

function docRow(id: string, props: Record<string, unknown>) {
	return {
		id,
		project_id: 'ws',
		title: 'hello from the phone',
		type_key: 'document.note',
		content: 'hello from the phone',
		description: null,
		props,
		created_at: '2026-10-29T00:00:00Z',
		updated_at: '2026-10-29T00:00:00Z',
		deleted_at: null
	};
}

/** onto_documents only: records the lookup filters and the inserted rows. */
function makeSession(existing: ReturnType<typeof docRow> | null) {
	const inserts: Array<{ props: Record<string, unknown> }> = [];
	const filters: Array<[string, unknown]> = [];
	const session = {
		from: vi.fn((table: string) => {
			if (table !== 'onto_documents') throw new Error(`unexpected table ${table}`);
			return {
				select: () => {
					const lookup = {
						eq(column: string, value: unknown) {
							filters.push([column, value]);
							return lookup;
						},
						contains(column: string, value: unknown) {
							filters.push([column, value]);
							return lookup;
						},
						limit: () => lookup,
						maybeSingle: async () => ({ data: existing, error: null })
					};
					return lookup;
				},
				insert: (value: { props: Record<string, unknown> }) => {
					inserts.push(value);
					return {
						select: () => ({
							single: async () => ({
								data: docRow('doc-new', value.props),
								error: null
							})
						})
					};
				}
			};
		}),
		rpc: mocks.rpc
	};
	return { session, inserts, filters };
}

const capture = (idempotencyKey?: string) => ({
	kind: 'note' as const,
	text: 'hello from the phone',
	source: 'ios',
	idempotencyKey
});

describe('captureLooseItem note idempotency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the note already saved under the key instead of inserting a second one', async () => {
		const { session, inserts, filters } = makeSession(
			docRow('doc-existing', { body_markdown: 'hello from the phone', idempotency_key: KEY })
		);

		const result = await captureLooseItem({
			session: session as never,
			userId: 'user-1',
			actorId: 'actor-1',
			capture: capture(KEY)
		});

		expect(result).toMatchObject({
			workspaceId: 'ws',
			item: { id: 'doc-existing', kind: 'note' }
		});
		expect(inserts).toHaveLength(0);
		expect(filters).toEqual([
			['project_id', 'ws'],
			['props', { idempotency_key: KEY }]
		]);
		expect(mocks.logCreateAsync).not.toHaveBeenCalled();
	});

	it('stores the key in props on the first send so a later retry can find it', async () => {
		const { session, inserts } = makeSession(null);

		const result = await captureLooseItem({
			session: session as never,
			userId: 'user-1',
			actorId: 'actor-1',
			capture: capture(KEY)
		});

		expect(result.item.id).toBe('doc-new');
		expect(inserts[0]?.props).toMatchObject({ captured_via: 'ios', idempotency_key: KEY });
		expect(mocks.logCreateAsync).toHaveBeenCalledTimes(1);
	});

	it('skips the lookup and stores no key when the caller sends none (web quick capture)', async () => {
		const { session, inserts, filters } = makeSession(null);

		await captureLooseItem({
			session: session as never,
			userId: 'user-1',
			actorId: 'actor-1',
			capture: capture()
		});

		expect(filters).toEqual([]);
		expect(inserts[0]?.props).not.toHaveProperty('idempotency_key');
	});
});
