// apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.tables.test.ts
//
// BuildOS Tables (2026-10-04): the Knowledge Map marks table documents with
// "· table · N rows · Col, Col…", and a focused table renders its loaded
// schema + first rows instead of a markdown excerpt.
import { describe, expect, it } from 'vitest';
import { buildLitePromptEnvelope } from './build-lite-prompt';

const TABLE_ID = '70000000-0000-4000-8000-000000000007';

function projectData(extra: Record<string, unknown> = {}) {
	return {
		project: {
			id: 'project-1',
			name: 'Job hunt',
			state_key: 'active',
			description: null,
			start_at: null,
			end_at: null,
			next_step_short: null,
			updated_at: '2026-10-04T12:00:00Z'
		},
		doc_structure: {
			version: 1,
			root: [
				{
					id: TABLE_ID,
					type: 'doc',
					order: 0,
					title: 'Job applications',
					description: 'A long markdown projection nobody should see here',
					children: []
				},
				{
					id: 'doc-notes',
					type: 'doc',
					order: 1,
					title: 'Interview notes',
					description: 'What I learned',
					children: []
				}
			]
		},
		project_tables: [
			{
				id: TABLE_ID,
				title: 'Job applications',
				description: null,
				type_key: 'document.table',
				updated_at: '2026-10-04T12:00:00Z',
				row_count: 42,
				column_count: 6,
				columns: ['Company', 'Role', 'Status', 'Last contact', 'Salary', 'Notes']
			}
		],
		goals: [],
		milestones: [],
		plans: [],
		tasks: [],
		documents: [],
		events: [],
		members: [],
		context_meta: { generated_at: '2026-10-04T12:00:00Z', source: 'rpc' },
		...extra
	};
}

describe('tables in the lite prompt', () => {
	it('marks a table in the Knowledge Map with its row count and first columns', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			projectId: 'project-1',
			projectName: 'Job hunt',
			now: '2026-10-04T19:00:00Z',
			data: projectData() as never
		});
		const map = envelope.sections.find((section) => section.id === 'project_knowledge_map');
		expect(map?.content).toContain(
			'Job applications · table · 42 rows · Company, Role, Status, Last contact +2'
		);
		expect(map?.content).not.toContain('A long markdown projection');
		expect(map?.content).toContain('Interview notes — What I learned');
		expect(map?.content).toContain('get_onto_table_details({ table_id })');
	});

	it('leaves the map guidance alone when the project has no tables', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			projectId: 'project-1',
			projectName: 'Job hunt',
			now: '2026-10-04T19:00:00Z',
			data: projectData({ project_tables: [] }) as never
		});
		const map = envelope.sections.find((section) => section.id === 'project_knowledge_map');
		expect(map?.content).not.toContain('· table ·');
		expect(map?.content).not.toContain('get_onto_table_details');
	});

	it('renders a focused table as its loaded schema and first rows', () => {
		const summary =
			'Table "Job applications" · 42 rows · 6 columns\nColumns:\n- Company (text)\n\nFirst rows:\nr1 | Stripe | Applied';
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			projectName: 'Job hunt',
			focusEntityType: 'document',
			focusEntityId: TABLE_ID,
			focusEntityName: 'Job applications',
			now: '2026-10-04T19:00:00Z',
			data: projectData({
				focus_entity_type: 'document',
				focus_entity_id: TABLE_ID,
				focus_entity_full: {
					id: TABLE_ID,
					title: 'Job applications',
					type_key: 'document.table',
					table_summary: summary,
					table_row_count: 42,
					table_rows_shown: 15,
					table_columns: ['Company']
				},
				linked_entities: {}
			}) as never
		});
		expect(envelope.systemPrompt).toContain('r1 | Stripe | Applied');
		expect(envelope.systemPrompt).toContain('the first 15 of 42 rows');
		expect(envelope.systemPrompt).toContain(
			'use read_table_rows to filter, group, total, or page'
		);
	});
});
