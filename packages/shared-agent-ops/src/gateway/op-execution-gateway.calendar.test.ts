// packages/shared-agent-ops/src/gateway/op-execution-gateway.calendar.test.ts
//
// cal.project.set from an agent must not link an existing (personal) calendar to a project:
// project-scoped calendar reads use the linked calendar.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '20000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';

vi.mock('./op-execution-gateway.access', () => ({
	loadVisibleProjects: vi.fn(async () => ({
		projects: [],
		projectMap: new Map([
			[PROJECT_ID, { id: PROJECT_ID, name: 'Scoped', access_level: 'write' }]
		]),
		ungrantedProjectCount: 0,
		ownerBlockedProjectCount: 0
	})),
	assertAccessibleProject: vi.fn((map: Map<string, unknown>, id: string) => map.get(id)),
	assertProjectWriteAccess: vi.fn()
}));

import { setProjectCalendar } from './op-execution-gateway.calendar';
import type { ToolExecutionContext } from './op-execution-gateway.types';

let linkedCalendarId: string | null = null;

function makeContext() {
	const setProjectCalendarPort = vi.fn(async (args: Record<string, unknown>) => ({
		project_id: args.project_id,
		calendar_id: 'buildos-created@group.calendar.google.com'
	}));
	const admin = {
		from: vi.fn((table: string) => {
			expect(table).toBe('project_calendars');
			const chain = {
				select: () => chain,
				eq: () => chain,
				maybeSingle: async () => ({
					data: linkedCalendarId ? { calendar_id: linkedCalendarId } : null,
					error: null
				})
			};
			return chain;
		})
	};
	const context = {
		admin,
		userId: USER_ID,
		scope: { mode: 'read_write', project_ids: [PROJECT_ID], write_project_ids: [PROJECT_ID] },
		calendar: { setProjectCalendar: setProjectCalendarPort }
	} as unknown as ToolExecutionContext;
	return { context, setProjectCalendarPort, admin };
}

describe('gateway cal.project.set', () => {
	beforeEach(() => {
		linkedCalendarId = null;
	});

	it('refuses to link an existing personal calendar to an unmapped project', async () => {
		const { context, setProjectCalendarPort } = makeContext();

		await expect(
			setProjectCalendar(context, {
				project_id: PROJECT_ID,
				calendar_id: 'owner@example.com'
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(
			setProjectCalendar(context, { project_id: PROJECT_ID, calendarId: 'primary' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(setProjectCalendarPort).not.toHaveBeenCalled();
	});

	it('refuses to swap a mapped project onto a different calendar', async () => {
		linkedCalendarId = 'buildos-created@group.calendar.google.com';
		const { context, setProjectCalendarPort } = makeContext();

		await expect(
			setProjectCalendar(context, {
				project_id: PROJECT_ID,
				action: 'create',
				calendar_id: 'owner@example.com'
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(setProjectCalendarPort).not.toHaveBeenCalled();
	});

	it('creates a dedicated project calendar when no calendar_id is given', async () => {
		const { context, setProjectCalendarPort, admin } = makeContext();

		await setProjectCalendar(context, { project_id: PROJECT_ID, name: 'Launch' });

		expect(admin.from).not.toHaveBeenCalled();
		expect(setProjectCalendarPort).toHaveBeenCalledOnce();
		const forwarded = setProjectCalendarPort.mock.calls[0]![0];
		expect(forwarded).toMatchObject({ project_id: PROJECT_ID, name: 'Launch' });
		expect(forwarded).not.toHaveProperty('calendar_id');
	});

	it('allows repeating the calendar the project already uses, without forwarding it', async () => {
		linkedCalendarId = 'buildos-created@group.calendar.google.com';
		const { context, setProjectCalendarPort } = makeContext();

		await setProjectCalendar(context, {
			project_id: PROJECT_ID,
			calendar_id: 'buildos-created@group.calendar.google.com',
			sync_enabled: false
		});

		expect(setProjectCalendarPort).toHaveBeenCalledOnce();
		const forwarded = setProjectCalendarPort.mock.calls[0]![0];
		expect(forwarded).toMatchObject({ project_id: PROJECT_ID, sync_enabled: false });
		expect(forwarded).not.toHaveProperty('calendar_id');
	});
});
