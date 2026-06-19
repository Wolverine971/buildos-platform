// apps/worker/tests/calendarInRuns.endstate.test.ts
//
// END-STATE SPEC for "calendar ops in Agent Runs" (Waves 5–6 of the shared
// agent-ops extraction). This file is written TEST-FIRST: most of it is RED
// until the calendar carve lands, and that is intentional — it pins the target
// so the migration builds the right thing.
//
// What the end state must deliver (see
// apps/web/docs/technical/architecture/agent-work/HANDOFF_2026-06-20.md §1):
//   1. The package exposes calendar READ and WRITE catalogs separately from the
//      non-calendar worker catalogs, so the runner can offer them only when a
//      CalendarPort is wired.
//   2. The package exposes a WORKER-SAFE calendar port factory
//      (createAgentRunCalendarPort) that builds a 7-method CalendarPort with NO
//      SvelteKit ($lib/$env/$app) — Google creds come from constructor args or a
//      process.env fallback (R4).
//   3. AgentOpContext carries `calendar` and executeAgentOp threads it to the
//      gateway read/write path.
//   4. Phase 4 staging policy: calendar writes are NOT offered or executed in
//      review/stage runs until calendar staging has a faithful external
//      side-effect representation (02-STAGED-MUTATIONS §7).
//   5. Coverage: every BUILDOS_AGENT_WRITE_OP is supported by SOME worker
//      catalog (non-calendar OR calendar) — nothing silently un-appliable.
//
// Worker tests consume the BUILT package (dist/), so these go green only after
// the carve is implemented AND `pnpm --filter @buildos/shared-agent-ops build`.
import { describe, expect, it } from 'vitest';
import { BUILDOS_AGENT_READ_OPS, BUILDOS_AGENT_WRITE_OPS } from '@buildos/shared-types';
import * as agentOps from '@buildos/shared-agent-ops';
import type { AgentOpContext } from '@buildos/shared-agent-ops';

// Hard-coded so this spec is the source of truth, not a mirror of impl.
const CAL_READ_OPS = ['cal.event.list', 'cal.event.get', 'cal.project.get'] as const;

const CAL_WRITE_OPS = [
	'cal.event.create',
	'cal.event.update',
	'cal.event.delete',
	'cal.project.set'
] as const;

const CAL_PORT_METHODS = [
	'listCalendarEvents',
	'getCalendarEventDetails',
	'createCalendarEvent',
	'updateCalendarEvent',
	'deleteCalendarEvent',
	'getProjectCalendar',
	'setProjectCalendar'
] as const;

const USER_ID = '00000000-0000-4000-8000-000000000000';

// A chainable no-op so a port/executor can be CONSTRUCTED with this as its
// supabase client without touching the network. Any property access or call
// returns the proxy again. Construction must be lazy (no queries) — if it isn't,
// that's a real end-state defect this surfaces.
const noopAdmin: any = new Proxy(function () {}, {
	get: () => noopAdmin,
	apply: () => noopAdmin
});

// An admin that throws the moment a handler touches the DB. Used to prove a
// staged calendar write is rejected before it tries to stage or commit anything.
const throwingAdmin: any = new Proxy(
	{},
	{
		get() {
			throw new Error('calendar commit path reached the DB in a test');
		}
	}
);

function calStubPort(): Record<string, unknown> {
	const port: Record<string, unknown> = {};
	for (const m of CAL_PORT_METHODS) {
		port[m] = async () => ({ ok: true, stub: m });
	}
	return port;
}

