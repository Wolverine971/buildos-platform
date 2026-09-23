// apps/worker/tests/changeSetCoverage.test.ts
//
// Phase 4 coverage guard (02 §7 "Coverage"): every write op the policy knows
// about must be supported by exactly one worker catalog — the non-calendar
// catalog (stage+commit, gateway handler in AGENT_OP_WRITE_CATALOG) or the
// calendar catalog (commit-only, offered only when a CalendarPort is wired).
// This fails loudly if a new write op is added without a worker handler or
// categorization, rather than silently proposing changes that can't be applied.
//
// Runtime gating (calendar ops offered only with a CalendarPort, calendar
// writes rejected in stage mode) is pinned in agentOpExecution.test.ts.
import { describe, expect, it } from 'vitest';
import { BUILDOS_AGENT_READ_OPS, BUILDOS_AGENT_WRITE_OPS } from '@buildos/shared-types';
import {
	AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG,
	AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG,
	AGENT_OP_READ_CATALOG,
	AGENT_OP_WRITE_CATALOG,
	createAgentRunCalendarPort
} from '@buildos/shared-agent-ops';

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

// A chainable no-op so the port can be CONSTRUCTED without touching the
// network. Construction must be lazy (no queries); if it isn't, the factory
// test below surfaces it.
const noopAdmin: any = new Proxy(function () {}, {
	get: () => noopAdmin,
	apply: () => noopAdmin
});

describe('Phase 4 — write-op stage/commit coverage', () => {
	it('every non-calendar write op is stage+commit supported (has a worker handler)', () => {
		const unsupported = BUILDOS_AGENT_WRITE_OPS.filter(
			(op) => !op.startsWith('cal.') && !AGENT_OP_WRITE_CATALOG.includes(op)
		);
		expect(unsupported).toEqual([]);
	});

	it('calendar write ops are explicitly excluded from the worker catalog (deferred to CalendarPort)', () => {
		const calIncluded = BUILDOS_AGENT_WRITE_OPS.filter(
			(op) => op.startsWith('cal.') && AGENT_OP_WRITE_CATALOG.includes(op)
		);
		expect(calIncluded).toEqual([]);
	});

	it('the worker write catalog contains only known policy write ops', () => {
		const known = new Set<string>(BUILDOS_AGENT_WRITE_OPS);
		const unknown = AGENT_OP_WRITE_CATALOG.filter((op) => !known.has(op));
		expect(unknown).toEqual([]);
	});

	it('the write catalog is non-empty (writes are actually wired)', () => {
		expect(AGENT_OP_WRITE_CATALOG.length).toBeGreaterThan(0);
	});

	it('the two write catalogs together cover every policy write op (nothing un-appliable)', () => {
		const supported = new Set<string>([
			...AGENT_OP_WRITE_CATALOG,
			...AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG
		]);
		expect(BUILDOS_AGENT_WRITE_OPS.filter((op) => !supported.has(op))).toEqual([]);
	});
});

describe('calendar op partition', () => {
	it('policy ops contain exactly the known calendar read and write ops', () => {
		expect(BUILDOS_AGENT_READ_OPS.filter((op) => op.startsWith('cal.')).sort()).toEqual(
			[...CAL_READ_OPS].sort()
		);
		expect(BUILDOS_AGENT_WRITE_OPS.filter((op) => op.startsWith('cal.')).sort()).toEqual(
			[...CAL_WRITE_OPS].sort()
		);
	});

	it('the calendar gateway catalogs hold exactly the calendar ops', () => {
		expect([...AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG].sort()).toEqual(
			[...CAL_READ_OPS].sort()
		);
		expect([...AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG].sort()).toEqual(
			[...CAL_WRITE_OPS].sort()
		);
	});

	it('the non-calendar read catalog is calendar-free', () => {
		expect(AGENT_OP_READ_CATALOG.every((op) => !op.startsWith('cal.'))).toBe(true);
	});
});

describe('worker-safe calendar port factory', () => {
	it('builds a CalendarPort exposing all 7 calendar methods (explicit credentials)', () => {
		const port = createAgentRunCalendarPort({
			admin: noopAdmin,
			userId: '00000000-0000-4000-8000-000000000000',
			credentials: { clientId: 'test-client-id', clientSecret: 'test-client-secret' }
		}) as unknown as Record<string, unknown>;
		for (const method of CAL_PORT_METHODS) {
			expect(typeof port[method], `port.${method} must be a function`).toBe('function');
		}
	});

	it('builds a CalendarPort from process.env creds when no credentials are passed', () => {
		const prevId = process.env.PRIVATE_GOOGLE_CLIENT_ID;
		const prevSecret = process.env.PRIVATE_GOOGLE_CLIENT_SECRET;
		process.env.PRIVATE_GOOGLE_CLIENT_ID = 'env-client-id';
		process.env.PRIVATE_GOOGLE_CLIENT_SECRET = 'env-client-secret';
		try {
			const port = createAgentRunCalendarPort({
				admin: noopAdmin,
				userId: '00000000-0000-4000-8000-000000000000'
			}) as unknown as Record<string, unknown>;
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
