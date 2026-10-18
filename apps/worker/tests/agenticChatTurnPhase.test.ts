// apps/worker/tests/agenticChatTurnPhase.test.ts
import { describe, expect, it } from 'vitest';
import type { AgenticChatTurnProviderToolV1 } from '../src/workers/agentic-chat/provider/contracts';
// Importing the worker tool surface installs the worker's own loop catalog,
// which classifies pure reads (production composition imports it first).
import '../src/workers/agentic-chat/provider/tool-surface';
import {
	type TurnPhase,
	type TurnPhaseEvent,
	dispositionPending,
	nextTurnPhase,
	surfaceFor
} from '../src/workers/agentic-chat/provider/turn-phase';

function run(events: readonly TurnPhaseEvent[], start: TurnPhase = 'opening'): TurnPhase[] {
	const phases: TurnPhase[] = [start];
	for (const event of events) phases.push(nextTurnPhase(phases.at(-1)!, event));
	return phases;
}

const read: TurnPhaseEvent = { type: 'tool_round', kind: 'read' };
const control: TurnPhaseEvent = { type: 'tool_round', kind: 'control' };
const mutation: TurnPhaseEvent = { type: 'tool_round', kind: 'mutation' };
const withhold: TurnPhaseEvent = { type: 'withhold_batch' };
const finish: TurnPhaseEvent = { type: 'finish' };

describe('nextTurnPhase (batch-lane pass ladders)', () => {
	it('(a) pure read / answer: A1 → [X reads → A2]* → finish never leaves the read phases', () => {
		expect(run([read, read, finish])).toEqual(['opening', 'reading', 'reading', 'terminal']);
		expect(run([finish])).toEqual(['opening', 'terminal']);
		expect(dispositionPending('opening')).toBe(true);
		expect(dispositionPending('reading')).toBe(true);
	});

	it('(b) simple direct write ≤3 ops: A1 → X execute → forced synthesis', () => {
		expect(run([mutation, { type: 'budget', limit: 'force_synthesis' }, finish])).toEqual([
			'opening',
			'mutating',
			'synthesis',
			'terminal'
		]);
		expect(dispositionPending('mutating')).toBe(false);
	});

	it('(c) complex write: withheld batch → reviewer approval → held calls execute → answer', () => {
		expect(
			run([read, withhold, { type: 'review', decision: 'approve_batch' }, mutation, finish])
		).toEqual([
			'opening',
			'reading',
			'batch_withheld',
			'batch_approved',
			'mutating',
			'terminal'
		]);
		expect(dispositionPending('batch_withheld')).toBe(false);
	});

	it('(c) a revision voids the held batch and the next proposal is withheld again', () => {
		expect(
			run([withhold, { type: 'review', decision: 'revise_batch' }, withhold, control])
		).toEqual(['opening', 'batch_withheld', 'reading', 'batch_withheld', 'batch_withheld']);
	});

	it('(c) a later stage after a reviewed write is withheld for its own review', () => {
		expect(
			run([withhold, { type: 'review', decision: 'approve_batch' }, mutation, withhold])
		).toEqual(['opening', 'batch_withheld', 'batch_approved', 'mutating', 'batch_withheld']);
		// Approval binds only to a held batch.
		expect(nextTurnPhase('reading', { type: 'review', decision: 'approve_batch' })).toBe(
			'reading'
		);
		expect(nextTurnPhase('synthesis', withhold)).toBe('synthesis');
	});

	it('(c) the reviewer can downgrade a held batch to read-only or send the turn to the user', () => {
		expect(run([withhold, { type: 'review', decision: 'read_only' }])).toEqual([
			'opening',
			'batch_withheld',
			'read_only_declared'
		]);
		expect(run([withhold, { type: 'review', decision: 'clarify' }])).toEqual([
			'opening',
			'batch_withheld',
			'clarification'
		]);
	});

	it('(d) clarification: A1 request_turn_clarification → tool-free question', () => {
		expect(run([{ type: 'disposition', decision: 'clarification' }, finish])).toEqual([
			'opening',
			'clarification',
			'terminal'
		]);
		expect(surfaceFor('clarification', [])).toEqual({ tools: [], toolChoice: 'none' });
	});

	it('(e) a proposal card makes the turn read-only', () => {
		expect(run([read, { type: 'disposition', decision: 'read_only' }])).toEqual([
			'opening',
			'reading',
			'read_only_declared'
		]);
		expect(dispositionPending('read_only_declared')).toBe(false);
	});

	it('budget exhaustion forces synthesis from any live phase and terminal is absorbing', () => {
		for (const phase of [
			'opening',
			'reading',
			'batch_withheld',
			'mutating',
			'read_only_declared'
		] as const) {
			expect(nextTurnPhase(phase, { type: 'budget', limit: 'force_synthesis' })).toBe(
				'synthesis'
			);
		}
		expect(nextTurnPhase('terminal', read)).toBe('terminal');
		expect(nextTurnPhase('terminal', withhold)).toBe('terminal');
	});

	it('control rounds never move the phase', () => {
		expect(nextTurnPhase('reading', control)).toBe('reading');
		expect(nextTurnPhase('mutating', control)).toBe('mutating');
		expect(nextTurnPhase('batch_withheld', control)).toBe('batch_withheld');
	});
});