describe('END STATE — calendar write catalog (Waves 5–6)', () => {
	it('BUILDOS_AGENT_READ_OPS still contains exactly the 3 known calendar read ops', () => {
		const calInPolicy = BUILDOS_AGENT_READ_OPS.filter((op) => op.startsWith('cal.'));
		expect([...calInPolicy].sort()).toEqual([...CAL_READ_OPS].sort());
	});

	it('BUILDOS_AGENT_WRITE_OPS still contains exactly the 4 known calendar write ops', () => {
		// Guards the assumption the rest of this spec is built on. Green today.
		const calInPolicy = BUILDOS_AGENT_WRITE_OPS.filter((op) => op.startsWith('cal.'));
		expect([...calInPolicy].sort()).toEqual([...CAL_WRITE_OPS].sort());
	});

	it('exports AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG with exactly the calendar read ops', () => {
		const catalog = (agentOps as Record<string, unknown>)
			.AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG as readonly string[] | undefined;
		expect(
			Array.isArray(catalog),
			'AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG must be exported (Waves 5–6)'
		).toBe(true);
		expect([...(catalog ?? [])].sort()).toEqual([...CAL_READ_OPS].sort());
	});

	it('exports AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG with exactly the calendar write ops', () => {
		const catalog = (agentOps as Record<string, unknown>)
			.AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG as readonly string[] | undefined;
		expect(
			Array.isArray(catalog),
			'AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG must be exported (Waves 5–6)'
		).toBe(true);
		expect([...(catalog ?? [])].sort()).toEqual([...CAL_WRITE_OPS].sort());
	});

	it('keeps the non-calendar read catalog calendar-free', () => {
		expect(agentOps.AGENT_OP_READ_CATALOG.every((op) => !op.startsWith('cal.'))).toBe(true);
	});

	it('keeps the non-calendar write catalog calendar-free (one catalog per concern)', () => {
		// Green today and must stay green — calendar ops live in their OWN catalog
		// so the runner only offers them when a CalendarPort is actually wired.
		expect(agentOps.AGENT_OP_WRITE_CATALOG.every((op) => !op.startsWith('cal.'))).toBe(true);
	});

	it('the two write catalogs together cover EVERY policy write op (nothing un-appliable)', () => {
		const calCatalog =
			((agentOps as Record<string, unknown>).AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG as
				| readonly string[]
				| undefined) ?? [];
		const supported = new Set<string>([...agentOps.AGENT_OP_WRITE_CATALOG, ...calCatalog]);
		const uncovered = BUILDOS_AGENT_WRITE_OPS.filter((op) => !supported.has(op));
		expect(uncovered).toEqual([]);
	});
});

describe('END STATE — runtime calendar catalog gating', () => {
	it('offers calendar reads and direct-commit writes only when a CalendarPort is wired', () => {
		const scope: AgentOpContext['scope'] = {
			mode: 'read_write',
			allowed_ops: [
				'onto.project.list',
				'onto.task.create',
				'cal.event.list',
				'cal.event.create'
			]
		};
		expect(agentOps.buildAgentRunOpCatalog({ scope, mutationMode: 'commit' })).toEqual([
			'onto.project.list',
			'onto.task.create'
		]);

		const calendar = calStubPort() as NonNullable<AgentOpContext['calendar']>;
		expect(
			agentOps.buildAgentRunOpCatalog({ scope, mutationMode: 'commit', calendar })
		).toEqual(['onto.project.list', 'onto.task.create', 'cal.event.list', 'cal.event.create']);
		expect(agentOps.buildAgentRunOpCatalog({ scope, mutationMode: 'stage', calendar })).toEqual(
			['onto.project.list', 'onto.task.create', 'cal.event.list']
		);
	});
});

