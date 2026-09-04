// packages/shared-agent-ops/src/calendar/project-calendar.service.test.ts
// Write-half coverage that moved out of apps/web alongside
// createProjectCalendar / updateProjectCalendar. The web suites keep the
// ApiResponse shaping and the queue-backed sync-health surfaces.
import { describe, expect, it, vi } from 'vitest';
import { ProjectCalendarService } from './project-calendar.service';
import type { LegacyProjectCalendarClient } from './legacy-google-calendar.port';

type TableRows = Record<string, unknown>;

/**
 * Minimal PostgREST double: every builder call returns itself and the terminal
 * `single`/`maybeSingle` resolves whatever the table fixture provides.
 */
function createSupabaseMock(config: {
	rows: Record<string, TableRows | null>;
	errors?: Record<string, { code?: string; message?: string } | null>;
	inserted?: (table: string, payload: unknown) => void;
	updated?: (table: string, payload: unknown) => void;
}) {
	return {
		from: (table: string) => {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				is: () => builder,
				insert: (payload: unknown) => {
					config.inserted?.(table, payload);
					return builder;
				},
				update: (payload: unknown) => {
					config.updated?.(table, payload);
					return builder;
				},
				single: async () => ({
					data: config.rows[table] ?? null,
					error: config.errors?.[table] ?? null
				}),
				maybeSingle: async () => ({
					data: config.rows[table] ?? null,
					error: config.errors?.[table] ?? null
				})
			};
			return builder;
		}
	};
}

function legacyClient(overrides: Partial<LegacyProjectCalendarClient> = {}) {
	return {
		listUserCalendars: vi.fn().mockResolvedValue({ success: true, calendars: [] }),
		createProjectCalendar: vi
			.fn()
			.mockResolvedValue({ success: true, calendarId: 'legacy-cal' }),
		deleteProjectCalendar: vi.fn().mockResolvedValue({ success: true }),
		updateCalendarProperties: vi.fn().mockResolvedValue({ success: true }),
		...overrides
	} as unknown as LegacyProjectCalendarClient & Record<string, ReturnType<typeof vi.fn>>;
}

describe('ProjectCalendarService.createProjectCalendarRecord', () => {
	it('rejects a provider calendar id without its source id under source routing', async () => {
		const supabase = createSupabaseMock({
			rows: { onto_projects: { id: 'p1', name: 'Apollo', description: null, props: {} } }
		});
		const service = new ProjectCalendarService(supabase as any, {
			projectResourceService: {
				resolveLinkedSource: vi.fn(),
				createCalendar: vi.fn(),
				updateCalendar: vi.fn(),
				deleteCalendar: vi.fn(),
				shareCalendar: vi.fn()
			} as any
		});

		const outcome = await service.createProjectCalendarRecord({
			projectId: 'p1',
			userId: 'u1',
			calendarId: 'someone@example.com'
		});

		expect(outcome).toMatchObject({
			status: 'error',
			httpStatus: 400,
			badRequest: true
		});
	});

	it('reports a 409 when the project already has a mapping for this user', async () => {
		const supabase = createSupabaseMock({
			rows: {
				onto_projects: { id: 'p1', name: 'Apollo', description: null, props: {} },
				project_calendars: { id: 'pc1' }
			}
		});
		const service = new ProjectCalendarService(supabase as any, {
			legacyCalendar: legacyClient()
		});

		await expect(
			service.createProjectCalendarRecord({ projectId: 'p1', userId: 'u1' })
		).resolves.toMatchObject({
			status: 'error',
			httpStatus: 409,
			message: 'Calendar already exists for this project'
		});
	});

	it('stores the resolved color hex and provider provenance for a linked source', async () => {
		let insertedRow: any = null;
		const supabase: any = {
			from: (table: string) => {
				const builder: any = {
					select: () => builder,
					eq: () => builder,
					is: () => builder,
					insert: (payload: unknown) => {
						insertedRow = payload;
						return builder;
					},
					single: async () => {
						if (table === 'onto_projects') {
							return {
								data: { id: 'p1', name: 'Apollo', description: null, props: {} },
								error: null
							};
						}
						return { data: { ...insertedRow, id: 'pc-new' }, error: null };
					},
					maybeSingle: async () => ({ data: null, error: null })
				};
				return builder;
			}
		};

		const service = new ProjectCalendarService(supabase, {
			projectResourceService: {
				resolveLinkedSource: vi.fn().mockResolvedValue({
					calendarSourceId: 'source-1',
					providerCalendarId: 'project@example.com',
					summary: 'Apollo calendar',
					colorId: '5'
				}),
				createCalendar: vi.fn(),
				updateCalendar: vi.fn(),
				deleteCalendar: vi.fn(),
				shareCalendar: vi.fn()
			} as any
		});

		const outcome = await service.createProjectCalendarRecord({
			projectId: 'p1',
			userId: 'u1',
			calendarId: 'project@example.com',
			calendarSourceId: 'source-1'
		});

		expect(outcome.status).toBe('ok');
		expect(insertedRow).toMatchObject({
			calendar_id: 'project@example.com',
			calendar_source_id: 'source-1',
			calendar_name: 'Apollo calendar',
			color_id: '5',
			// Linking an existing calendar must never claim provider ownership:
			// deleting the mapping may not delete someone else's calendar.
			provider_resource_managed: false
		});
	});

	it('rolls the provider calendar back through the legacy client when the insert fails', async () => {
		const legacy = legacyClient();
		const supabase: any = {
			from: (table: string) => {
				const builder: any = {
					select: () => builder,
					eq: () => builder,
					is: () => builder,
					insert: () => builder,
					single: async () => {
						if (table === 'onto_projects') {
							return {
								data: { id: 'p1', name: 'Apollo', description: null, props: {} },
								error: null
							};
						}
						if (table === 'users') return { data: { timezone: 'UTC' }, error: null };
						return { data: null, error: { message: 'insert exploded' } };
					},
					maybeSingle: async () => ({ data: null, error: null })
				};
				return builder;
			}
		};
		const service = new ProjectCalendarService(supabase, { legacyCalendar: legacy });

		await expect(
			service.createProjectCalendarRecord({ projectId: 'p1', userId: 'u1' })
		).resolves.toMatchObject({ status: 'error', httpStatus: 500 });
		expect((legacy as any).deleteProjectCalendar).toHaveBeenCalledWith('u1', 'legacy-cal');
	});
});

