// apps/worker/tests/projectLoopSuppression.test.ts
//
// Covers the deterministic pre-insert suppression key (project-loops-flow-audit
// -2026-07-04 §3/§4). The key is what stops a fresh run from re-emitting a
// suggestion the user is already looking at or has already decided.
import { describe, expect, it } from 'vitest';
import { suggestionSuppressionKey } from '../src/workers/project-loop/generators';
import type { LoopOperation } from '@buildos/shared-types';

function taskConflictOp(taskId: string, conflictWith: string): LoopOperation {
	return {
		tool: 'update_onto_task',
		args: {
			task_id: taskId,
			project_id: 'project-1',
			props: {
				loop_flagged_conflict: true,
				loop_conflict_kind: 'duplicate',
				loop_conflict_with_task_id: conflictWith,
				loop_conflict_reason: 'same work'
			}
		}
	};
}

describe('suggestionSuppressionKey', () => {
	it('is order-insensitive for a task_conflict pair', () => {
		const forward = suggestionSuppressionKey({
			kind: 'task_conflict',
			operations: [taskConflictOp('task-a', 'task-b')]
		});
		const reversed = suggestionSuppressionKey({
			kind: 'task_conflict',
			operations: [taskConflictOp('task-b', 'task-a')]
		});
		expect(forward).toBe('task_conflict:task-a|task-b');
		expect(reversed).toBe(forward);
	});

	it('separates different task pairs', () => {
		const ab = suggestionSuppressionKey({
			kind: 'task_conflict',
			operations: [taskConflictOp('task-a', 'task-b')]
		});
		const ac = suggestionSuppressionKey({
			kind: 'task_conflict',
			operations: [taskConflictOp('task-a', 'task-c')]
		});
		expect(ab).not.toBe(ac);
	});

	it('returns null for a task_conflict with no resolvable ids', () => {
		expect(
			suggestionSuppressionKey({
				kind: 'task_conflict',
				operations: [{ tool: 'update_onto_task', args: { project_id: 'project-1' } }]
			})
		).toBeNull();
	});

	it('keys doc_org / doc_outdated on their document set and namespaces by kind', () => {
		const orgOps: LoopOperation[] = [
			{
				tool: 'move_document_in_tree',
				args: { document_id: 'doc-2', new_parent_id: 'doc-1' }
			},
			{
				tool: 'move_document_in_tree',
				args: { document_id: 'doc-3', new_parent_id: 'doc-1' }
			}
		];
		const orgKey = suggestionSuppressionKey({ kind: 'doc_org', operations: orgOps });
		// Same documents in a different order collapse to the same key.
		const orgKeyReordered = suggestionSuppressionKey({
			kind: 'doc_org',
			operations: [orgOps[1], orgOps[0]]
		});
		expect(orgKey).toBe('doc_org:doc-2|doc-3');
		expect(orgKeyReordered).toBe(orgKey);

		const outdatedKey = suggestionSuppressionKey({
			kind: 'doc_outdated',
			operations: [
				{ tool: 'update_onto_document', args: { document_id: 'doc-2', props: {} } }
			]
		});
		expect(outdatedKey).toBe('doc_outdated:doc-2');
		// Same entity, different kind → different key (no cross-kind suppression).
		expect(outdatedKey).not.toBe('doc_org:doc-2');
	});

	it('returns null for drift (informational, operation-free) and unknown kinds', () => {
		expect(suggestionSuppressionKey({ kind: 'drift', operations: [] })).toBeNull();
		expect(suggestionSuppressionKey({ kind: 'something_else', operations: [] })).toBeNull();
		expect(suggestionSuppressionKey({ kind: 'doc_org', operations: null })).toBeNull();
	});
});