describe('END STATE — worker-safe calendar port factory (R4 + carve)', () => {
	it('exports createAgentRunCalendarPort as a function', () => {
		expect(
			typeof (agentOps as Record<string, unknown>).createAgentRunCalendarPort,
			'createAgentRunCalendarPort must be exported from the package barrel (Waves 5–6)'
		).toBe('function');
	});

	it('builds a CalendarPort exposing all 7 calendar methods (explicit credentials)', () => {
		const factory = (agentOps as Record<string, unknown>).createAgentRunCalendarPort as
			| ((p: unknown) => Record<string, unknown>)
			| undefined;
		expect(typeof factory).toBe('function');
		const port = factory!({
			admin: noopAdmin,
			userId: USER_ID,
			credentials: { clientId: 'test-client-id', clientSecret: 'test-client-secret' }
		});
		for (const method of CAL_PORT_METHODS) {
			expect(typeof port[method], `port.${method} must be a function`).toBe('function');
		}
	});

	it('builds a CalendarPort from process.env creds when no credentials are passed (R4 fallback)', () => {
		const factory = (agentOps as Record<string, unknown>).createAgentRunCalendarPort as
			| ((p: unknown) => Record<string, unknown>)
			| undefined;
		expect(typeof factory).toBe('function');

		const prevId = process.env.PRIVATE_GOOGLE_CLIENT_ID;
		const prevSecret = process.env.PRIVATE_GOOGLE_CLIENT_SECRET;
		process.env.PRIVATE_GOOGLE_CLIENT_ID = 'env-client-id';
		process.env.PRIVATE_GOOGLE_CLIENT_SECRET = 'env-client-secret';
		try {
			const port = factory!({ admin: noopAdmin, userId: USER_ID });
			for (const method of CAL_PORT_METHODS) {
				expect(typeof port[method], `port.${method} must be a function`).toBe('function');
			}
		} finally {
			if (prevId === undefined) delete process.env.PRIVATE_GOOGLE_CLIENT_ID;
			else process.env.PRIVATE_GOOGLE_CLIENT_ID = prevId;
			if (prevSecret === undefined) delete process.env.PRIVATE_GOOGLE_CLIENT_SECRET;
			else process.env.PRIVATE_GOOGLE_CLIENT_SECRET = prevSecret;
		}
	});
});

describe('END STATE — executeAgentOp threads the calendar port', () => {
	it('AgentOpContext accepts a `calendar` port (documents the required field)', () => {
		const ctx: AgentOpContext = {
			admin: noopAdmin,
			userId: USER_ID,
			scope: { mode: 'read_write' },
			calendar: calStubPort() as NonNullable<AgentOpContext['calendar']>
		};
		expect(ctx.userId).toBe(USER_ID);
	});

	// NOTE: proving the port is actually INVOKED end-to-end requires the gateway
	// handler's pre-port access checks (resolveExternalCalendarProjectArgs loads
	// visible projects + asserts write access), which need a real DB. That is the
	// live smoke in the handoff's "definition of done" (create a real event), not
	// a headless unit test. Threading is pinned here by the type-acceptance test
	// above + the stage-mode rejection test below (which only goes green once the
	// port is threaded into executeWriteOp's commit branch).
});

describe('END STATE — calendar staging policy (no calendar writes in review runs)', () => {
	it('a calendar write op in stage mode is rejected before staging or committing', async () => {
		// 02-STAGED-MUTATIONS §7: Google Calendar writes aren't pure DB ops, so they
		// must not sneak through while the user expects review-before-commit. Full
		// calendar staging can replace this once it has a faithful external intent.
		const r = await agentOps.executeAgentOp(
			{
				admin: throwingAdmin,
				userId: USER_ID,
				scope: { mode: 'read_write', allowed_ops: ['cal.event.create'] },
				runContext: { context_type: 'global' },
				mutationMode: 'stage',
				calendar: calStubPort() as NonNullable<AgentOpContext['calendar']>
			},
			'cal.event.create',
			{ title: 'Launch sync', start_at: '2026-07-01T10:00:00Z' }
		);
		expect(r.ok).toBe(false);
		expect(r.error?.code).toBe('UNSUPPORTED');
		expect(r.proposedChange).toBeUndefined();
	});

	it('a NON-calendar write op in stage mode still produces a proposedChange (contrast)', async () => {
		// Guard: the calendar-stage rejection must not regress ordinary DB-op staging.
		const r = await agentOps.executeAgentOp(
			{
				admin: throwingAdmin,
				userId: USER_ID,
				scope: { mode: 'read_write' },
				mutationMode: 'stage'
			},
			'onto.task.create',
			{ project_id: 'project-1', title: 'Draft task' }
		);
		expect(r.ok).toBe(true);
		expect(r.proposedChange).toBeDefined();
		expect(r.proposedChange?.action).toBe('create');
	});
});
