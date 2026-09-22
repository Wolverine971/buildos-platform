// apps/web/src/lib/server/agent-call/caller-provisioning.project-grants.test.ts
//
// One-click connector grants (tasker 94). Runs the real project-access
// resolver against a small in-memory Supabase fake so grant, switch, and the
// effective scope the MCP connector enforces are checked together.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CALLER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OLD_PROJECT = '11111111-1111-4111-8111-111111111111';
const NEW_PROJECT = '22222222-2222-4222-8222-222222222222';
const RESTRICTED_PROJECT = '33333333-3333-4333-8333-333333333333';
const STRANGER_PROJECT = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(async () => 'actor-1'),
	fetchProjectSummaries: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId,
	fetchProjectSummaries: mocks.fetchProjectSummaries
}));

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class FakeQuery {
	private action: 'select' | 'insert' | 'update' = 'select';
	private payload: unknown = null;
	private filters: Array<(row: Row) => boolean> = [];

	constructor(
		private readonly tables: Tables,
		private readonly table: string
	) {}

	select() {
		return this;
	}
	insert(payload: unknown) {
		this.action = 'insert';
		this.payload = payload;
		return this;
	}
	update(payload: unknown) {
		this.action = 'update';
		this.payload = payload;
		return this;
	}
	eq(field: string, value: unknown) {
		this.filters.push((row) => row[field] === value);
		return this;
	}
	is(field: string, value: unknown) {
		this.filters.push((row) => (row[field] ?? null) === value);
		return this;
	}
	in(field: string, values: unknown[]) {
		this.filters.push((row) => values.includes(row[field]));
		return this;
	}
	order() {
		return this;
	}

	private run(): { data: Row[]; error: null } {
		const rows = (this.tables[this.table] ??= []);
		if (this.action === 'insert') {
			const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(
				// Mirrors the DB default for revoked_at on permission rows.
				(row, index) => ({
					id: `${this.table}-${rows.length + index}`,
					revoked_at: null,
					...(row as Row)
				})
			);
			rows.push(...inserted);
			return { data: inserted, error: null };
		}
		const matched = rows.filter((row) => this.filters.every((filter) => filter(row)));
		if (this.action === 'update') {
			for (const row of matched) Object.assign(row, this.payload as Row);
		}
		return { data: matched, error: null };
	}

	maybeSingle() {
		return Promise.resolve({ data: this.run().data[0] ?? null, error: null });
	}
	single() {
		return this.maybeSingle();
	}
	then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
		return Promise.resolve(this.run()).then(resolve, reject);
	}
}

function fakeAdmin(tables: Tables) {
	return { from: (table: string) => new FakeQuery(tables, table) };
}

function summary(id: string, name: string, isShared = false) {
	return {
		id,
		name,
		description: `${name} notes`,
		is_shared: isShared,
		access_level: 'admin',
		access_role: 'owner',
		state_key: 'active'
	};
}

function selectedStaticCaller(overrides: Row = {}): Row {
	return {
		id: CALLER_ID,
		user_id: USER_ID,
		provider: 'codex-cli',
		caller_key: 'codex-cli:local:codex-all-projects',
		status: 'trusted',
		project_scope_mode: 'selected',
		policy: {
			scope_mode: 'read_write',
			project_scope_mode: 'selected',
			allowed_project_ids: [OLD_PROJECT],
			allowed_ops: ['onto.project.get', 'onto.task.create']
		},
		metadata: {},
		...overrides
	};
}

function baseTables(caller: Row = selectedStaticCaller()): Tables {
	return {
		external_agent_callers: [caller],
		external_agent_project_permissions: [
			{
				id: 'perm-old',
				user_id: USER_ID,
				external_agent_caller_id: CALLER_ID,
				agent_oauth_grant_id: null,
				project_id: OLD_PROJECT,
				access_mode: 'read_write',
				source: 'migration',
				revoked_at: null
			}
		],
		onto_projects: [
			{ id: OLD_PROJECT, external_agent_access: 'standard' },
			{ id: NEW_PROJECT, external_agent_access: 'standard' },
			{ id: RESTRICTED_PROJECT, external_agent_access: 'restricted' }
		],
		agent_oauth_grants: [],
		security_events: []
	};
}

async function flushAsyncWrites() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function effectiveProjectIds(tables: Tables): Promise<string[]> {
	const { resolveEffectiveAgentProjectScope } = await import('./project-access.service');
	const caller = tables.external_agent_callers![0]!;
	const scope = await resolveEffectiveAgentProjectScope({
		admin: fakeAdmin(tables),
		userId: USER_ID,
		callerId: CALLER_ID,
		projectScopeMode: caller.project_scope_mode as 'selected' | 'all_unrestricted',
		scope: { mode: 'read_write' }
	});
	return scope.project_ids.sort();
}

