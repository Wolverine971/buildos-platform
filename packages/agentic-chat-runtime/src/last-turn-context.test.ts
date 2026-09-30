// packages/agentic-chat-runtime/src/last-turn-context.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildLastTurnContext,
	buildLastTurnContextDraftV1,
	buildLastTurnContinuityHint
} from './last-turn-context';
import { CONTROL_TOOL_NAMES } from './loop/tool-classification';
import { parseRequestExpectation } from './loop/request-expectation';

describe('portable last-turn context builder', () => {
	it('carries partial cleanup scope and actual saved ids as untrusted recall for an explicit continuation', () => {
		const id = 'da000000-0000-4000-8000-000000000001';
		const sha = 'a'.repeat(64);
		const request_expectation = {
			outcomes: [
				{
					id: 'create',
					action: 'create',
					entity_kind: 'task',
					label: 'first',
					changes: [{ field: 'title', value: 'First' }],
					minimum_successful_effects: 1
				},
				{
					id: 'archive',
					action: 'archive',
					entity_kind: 'task',
					target_ids: ['da000000-0000-4000-8000-000000000002'],
					required_fields: ['archived'],
					minimum_successful_effects: 1
				}
			]
		};
		const draft = buildLastTurnContextDraftV1({
			assistantText: 'Saved First; the archive is pending.',
			userMessage: 'Create First and archive the old task.',
			contextType: 'global',
			toolExecutions: [
				{
					toolCall: {
						id: 'approval',
						type: 'function',
						function: {
							name: 'approve_mutation_batch_review',
							arguments: JSON.stringify({ batch_sha256: sha, request_expectation })
						}
					},
					result: {
						tool_call_id: 'approval',
						success: true,
						result: {
							status: 'mutation_batch_review_approved',
							batch_sha256: sha,
							request_expectation
						}
					}
				},
				{
					toolCall: {
						id: 'create',
						type: 'function',
						function: {
							name: 'create_onto_task',
							arguments: JSON.stringify({ title: 'First' })
						}
					},
					result: {
						tool_call_id: 'create',
						success: true,
						result: { task: { id, title: 'First' } }
					}
				}
			]
		});
		expect(draft.cleanup).toMatchObject({
			version: 1,
			request_expectation,
			manifest: {
				items: [{ status: 'saved', targetId: id, title: 'First' }, { status: 'pending' }]
			}
		});
		const hint = buildLastTurnContinuityHint({ ...draft, timestamp: '2026-09-29T00:00:00Z' });
		expect(hint).toContain('untrusted recall; verify current records');
		expect(hint).toContain(id);
		expect(hint).toContain('pending');
	});
	it('omits oversized cleanup recall whole so the next turn stays admissible', () => {
		const request_expectation = {
			outcomes: Array.from({ length: 2 }, (_, group) => ({
				id: `archive-${group}`,
				action: 'archive',
				entity_kind: 'task',
				description: 'x'.repeat(240),
				target_ids: Array.from(
					{ length: 50 },
					(_, i) => `da000000-0000-4000-8000-${String(group * 50 + i).padStart(12, '0')}`
				),
				required_fields: ['archived'],
				minimum_successful_effects: 50
			}))
		};
		const sha = 'a'.repeat(64);
		expect(parseRequestExpectation(request_expectation)).not.toBeNull();
		const draft = buildLastTurnContextDraftV1({
			assistantText: 'Cleanup is pending.',
			userMessage: 'Continue the cleanup.',
			contextType: 'global',
			toolExecutions: [
				{
					toolCall: {
						id: 'approval',
						type: 'function',
						function: {
							name: 'approve_mutation_batch_review',
							arguments: JSON.stringify({ batch_sha256: sha, request_expectation })
						}
					},
					result: {
						tool_call_id: 'approval',
						success: true,
						result: {
							status: 'mutation_batch_review_approved',
							batch_sha256: sha,
							request_expectation
						}
					}
				}
			]
		});
		expect(draft).not.toHaveProperty('cleanup');
		expect(JSON.stringify(draft).length).toBeLessThan(32 * 1024);
		// The same limit applies to client-supplied recall before prompt preparation.
		const hint = buildLastTurnContinuityHint({
			...draft,
			timestamp: '2026-09-29T00:00:00Z',
			cleanup: {
				version: 1,
				request_expectation,
				manifest: { version: 1, items: [], extra: 'x'.repeat(24_000) }
			}
		});
		expect(hint).not.toContain('Prior partial cleanup');
		expect(hint).toContain('Cleanup is pending.');
	});
	it('builds the same continuity payload before the database supplies its timestamp', () => {
		const input = {
			assistantText: 'Updated the launch task.',
			userMessage: 'Please check the launch task.',
			contextType: 'global' as const,
			toolExecutions: [
				{
					toolCall: {
						id: 'provider-call-1',
						type: 'function' as const,
						function: { name: 'onto_task_read', arguments: '{}' }
					},
					result: {
						tool_call_id: 'provider-call-1',
						success: true,
						result: {
							task: {
								id: 'da000000-0000-4000-8000-000000000001',
								title: 'Launch task'
							}
						}
					}
				}
			]
		};
		const draft = buildLastTurnContextDraftV1(input);

		expect(draft).toMatchObject({
			summary: 'Updated the launch task.',
			context_type: 'global',
			data_accessed: ['onto_task_read'],
			entities: {
				tasks: [
					{
						id: 'da000000-0000-4000-8000-000000000001',
						name: 'Launch task'
					}
				]
			}
		});
		expect(draft).not.toHaveProperty('timestamp');
		expect(buildLastTurnContext({ ...input, timestamp: '2026-08-04T12:00:00.000Z' })).toEqual({
			...draft,
			timestamp: '2026-08-04T12:00:00.000Z'
		});
	});

	it('keeps harness control tools out of data_accessed (F-11)', () => {
		const call = (name: string, id: string) => ({
			toolCall: {
				id,
				type: 'function' as const,
				function: { name, arguments: '{}' }
			},
			result: { tool_call_id: id, success: true, result: { ok: true } }
		});
		const draft = buildLastTurnContextDraftV1({
			assistantText: 'Marked the launch task done.',
			userMessage: 'Mark the launch task done.',
			contextType: 'project',
			entityId: 'da000000-0000-4000-8000-0000000000aa',
			toolExecutions: [
				call('get_onto_task_details', 'c1'),
				call('declare_turn_contract', 'c2'),
				call('approve_turn_contract_review', 'c3'),
				call('update_onto_task', 'c4'),
				call('approve_mutation_batch_review', 'c5'),
				call('request_proposal_revision', 'c6'),
				call('declare_read_only_turn', 'c7'),
				call('request_turn_clarification', 'c8'),
				call('cancel_turn_contract', 'c9')
			]
		});
		expect(draft.data_accessed).toEqual(['get_onto_task_details', 'update_onto_task']);
	});

	it('hides exactly the control-tool set the loop classifier uses', () => {
		const draft = buildLastTurnContextDraftV1({
			assistantText: '',
			userMessage: '',
			contextType: 'global',
			toolExecutions: Array.from(CONTROL_TOOL_NAMES).map((name, index) => ({
				toolCall: {
					id: `ctl-${index}`,
					type: 'function' as const,
					function: { name, arguments: '{}' }
				},
				result: { tool_call_id: `ctl-${index}`, success: true, result: {} }
			}))
		});
		expect(draft.data_accessed).toEqual([]);
	});

	it('retains the legacy UUID version and variant filter', () => {
		const draft = buildLastTurnContextDraftV1({
			assistantText: '[[task:da000000-0000-0000-0000-000000000001|Not a standards UUID]]',
			userMessage: '',
			contextType: 'global',
			toolExecutions: []
		});
		expect(draft.entities).toEqual({});
	});
});
