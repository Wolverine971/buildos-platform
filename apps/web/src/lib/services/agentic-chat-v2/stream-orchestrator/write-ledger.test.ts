// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/write-ledger.test.ts
import { describe, it, expect } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildWriteLedger,
	buildWriteLedgerMessage,
	formatWriteLedgerMessage
} from './write-ledger';
import type { FastToolExecution } from './shared';

function toolCall(name: string, args: Record<string, unknown>): ChatToolCall {
	return {
		id: `${name}:${JSON.stringify(args).slice(0, 24)}`,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function execution(params: {
	name: string;
	args: Record<string, unknown>;
	result?: unknown;
	success?: boolean;
	error?: string;
}): FastToolExecution {
	const call = toolCall(params.name, params.args);
	const result: ChatToolResult = {
		tool_call_id: call.id,
		result: params.result ?? null,
		success: params.success ?? true,
		error: params.error
	};
	return { toolCall: call, result };
}

describe('buildWriteLedger', () => {
	it('captures successful task creates with returned id, title, and state_key', () => {
		const entries = buildWriteLedger([
			execution({
				name: 'create_onto_task',
				args: {
					project_id: 'proj-1',
					title: 'Revise Chapter 2',
					description: 'dialogue + pacing fixes'
				},
				result: {
					task: {
						id: 'task-1',
						title: 'Revise Chapter 2',
						state_key: 'todo',
						type_key: 'task.create'
					}
				}
			})
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			toolName: 'create_onto_task',
			status: 'success',
			entityId: 'task-1',
			title: 'Revise Chapter 2',
			stateKey: 'todo',
			typeKey: 'task.create'
		});
	});

	it('captures document append strategy from args when result lacks it', () => {
		const entries = buildWriteLedger([
			execution({
				name: 'update_onto_document',
				args: {
					document_id: 'doc-1',
					update_strategy: 'append',
					content: '## Progress\n\n- Chapter 2 complete.'
				},
				result: {
					document: { id: 'doc-1', title: 'Project Overview' }
				}
			})
		]);

		expect(entries[0]).toMatchObject({
			toolName: 'update_onto_document',
			status: 'success',
			entityId: 'doc-1',
			title: 'Project Overview',
			strategy: 'append'
		});
	});

	it('records move_document_in_tree parent assignments for placement claims', () => {
		const entries = buildWriteLedger([
			execution({
				name: 'move_document_in_tree',
				args: {
					project_id: 'proj-1',
					document_id: 'doc-research',
					new_parent_id: 'doc-context',
					new_position: 0
				},
				result: { moved: true }
			})
		]);

		expect(entries[0]).toMatchObject({
			toolName: 'move_document_in_tree',
			status: 'success',
			parentId: 'doc-context'
		});
	});

	it('captures failures with truncated error text', () => {
		const entries = buildWriteLedger([
			execution({
				name: 'update_onto_task',
				args: { task_id: 'task-1', description: 'ok' },
				result: null,
				success: false,
				error:
					'args.description contains internal tool-call markup (parameter_tag). Remove the tool syntax and pass only user-visible content.'
			})
		]);

		expect(entries[0]).toMatchObject({
			toolName: 'update_onto_task',
			status: 'failure'
		});
		expect(entries[0].error).toContain('internal tool-call markup');
	});

	it('skips non-write tools such as list/search/schema/skill_load', () => {
		const entries = buildWriteLedger([
			execution({
				name: 'list_onto_tasks',
				args: { project_id: 'proj-1' },
				result: { tasks: [] }
			}),
			execution({
				name: 'tool_schema',
				args: { op: 'onto.task.update' },
				result: { type: 'tool_schema' }
			}),
			execution({
				name: 'skill_load',
				args: { skill: 'task_management' },
				result: { skill: 'task_management' }
			})
		]);

		expect(entries).toHaveLength(0);
	});
});

describe('formatWriteLedgerMessage', () => {
	it('returns null when there are no writes or failures to surface', () => {
		expect(formatWriteLedgerMessage([])).toBeNull();
	});

	it('renders an XML/YAML-framed ledger with numbered entries and declarative grounding', () => {
		const message = buildWriteLedgerMessage([
			execution({
				name: 'create_onto_task',
				args: { project_id: 'proj-1', title: 'Revise Chapter 2' },
				result: { task: { id: 'task-1', title: 'Revise Chapter 2', state_key: 'todo' } }
			}),
			execution({
				name: 'update_onto_task',
				args: { task_id: 'task-99', description: 'pollute' },
				result: null,
				success: false,
				error: 'args.description contains internal tool-call markup (parameter_tag).'
			})
		]);

		expect(message).not.toBeNull();
		const text = message ?? '';
		// Structured framing: XML wrapper + numbered YAML body + single
		// declarative grounding sentence. Rubric-style imperatives were
		// reverted after replay `1aea16fb` showed Grok-4.1-fast treating them
		// as grading criteria and entering evaluation mode.
		expect(text).toContain('<write_ledger>');
		expect(text).toContain('</write_ledger>');
		expect(text).toContain('successful_writes: # count=1');
		expect(text).toContain('failed_writes: # count=1');
		// Numbered entries (kept from the §15 pass — clean data).
		expect(text).toContain('1. tool: create_onto_task');
		expect(text).toContain('title: Revise Chapter 2');
		expect(text).toContain('state_key: todo');
		expect(text).toContain('1. tool: update_onto_task');
		expect(text).toContain('internal tool-call markup');
		// Declarative grounding sentence (post §16 revert).
		expect(text).toContain('Your next user-facing response names each listed successful write');
		expect(text).toContain(
			'discloses each listed failed write as not persisted'
		);
		expect(text).toContain('Do not claim any state_key');
		// Reverted rubric-style phrasings must be gone (they triggered Grok's
		// evaluation-mode collapse in the 2026-04-17 `1aea16fb` replay).
		expect(text).not.toContain('MUST reference');
		expect(text).not.toContain('Missing a title makes the response incomplete');
		expect(text).not.toContain('Do not batch multiple writes under a single collective noun');
		expect(text).not.toContain('Enumeration requirement');
		// Legacy pre-§15 phrasings must also be gone.
		expect(text).not.toContain('Final-response rules');
		expect(text).not.toContain('Use this ledger as the source of truth');
		expect(text).not.toContain('Ground your next user-facing response strictly');
	});

	it('keeps numbered entries stable across single-write and multi-write turns', () => {
		const message = buildWriteLedgerMessage([
			execution({
				name: 'create_onto_task',
				args: { project_id: 'p', title: 'A' },
				result: { task: { id: 't1', title: 'A' } }
			}),
			execution({
				name: 'create_onto_task',
				args: { project_id: 'p', title: 'B' },
				result: { task: { id: 't2', title: 'B' } }
			}),
			execution({
				name: 'create_onto_document',
				args: { project_id: 'p', title: 'C' },
				result: { document: { id: 'd1', title: 'C' } }
			})
		]);
		const text = message ?? '';
		expect(text).toContain('successful_writes: # count=3');
		expect(text).toContain('1. tool: create_onto_task');
		expect(text).toContain('2. tool: create_onto_task');
		expect(text).toContain('3. tool: create_onto_document');
		// Declarative grounding stays the same regardless of write count — the
		// data structure (numbered list with titles) carries the enumeration
		// signal, not the instruction text.
		expect(text).toContain('Your next user-facing response names each listed successful write');
	});

	it('renders empty-set sentinel when there are no failures or successes in one section', () => {
		const message = buildWriteLedgerMessage([
			execution({
				name: 'create_onto_task',
				args: { project_id: 'proj-1', title: 'Solo success' },
				result: { task: { id: 'task-solo', title: 'Solo success', state_key: 'todo' } }
			})
		]);

		const text = message ?? '';
		expect(text).toContain('failed_writes: # count=0');
		expect(text).toContain('  []');
	});
});
