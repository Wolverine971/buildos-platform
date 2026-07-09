// apps/web/src/lib/services/agentic-chat/tools/core/affected-entities.test.ts
import { describe, expect, it } from 'vitest';
import { extractAffectedEntitiesFromToolExecution } from './affected-entities';

describe('affected entity extraction', () => {
	it('infers entity refs from ontology write results', () => {
		const refs = extractAffectedEntitiesFromToolExecution({
			id: 'call-1',
			tool_name: 'create_onto_task',
			gateway_op: 'onto.task.create',
			arguments: {
				title: 'Launch checklist',
				project_id: 'project-1'
			},
			result: {
				task: {
					id: 'task-1',
					title: 'Launch checklist',
					project_id: 'project-1'
				}
			},
			success: true
		});

		expect(refs).toEqual([
			{
				kind: 'task',
				id: 'task-1',
				title: 'Launch checklist',
				projectId: 'project-1',
				operation: 'created',
				url: '/projects/project-1?entity=task&entity_id=task-1'
			}
		]);
	});

	it('prefers persisted affected entity refs when present', () => {
		const refs = extractAffectedEntitiesFromToolExecution({
			tool_name: 'update_onto_document',
			gateway_op: 'onto.document.update',
			arguments: { document_id: 'doc-1' },
			result: { document: { id: 'doc-2' } },
			success: true,
			affected_entities: [
				{
					kind: 'documents',
					entity_id: 'doc-1',
					title: 'Brief',
					project_id: 'project-1',
					operation: 'update'
				}
			]
		});

		expect(refs).toEqual([
			{
				kind: 'document',
				id: 'doc-1',
				title: 'Brief',
				projectId: 'project-1',
				operation: 'updated',
				url: '/projects/project-1?doc=doc-1'
			}
		]);
	});

	it('does not infer affected entities for failed executions', () => {
		expect(
			extractAffectedEntitiesFromToolExecution({
				tool_name: 'create_onto_goal',
				gateway_op: 'onto.goal.create',
				arguments: { title: 'Revenue', project_id: 'project-1' },
				success: false
			})
		).toEqual([]);
	});
});