describe('ProjectCalendarService.updateProjectCalendarRecord', () => {
	it('refuses a source-aware rename when the stored source is missing', async () => {
		const supabase = createSupabaseMock({
			rows: {
				project_calendars: {
					id: 'pc1',
					calendar_id: 'project@example.com',
					calendar_source_id: null,
					provider_resource_managed: true
				}
			}
		});
		const service = new ProjectCalendarService(supabase as any, {
			projectResourceService: {
				resolveLinkedSource: vi.fn(),
				createCalendar: vi.fn(),
				updateCalendar: vi.fn(),
				deleteCalendar: vi.fn(),
				shareCalendar: vi.fn()
			} as any
		});

		await expect(
			service.updateProjectCalendarRecord('p1', 'u1', { name: 'Renamed' })
		).resolves.toMatchObject({ status: 'error', httpStatus: 409 });
	});

	it('writes the color hex alongside the color id', async () => {
		const updates: unknown[] = [];
		const supabase = createSupabaseMock({
			rows: {
				project_calendars: {
					id: 'pc1',
					calendar_id: 'project@example.com',
					calendar_source_id: 'source-1',
					provider_resource_managed: true
				},
				onto_projects: { props: {} }
			},
			updated: (table, payload) => {
				if (table === 'project_calendars') updates.push(payload);
			}
		});
		const service = new ProjectCalendarService(supabase as any, {
			legacyCalendar: legacyClient()
		});

		const outcome = await service.updateProjectCalendarRecord('p1', 'u1', { colorId: '3' });

		expect(outcome.status).toBe('ok');
		expect(updates[0]).toMatchObject({ color_id: '3', hex_color: '#f83a22' });
	});
});

describe('ProjectCalendarService.ensureProjectCalendarRecord', () => {
	it('returns the existing mapping without provisioning a new calendar', async () => {
		const legacy = legacyClient();
		const supabase = createSupabaseMock({
			rows: {
				project_calendars: { id: 'pc1', calendar_id: 'project@example.com' },
				onto_projects: { props: {} }
			}
		});
		const service = new ProjectCalendarService(supabase as any, { legacyCalendar: legacy });

		await expect(service.ensureProjectCalendarRecord('p1', 'u1')).resolves.toMatchObject({
			id: 'pc1'
		});
		expect((legacy as any).createProjectCalendar).not.toHaveBeenCalled();
	});

	it('returns null rather than throwing when provisioning fails', async () => {
		const supabase = createSupabaseMock({
			rows: { project_calendars: null, onto_projects: null },
			errors: { project_calendars: { code: 'PGRST116' } }
		});
		const service = new ProjectCalendarService(supabase as any, {
			legacyCalendar: legacyClient()
		});

		await expect(service.ensureProjectCalendarRecord('p1', 'u1')).resolves.toBeNull();
	});
});
