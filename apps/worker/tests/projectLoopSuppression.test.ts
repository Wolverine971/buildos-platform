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

	it('returns null only when a suggestion has no ops, no evidence, and no title', () => {
		expect(suggestionSuppressionKey({ kind: 'drift', operations: [] })).toBeNull();
		expect(suggestionSuppressionKey({ kind: 'something_else', operations: [] })).toBeNull();
		expect(suggestionSuppressionKey({ kind: 'doc_org', operations: null })).toBeNull();
	});

	// tasker/28 WP-2: operation-free findings (drift, audit_recommendation) used
	// to return null and were invisible to deterministic suppression + rotation.
	// They now fall back to evidence entities, then normalized title tokens.
	describe('fallback keys for operation-free findings', () => {
		it('keys drift on its evidence entities, order-insensitively', () => {
			const forward = suggestionSuppressionKey({
				kind: 'drift',
				operations: [],
				evidence_refs: [
					{ entity_type: 'document', entity_id: 'doc-1', title: 'Plan' },
					{ entity_type: 'task', entity_id: 'task-9', title: 'Ship' }
				]
			});
			const reordered = suggestionSuppressionKey({
				kind: 'drift',
				operations: [],
				evidence_refs: [
					{ entity_type: 'task', entity_id: 'task-9', title: 'Ship' },
					{ entity_type: 'document', entity_id: 'doc-1', title: 'Plan' }
				]
			});
			expect(forward).toBe('drift:ev:doc-1|task-9');
			expect(reordered).toBe(forward);
		});

		it('namespaces evidence keys by kind (no cross-kind suppression)', () => {
			const drift = suggestionSuppressionKey({
				kind: 'drift',
				operations: [],
				evidence_refs: [{ entity_type: 'document', entity_id: 'doc-1', title: 'Plan' }]
			});
			const audit = suggestionSuppressionKey({
				kind: 'audit_recommendation',
				operations: [],
				evidence_refs: [{ entity_type: 'document', entity_id: 'doc-1', title: 'Plan' }]
			});
			expect(drift).toBe('drift:ev:doc-1');
			expect(audit).toBe('audit_recommendation:ev:doc-1');
			expect(drift).not.toBe(audit);
		});

		it('falls back to normalized title tokens when there is no evidence', () => {
			const a = suggestionSuppressionKey({
				kind: 'audit_recommendation',
				operations: [],
				title: 'Record the Next Decision, and its risks!'
			});
			const b = suggestionSuppressionKey({
				kind: 'audit_recommendation',
				operations: [],
				title: 'risks and the next decision: record its...'
			});
			expect(a).not.toBeNull();
			expect(a).toBe(b);
		});

		it('prefers the operation-derived key when operations resolve', () => {
			const key = suggestionSuppressionKey({
				kind: 'doc_outdated',
				operations: [
					{ tool: 'update_onto_document', args: { document_id: 'doc-2', props: {} } }
				],
				evidence_refs: [{ entity_type: 'document', entity_id: 'doc-9', title: 'Other' }],
				title: 'Looks outdated: Something'
			});
			expect(key).toBe('doc_outdated:doc-2');
		});
	});
});
