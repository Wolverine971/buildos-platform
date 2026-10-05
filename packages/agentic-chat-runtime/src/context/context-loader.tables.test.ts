// packages/agentic-chat-runtime/src/context/context-loader.tables.test.ts
//
// BuildOS Tables (2026-10-04): a project context lists its tables (Knowledge Map
// line source), and a focused table replaces the 16K markdown projection with
// the schema, the true row count, and the first rows.
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFastChatContextLoader } from './context-loader';
import type { ProjectContextData } from './index';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const TABLE_ID = '00000000-0000-4000-8000-000000000003';

const TABLE_SCHEMA = {
	format: 1,
	revision: 4,
	row_count: 40,
	primary_column_id: 'c_company',
	columns: [
		{ id: 'c_company', name: 'Company', type: 'text' },
		{ id: 'c_status', name: 'Status', type: 'select', options: { choices: [] } },
		{ id: 'c_secret', name: 'Hidden notes', type: 'text', hidden: true }
	]
};

function tableRow(rowNumber: number) {
	return {
		id: `row-${rowNumber}`,
		row_number: rowNumber,
		position: rowNumber * 1024,
		cells: { c_company: `Company ${rowNumber}`, c_status: 'Applied' },
		cell_meta: {},
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: '',
		updated_at: ''
	};
}

function tableClient(options: { focused: boolean }) {
	const queries: string[] = [];
	const rpc = vi.fn(async (fn: string) => {
		if (fn !== 'load_fastchat_context') return { data: null, error: null };
		return {
			data: {
				project: { id: PROJECT_ID, name: 'Job hunt', state_key: 'active' },
				tasks: [],
				documents: [],
				...(options.focused
					? {
							focus_entity_full: {
								id: TABLE_ID,
								project_id: PROJECT_ID,
								title: 'Job applications',
								type_key: 'document.table',
								state_key: 'draft',
								content: '| Company | Status |\n'.repeat(2_000),
								updated_at: '2026-10-04T00:00:00Z'
							}
						}
					: {})
			},
			error: null
		};
	});
	const from = vi.fn((table: string) => {
		if (table === 'users') {
			return {
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						maybeSingle: vi.fn().mockResolvedValue({
							data: { timezone: 'UTC', name: null },
							error: null
						})
					}))
				}))
			};
		}
		const state = { like: false };
		const query: Record<string, any> = {};
		for (const method of ['select', 'eq', 'is', 'order']) query[method] = vi.fn(() => query);
		query.like = vi.fn(() => {
			state.like = true;
			return query;
		});
		query.maybeSingle = vi.fn(async () => {
			if (table !== 'onto_documents') return { data: null, error: null };
			queries.push('focused_table');
			return {
				data: {
					id: TABLE_ID,
					title: 'Job applications',
					description: null,
					type_key: 'document.table',
					updated_at: '2026-10-04T00:00:00Z',
					table: TABLE_SCHEMA
				},
				error: null
			};
		});
		query.limit = vi.fn(async () => {
			if (table === 'onto_documents' && state.like) {
				queries.push('project_tables');
				return {
					data: [
						{
							id: TABLE_ID,
							title: 'Job applications',
							description: null,
							type_key: 'document.table',
							updated_at: '2026-10-04T00:00:00Z',
							table: TABLE_SCHEMA
						}
					],
					error: null
				};
			}
			if (table === 'onto_document_rows') {
				queries.push('focused_rows');
				return { data: Array.from({ length: 15 }, (_, i) => tableRow(i + 1)), error: null };
			}
			return { data: [], error: null };
		});
		return query;
	});
	return { client: { rpc, from } as unknown as SupabaseClient<Database>, queries };
}

describe('project tables in chat context', () => {
	it('lists the project tables with row counts and visible columns', async () => {
		const { client, queries } = tableClient({ focused: false });
		const { loadFastChatPromptContext } = createFastChatContextLoader({
			logger: { warn: vi.fn() }
		});
		const context = await loadFastChatPromptContext({
			supabase: client,
			userId: USER_ID,
			contextType: 'project',
			entityId: PROJECT_ID
		});
		const data = context.data as ProjectContextData;
		expect(data.project_tables).toEqual([
			expect.objectContaining({
				id: TABLE_ID,
				title: 'Job applications',
				row_count: 40,
				column_count: 2,
				columns: ['Company', 'Status']
			})
		]);
		expect(queries).toEqual(['project_tables']);
	});

	it('replaces a focused table preview with its schema, true row count, and first rows', async () => {
		const { client, queries } = tableClient({ focused: true });
		const { loadFastChatPromptContext } = createFastChatContextLoader({
			logger: { warn: vi.fn() }
		});
		const context = await loadFastChatPromptContext({
			supabase: client,
			userId: USER_ID,
			contextType: 'project',
			entityId: PROJECT_ID,
			projectFocus: {
				focusType: 'document',
				focusEntityId: TABLE_ID,
				focusEntityName: 'Job applications',
				projectId: PROJECT_ID,
				projectName: 'Job hunt'
			}
		});
		console.log(
			'DBG',
			context.contextLoadSource,
			Object.keys(context.data ?? {}),
			(context.data as any)?.focus_entity_type,
			JSON.stringify((context.data as any)?.focus_entity_full)?.slice(0, 300)
		);
		const focus = (context.data as Record<string, any>).focus_entity_full as Record<
			string,
			any
		>;
		expect(queries.sort()).toEqual(['focused_rows', 'focused_table', 'project_tables']);
		expect(focus.content_preview).toBeUndefined();
		expect(focus.table_row_count).toBe(40);
		expect(focus.table_rows_shown).toBe(15);
		expect(focus.table_columns).toEqual(['Company', 'Status']);
		expect(focus.table_summary).toContain('40');
		expect(focus.table_summary).toContain('Company 15');
		expect(focus.table_summary).not.toContain('Company 16');
		expect(focus.table_summary).toContain('read_table_rows');
		expect(focus.table_summary.length).toBeLessThanOrEqual(3_000);
	});
});