describe('connector one-click project grants', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchProjectSummaries.mockResolvedValue([
			summary(OLD_PROJECT, 'Old project'),
			summary(NEW_PROJECT, 'Book project'),
			summary(RESTRICTED_PROJECT, 'Private journal')
		]);
	});

	it('describes what a selected-mode connector cannot see yet', async () => {
		const tables = baseTables();
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		const context = await service.getProjectGrantContextForUser(
			USER_ID,
			CALLER_ID,
			NEW_PROJECT
		);

		expect(context.caller).toMatchObject({
			provider: 'codex-cli',
			scope_mode: 'read_write',
			project_scope_mode: 'selected',
			is_oauth: false
		});
		expect(context.project).toMatchObject({ id: NEW_PROJECT, name: 'Book project' });
		expect(context.project_already_granted).toBe(false);
		expect(context.ungranted_projects.map((project) => project.id).sort()).toEqual(
			[NEW_PROJECT, RESTRICTED_PROJECT].sort()
		);
	});

	it('never resolves a project outside the user workspace from the grant link', async () => {
		const tables = baseTables();
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		const context = await service.getProjectGrantContextForUser(
			USER_ID,
			CALLER_ID,
			STRANGER_PROJECT
		);
		expect(context.project).toBeNull();
	});

	it('grants one project in place, keeps selected mode, and the connector can use it immediately', async () => {
		const tables = baseTables();
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		expect(await effectiveProjectIds(tables)).toEqual([OLD_PROJECT]);

		await service.grantProjectsForUser(USER_ID, CALLER_ID, [NEW_PROJECT]);
		await flushAsyncWrites();

		const permissions = tables.external_agent_project_permissions!;
		expect(permissions.find((row) => row.id === 'perm-old')).toMatchObject({
			revoked_at: null,
			source: 'migration'
		});
		expect(permissions.find((row) => row.project_id === NEW_PROJECT)).toMatchObject({
			access_mode: 'read_write',
			source: 'selected',
			agent_oauth_grant_id: null,
			revoked_at: null
		});
		const caller = tables.external_agent_callers![0]!;
		expect(caller.project_scope_mode).toBe('selected');
		expect((caller.policy as Row).allowed_project_ids).toEqual([OLD_PROJECT, NEW_PROJECT]);
		expect(await effectiveProjectIds(tables)).toEqual([OLD_PROJECT, NEW_PROJECT].sort());
		expect(tables.security_events).toEqual([
			expect.objectContaining({
				event_type: 'agent.caller.project_access_granted',
				external_agent_caller_id: CALLER_ID
			})
		]);
	});

	it('is idempotent when the project is already granted', async () => {
		const tables = baseTables();
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		await service.grantProjectsForUser(USER_ID, CALLER_ID, [OLD_PROJECT]);

		expect(
			tables.external_agent_project_permissions!.filter(
				(row) => row.project_id === OLD_PROJECT && row.revoked_at === null
			)
		).toHaveLength(1);
	});

	it('refuses to grant a project outside the user workspace', async () => {
		const tables = baseTables();
		const { CallerProvisioningService, CallerProvisioningError } = await import(
			'./caller-provisioning.service'
		);
		const service = new CallerProvisioningService(fakeAdmin(tables));

		await expect(
			service.grantProjectsForUser(USER_ID, CALLER_ID, [STRANGER_PROJECT])
		).rejects.toBeInstanceOf(CallerProvisioningError);
		expect(tables.external_agent_project_permissions).toHaveLength(1);
	});

	it('refuses grants for a revoked connector', async () => {
		const tables = baseTables(selectedStaticCaller({ status: 'revoked' }));
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		await expect(
			service.grantProjectsForUser(USER_ID, CALLER_ID, [NEW_PROJECT])
		).rejects.toMatchObject({ status: 409 });
	});

	it('refuses grants for another user’s connector', async () => {
		const tables = baseTables(selectedStaticCaller({ user_id: 'someone-else' }));
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		await expect(
			service.grantProjectsForUser(USER_ID, CALLER_ID, [NEW_PROJECT])
		).rejects.toMatchObject({ status: 404 });
	});

	it('switches to all standard projects in place: future projects appear, restricted ones stay out', async () => {
		const tables = baseTables();
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		await service.switchToAllProjectsForUser(USER_ID, CALLER_ID);
		await flushAsyncWrites();

		const caller = tables.external_agent_callers![0]!;
		expect(caller.project_scope_mode).toBe('all_unrestricted');
		expect(caller.policy).toMatchObject({
			scope_mode: 'read_write',
			project_scope_mode: 'all_unrestricted',
			// Redundant explicit grant for an owned standard project is dropped.
			allowed_project_ids: [],
			allowed_ops: ['onto.project.get', 'onto.task.create']
		});
		expect(await effectiveProjectIds(tables)).toEqual([OLD_PROJECT, NEW_PROJECT].sort());

		// A project created after the switch is included without another click.
		const LATER_PROJECT = '55555555-5555-4555-8555-555555555555';
		tables.onto_projects!.push({ id: LATER_PROJECT, external_agent_access: 'standard' });
		mocks.fetchProjectSummaries.mockResolvedValue([
			summary(OLD_PROJECT, 'Old project'),
			summary(NEW_PROJECT, 'Book project'),
			summary(RESTRICTED_PROJECT, 'Private journal'),
			summary(LATER_PROJECT, 'Created later')
		]);
		expect(await effectiveProjectIds(tables)).toEqual(
			[OLD_PROJECT, NEW_PROJECT, LATER_PROJECT].sort()
		);
		expect(tables.security_events).toEqual([
			expect.objectContaining({
				event_type: 'agent.caller.permissions_updated',
				metadata: expect.objectContaining({
					previousProjectScopeMode: 'selected',
					projectScopeMode: 'all_unrestricted'
				})
			})
		]);
	});

	it('keeps explicit grants for shared projects when switching to all', async () => {
		const SHARED_PROJECT = '66666666-6666-4666-8666-666666666666';
		mocks.fetchProjectSummaries.mockResolvedValue([
			summary(OLD_PROJECT, 'Old project'),
			summary(SHARED_PROJECT, 'Team project', true)
		]);
		const tables = baseTables(
			selectedStaticCaller({
				policy: {
					scope_mode: 'read_only',
					project_scope_mode: 'selected',
					allowed_project_ids: [OLD_PROJECT, SHARED_PROJECT]
				}
			})
		);
		tables.onto_projects!.push({ id: SHARED_PROJECT, external_agent_access: 'standard' });
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		await service.switchToAllProjectsForUser(USER_ID, CALLER_ID);

		expect((tables.external_agent_callers![0]!.policy as Row).allowed_project_ids).toEqual([
			SHARED_PROJECT
		]);
		const active = tables.external_agent_project_permissions!.filter(
			(row) => row.revoked_at === null
		);
		expect(active.map((row) => row.project_id)).toEqual([SHARED_PROJECT]);
	});

	it('adds OAuth grants per grant row and never widens an OAuth read-only grant to write', async () => {
		const GRANT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
		const tables = baseTables(
			selectedStaticCaller({
				provider: 'chatgpt',
				caller_key: 'oauth:client-1',
				metadata: { auth_scheme: 'oauth' },
				policy: {
					scope_mode: 'read_write',
					project_scope_mode: 'selected',
					allowed_project_ids: [OLD_PROJECT]
				}
			})
		);
		tables.external_agent_project_permissions = [];
		tables.agent_oauth_grants = [
			{
				id: GRANT_ID,
				user_id: USER_ID,
				external_agent_caller_id: CALLER_ID,
				status: 'active',
				scope_mode: 'read_only',
				allowed_ops: ['onto.project.get'],
				allowed_project_ids: [OLD_PROJECT],
				project_scope_mode: 'selected'
			}
		];
		const { CallerProvisioningService } = await import('./caller-provisioning.service');
		const service = new CallerProvisioningService(fakeAdmin(tables));

		await service.grantProjectsForUser(USER_ID, CALLER_ID, [NEW_PROJECT]);
		expect(tables.external_agent_project_permissions).toEqual([
			expect.objectContaining({
				agent_oauth_grant_id: GRANT_ID,
				project_id: NEW_PROJECT,
				access_mode: 'read_only'
			})
		]);
		expect(tables.agent_oauth_grants![0]!.allowed_project_ids).toEqual([
			OLD_PROJECT,
			NEW_PROJECT
		]);

		await service.switchToAllProjectsForUser(USER_ID, CALLER_ID);
		expect(tables.agent_oauth_grants![0]).toMatchObject({
			scope_mode: 'read_only',
			project_scope_mode: 'all_unrestricted'
		});
	});
});
