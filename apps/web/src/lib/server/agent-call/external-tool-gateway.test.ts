// apps/web/src/lib/server/agent-call/external-tool-gateway.test.ts
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
	description: string | null;
	type_key: string;
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
						description: row.description,
						type_key: row.type_key,
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

function createAdminMock(documents: DocumentRow[] = []) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_documents') {
				return new OntoDocumentsQueryBuilderMock(documents);
			}

			throw new Error(`Unexpected table ${table}`);
		}),
		rpc: vi.fn()
	};
}

describe('external tool gateway', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue('actor-1');
		fetchProjectSummariesMock.mockResolvedValue([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Allowed Project',
				description: 'Main workspace',
				type_key: 'project.internal',
				state_key: 'active',
				updated_at: '2026-04-28T00:00:00.000Z',
				task_count: 7,
				goal_count: 1,
				plan_count: 2,
				document_count: 4,
				access_role: 'owner',
				access_level: 'write'
			}
		]);
	});

	it('returns only gateway primitives for external tools', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({ mode: 'read_only' });

		expect(tools.map((tool) => tool.name)).toEqual(['tool_help', 'tool_exec']);
	});

	it('returns filtered root help instead of the flat public tool list', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only' },
			toolName: 'tool_help',
			arguments: { path: 'root' }
		});

		expect(result.type).toBe('directory');
		expect(result.path).toBe('root');
		expect(JSON.stringify(result)).not.toContain('list_projects');
		expect(JSON.stringify(result)).toContain('onto.task');
	});

	it('executes canonical project list reads through tool_exec', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only' },
			toolName: 'tool_exec',
			arguments: {
				op: 'onto.project.list',
				args: {}
			}
		});

		expect(result).toMatchObject({
			op: 'onto.project.list',
			ok: true
		});
		expect((result.result as { projects?: Array<{ name: string }> }).projects?.[0]?.name).toBe(
			'Allowed Project'
		);
	});

	it('does not reveal the existence of scoped-out documents through canonical ops', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock([
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '66666666-6666-6666-6666-666666666666',
					title: 'Hidden Doc',
					description: null,
					type_key: 'document.context.project',
					content: 'Top secret',
					state_key: 'active',
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null
				}
			]),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444']
			},
			toolName: 'tool_exec',
			arguments: {
				op: 'onto.document.get',
				args: {
					document_id: '55555555-5555-5555-5555-555555555555'
				}
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.get',
			ok: false,
			error: {
				code: 'INTERNAL',
				message: 'Document not found'
			}
		});
	});
});
