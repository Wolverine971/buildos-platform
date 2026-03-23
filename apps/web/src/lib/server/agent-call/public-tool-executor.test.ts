// apps/web/src/lib/server/agent-call/public-tool-executor.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureActorIdMock = vi.fn();
const fetchProjectSummariesMock = vi.fn();

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSummaries: fetchProjectSummariesMock
}));

type DocumentRow = {
	id: string;
	project_id: string;
	title: string;
	content: string;
	state_key: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
};

class OntoDocumentsQueryBuilderMock {
	private idFilter: string | null = null;
	private projectIdsFilter: string[] | null = null;
	private deletedAtFilterApplied = false;

	constructor(private readonly documents: DocumentRow[]) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}

		return this;
	}

	in(field: string, value: unknown) {
		if (field === 'project_id' && Array.isArray(value)) {
			this.projectIdsFilter = value.filter(
				(entry): entry is string => typeof entry === 'string'
			);
		}

		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'deleted_at' && value === null) {
			this.deletedAtFilterApplied = true;
		}

		return this;
	}

	maybeSingle() {
		const row =
			this.documents.find((document) => {
				if (this.idFilter !== null && document.id !== this.idFilter) {
					return false;
				}

				if (
					this.projectIdsFilter !== null &&
					!this.projectIdsFilter.includes(document.project_id)
				) {
					return false;
				}

				if (this.deletedAtFilterApplied && document.deleted_at !== null) {
					return false;
				}

				return true;
			}) ?? null;

		return Promise.resolve({
			data: row
				? {
						id: row.id,
						project_id: row.project_id,
						title: row.title,
						content: row.content,
						state_key: row.state_key,
						created_at: row.created_at,
						updated_at: row.updated_at
					}
				: null,
			error: null
		});
	}
}

function createAdminMock(documents: DocumentRow[]) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_documents') {
				return new OntoDocumentsQueryBuilderMock(documents);
			}

			throw new Error(`Unexpected table ${table}`);
		})
	};
}

describe('executeBuildosAgentPublicTool', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue('actor-1');
		fetchProjectSummariesMock.mockResolvedValue([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Allowed Project'
			}
		]);
	});

	it('does not reveal the existence of documents outside the allowed scope', async () => {
		const { executeBuildosAgentPublicTool } = await import('./public-tool-executor');
		const admin = createAdminMock([
			{
				id: '55555555-5555-5555-5555-555555555555',
				project_id: '66666666-6666-6666-6666-666666666666',
				title: 'Hidden Doc',
				content: 'Top secret',
				state_key: 'active',
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z',
				deleted_at: null
			}
		]);

		await expect(
			executeBuildosAgentPublicTool({
				admin,
				userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				scope: {
					mode: 'read_only',
					project_ids: ['44444444-4444-4444-4444-444444444444']
				},
				toolName: 'get_document',
				arguments: {
					document_id: '55555555-5555-5555-5555-555555555555'
				}
			})
		).rejects.toThrow('Document not found');
	});
});