function tool(name: string): AgenticChatTurnProviderToolV1 {
	return {
		type: 'function',
		function: { name, description: name, parameters: { type: 'object', properties: {} } }
	};
}

const ADMITTED = [
	tool('get_project_overview'),
	tool('search_project'),
	tool('request_turn_clarification'),
	tool('create_onto_task'),
	tool('move_document_in_tree')
];

function names(surface: ReturnType<typeof surfaceFor>): string[] | null {
	return surface ? surface.tools.map((entry) => entry.function.name) : null;
}

describe('surfaceFor', () => {
	it('re-mounts the admitted surface on the opening, reading and mutating phases', () => {
		// The opening pass proper is assembled by request-builders; the reducer
		// mounts the admitted surface on a repair.
		for (const phase of ['opening', 'reading', 'mutating'] as const) {
			expect(surfaceFor(phase, ADMITTED)).toEqual({ tools: ADMITTED, toolChoice: 'auto' });
			expect(surfaceFor(phase, ADMITTED, { repair: true })).toEqual({
				tools: ADMITTED,
				toolChoice: 'auto'
			});
		}
		expect(surfaceFor('opening', [])).toEqual({ tools: [], toolChoice: 'none' });
	});

	it('keeps a read-only turn on pure reads, and restores reads plus clarify for its repair', () => {
		expect(names(surfaceFor('read_only_declared', ADMITTED))).toEqual([
			'get_project_overview',
			'search_project'
		]);
		expect(names(surfaceFor('read_only_declared', ADMITTED, { repair: true }))).toEqual([
			'get_project_overview',
			'search_project',
			'request_turn_clarification'
		]);
	});

	it('mounts no acting surface while a batch is held or approved', () => {
		expect(surfaceFor('batch_withheld', ADMITTED)).toEqual({ tools: [], toolChoice: 'none' });
		expect(surfaceFor('batch_approved', ADMITTED)).toEqual({ tools: [], toolChoice: 'none' });
		const interrupted = [tool('create_onto_task')];
		expect(
			names(
				surfaceFor('batch_withheld', ADMITTED, { repair: true, requestTools: interrupted })
			)
		).toEqual(['create_onto_task']);
		for (const phase of ['synthesis', 'terminal'] as const) {
			expect(surfaceFor(phase, ADMITTED)).toEqual({ tools: [], toolChoice: 'none' });
		}
	});

	it('builds the batch reviewer lane from the stable admitted surface', () => {
		expect(
			names(
				surfaceFor('mutation_batch_review', ADMITTED, {
					allowRevision: true,
					allowReadOnlyCorrection: true
				})
			)
		).toEqual([
			'approve_mutation_batch_review',
			'declare_read_only_turn',
			'request_proposal_revision',
			'request_turn_clarification'
		]);
		expect(
			names(surfaceFor('mutation_batch_review', ADMITTED, { allowRevision: false }))
		).toEqual(['approve_mutation_batch_review', 'request_turn_clarification']);
		expect(surfaceFor('mutation_batch_review', ADMITTED)?.toolChoice).toBe('required');
		expect(surfaceFor('mutation_batch_review', [tool('create_onto_task')])).toBeNull();
	});
});
