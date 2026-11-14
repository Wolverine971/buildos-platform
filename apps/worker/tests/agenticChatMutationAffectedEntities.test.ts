// apps/worker/tests/agenticChatMutationAffectedEntities.test.ts
// Every write that saved something reports what it touched, so the chat never counts a
// calendar event, a moved document or a table edit as something it only read. A change that
// is waiting on the person, or that did nothing, reports nothing.
import type { JsonObject } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import { deriveMutationAffectedEntities } from '../src/workers/agentic-chat/turn/mutation-tool-runner';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const EVENT = '44444444-4444-4444-8444-444444444444';

const affected = (
	toolName: string,
	operationName: string,
	args: JsonObject,
	receipt: JsonObject | null
) => deriveMutationAffectedEntities({ toolName, operationName, arguments: args }, receipt);

describe('deriveMutationAffectedEntities', () => {
	it('keeps the entity-row shape for ordinary creates and updates', () => {
		expect(
			affected(
				'update_onto_task',
				'onto.task.update',
				{ task_id: TASK },
				{
					task: { id: TASK, project_id: PROJECT, title: 'Sign lease' }
				}
			)
		).toEqual([
			{
				kind: 'task',
				id: TASK,
				title: 'Sign lease',
				projectId: PROJECT,
				operation: 'updated',
				url: `/projects/${PROJECT}?entity=task&entity_id=${TASK}`
			}
		]);
	});

	it('reports a moved document, named from the tree receipt', () => {
		expect(
			affected(
				'move_document_in_tree',
				'onto.document.tree.move',
				{ project_id: PROJECT, document_id: DOC, new_parent_id: null, new_position: 0 },
				{
					structure: {
						version: 2,
						root: [
							{
								id: 'other',
								title: 'Folder',
								children: [{ id: DOC, title: 'Budget' }]
							}
						]
					},
					parent_id: 'other',
					parent_title: 'Folder',
					message: 'Moved'
				}
			)
		).toEqual([
			{
				kind: 'document',
				id: DOC,
				title: 'Budget',
				projectId: PROJECT,
				operation: 'moved',
				url: `/projects/${PROJECT}?doc=${DOC}`
			}
		]);
	});

	it('reports the document a task-document attach linked', () => {
		expect(
			affected(
				'create_task_document',
				'onto.task.docs.create_or_attach',
				{ task_id: TASK },
				{
					document: { id: DOC, project_id: PROJECT, title: 'Brief' },
					edge: { src_kind: 'task', src_id: TASK, dst_kind: 'document', dst_id: DOC }
				}
			)
		).toMatchObject([{ kind: 'document', id: DOC, title: 'Brief', operation: 'linked' }]);
	});

	it('reports calendar writes as events, and nothing when the write did not happen', () => {
		expect(
			affected(
				'create_calendar_event',
				'cal.event.create',
				{ title: 'Lease signing', start_at: '2026-11-16T15:00:00Z', project_id: PROJECT },
				{ ok: true, event_id: EVENT, synced: true }
			)
		).toEqual([
			{
				kind: 'event',
				id: EVENT,
				title: 'Lease signing',
				projectId: PROJECT,
				operation: 'created',
				url: null
			}
		]);
		expect(
			affected(
				'update_calendar_event',
				'cal.event.update',
				{ onto_event_id: EVENT },
				{
					ok: true,
					event_id: EVENT
				}
			)
		).toMatchObject([{ kind: 'event', id: EVENT, operation: 'updated' }]);
		expect(
			affected(
				'delete_calendar_event',
				'cal.event.delete',
				{ event_id: 'g-1' },
				{
					ok: true,
					event_id: null,
					google_event_id: 'g-1',
					deleted: true
				}
			)
		).toMatchObject([{ kind: 'event', id: 'g-1', operation: 'deleted' }]);
		// The provider half failed as data: nothing to show as saved.
		expect(
			affected(
				'create_calendar_event',
				'cal.event.create',
				{ title: 'x' },
				{
					ok: false,
					error_code: 'calendar_unavailable',
					requires_user_action: false
				}
			)
		).toEqual([]);
		expect(
			affected(
				'delete_calendar_event',
				'cal.event.delete',
				{ event_id: 'g-1' },
				{
					ok: true,
					already_missing: true
				}
			)
		).toEqual([]);
	});

	it('reports the project whose calendar was set', () => {
		expect(
			affected(
				'set_project_calendar',
				'cal.project.set',
				{ project_id: PROJECT },
				{
					ok: true,
					project_id: PROJECT
				}
			)
		).toMatchObject([{ kind: 'project', id: PROJECT, operation: 'updated' }]);
	});

	it('reports a table write as its document, with the rows it changed', () => {
		const receipt = {
			document: { id: DOC, project_id: PROJECT, title: 'Leads', type_key: 'document.table' },
			table: { row_count: 12, revision: 4 },
			table_change: {
				kind: 'table_change',
				document_id: DOC,
				rows_added: 2,
				rows_updated: 3,
				rows_deleted: 1,
				cells_changed: 9,
				inverse_ops: []
			}
		};
		expect(
			affected('update_onto_table_rows', 'onto.table.rows.update', { table_id: DOC }, receipt)
		).toEqual([
			{
				kind: 'document',
				id: DOC,
				title: 'Leads',
				projectId: PROJECT,
				operation: 'updated',
				url: `/projects/${PROJECT}?doc=${DOC}`,
				table: true,
				rows_changed: 6
			}
		]);
		expect(
			affected('create_onto_table', 'onto.table.create', {}, { document: receipt.document })
		).toMatchObject([{ kind: 'document', id: DOC, operation: 'created', table: true }]);
	});

	it('reports unlinks, mentions and delegated runs', () => {
		expect(
			affected(
				'unlink_onto_edge',
				'onto.edge.unlink',
				{ edge_id: 'e-1', project_id: PROJECT },
				{
					deleted: true
				}
			)
		).toMatchObject([{ kind: 'edge', id: 'e-1', operation: 'unlinked' }]);
		expect(
			affected(
				'tag_onto_entity',
				'x.misc.tag_onto_entity',
				{},
				{
					project_id: PROJECT,
					entity_type: 'task',
					entity_id: TASK,
					mentioned_user_ids: ['u'],
					notified_user_ids: ['u']
				}
			)
		).toMatchObject([
			{
				kind: 'task',
				id: TASK,
				operation: 'mentioned',
				url: `/projects/${PROJECT}?entity=task&entity_id=${TASK}`
			}
		]);
		expect(
			affected(
				'delegate_task',
				'util.agent.delegate',
				{},
				{
					ok: true,
					run_ids: ['run-1'],
					label: 'Tidy tasks',
					project_id: PROJECT,
					requires_user_action: false
				}
			)
		).toMatchObject([
			{ kind: 'agent_run', id: 'run-1', title: 'Tidy tasks', operation: 'delegated' }
		]);
	});

	it('reports nothing for a change waiting on the person, or one that changed nothing', () => {
		expect(
			affected(
				'update_onto_document',
				'onto.document.update',
				{ document_id: DOC },
				{
					status: 'confirmation_required',
					requires_user_action: true,
					client_action: { field_changes: [{ field: 'title', before: 'a', after: 'b' }] }
				}
			)
		).toEqual([]);
		expect(
			affected(
				'move_onto_task',
				'onto.task.move',
				{ task_id: TASK },
				{
					status: 'confirmation_required',
					requires_user_action: true,
					task: { id: TASK, project_id: PROJECT }
				}
			)
		).toEqual([]);
		expect(
			affected(
				'move_onto_task',
				'onto.task.move',
				{ task_id: TASK },
				{
					status: 'already_moved',
					requires_user_action: false,
					task: { id: TASK, project_id: PROJECT }
				}
			)
		).toEqual([]);
		expect(
			affected(
				'move_onto_task',
				'onto.task.move',
				{ task_id: TASK },
				{
					status: 'moved',
					requires_user_action: false,
					task: { id: TASK, project_id: PROJECT, title: 'Sign lease' }
				}
			)
		).toMatchObject([{ kind: 'task', id: TASK, operation: 'moved' }]);
		expect(
			affected(
				'link_onto_entities',
				'onto.edge.link',
				{},
				{
					created: 0,
					edge_id: 'e-1',
					edge: { id: 'e-1', project_id: PROJECT }
				}
			)
		).toEqual([]);
	});
});
