// apps/worker/tests/agenticChatTurnPhase.test.ts
import { describe, expect, it } from 'vitest';
import type { TurnContract } from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatTurnProviderToolV1 } from '../src/workers/agentic-chat/provider/contracts';
import {
	type TurnPhase,
	type TurnPhaseEvent,
	contractPending,
	dispositionPending,
	mutationReached,
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
const finish: TurnPhaseEvent = { type: 'finish' };

describe('nextTurnPhase (lane-E §1.2 pass ladders)', () => {
	it('(a) pure read / answer: A1 → [X reads → A2]* → finish never leaves the read phases', () => {
		expect(run([read, read, finish])).toEqual(['opening', 'reading', 'reading', 'terminal']);
		expect(run([finish])).toEqual(['opening', 'terminal']);
	});

	it('(a) receipt-grounded final gate still counts as disposition pending', () => {
		const phases = run([
			read,
			{ type: 'gate' },
			read,
			{ type: 'disposition', decision: 'read_only' }
		]);
		expect(phases).toEqual([
			'opening',
			'reading',
			'disposition_gate',
			'disposition_gate',
			'read_only_declared'
		]);
		expect(dispositionPending('disposition_gate')).toBe(true);
		expect(dispositionPending('read_only_declared')).toBe(false);
	});

	it('(b) simple direct write ≤3 ops: A1 → X execute → forced synthesis', () => {
		expect(run([mutation, { type: 'budget', limit: 'force_synthesis' }, finish])).toEqual([
			'opening',
			'mutating',
			'synthesis',
			'terminal'
		]);
		expect(mutationReached('mutating')).toBe(true);
		expect(contractPending('mutating')).toBe(false);
	});

	it('(c) complex write: withheld batch → gate → declare → review → propose → execute → answer', () => {
		const phases = run([
			{ type: 'gate' },
			{ type: 'disposition', decision: 'contract' },
			{ type: 'review', decision: 'approve_contract' },
			read,
			mutation,
			finish
		]);
		expect(phases).toEqual([
			'opening',
			'disposition_gate',
			'contract_declared',
			'contract_reviewed',
			'contract_reviewed',
			'mutating',
			'terminal'
		]);
		expect(contractPending('contract_declared')).toBe(true);
		expect(contractPending('contract_reviewed')).toBe(true);
		expect(contractPending('contract_carve_out')).toBe(false);
	});

	it('(c) a prose revision voids the contract back to the gate; a typed correction re-declares it', () => {
		expect(
			run([
				{ type: 'disposition', decision: 'contract' },
				{ type: 'review', decision: 'revise_contract' }
			])
		).toEqual(['opening', 'contract_declared', 'reading']);
		expect(
			run([
				{ type: 'disposition', decision: 'contract' },
				{ type: 'review', decision: 'correct_contract' },
				{ type: 'review', decision: 'approve_contract' }
			])
		).toEqual(['opening', 'contract_declared', 'contract_declared', 'contract_reviewed']);
	});

	it('(c) the reviewer can downgrade a declared contract to read-only or send the turn to the user', () => {
		expect(
			run([
				{ type: 'disposition', decision: 'contract' },
				{ type: 'review', decision: 'read_only' }
			])
		).toEqual(['opening', 'contract_declared', 'read_only_declared']);
		expect(
			run([
				{ type: 'disposition', decision: 'contract' },
				{ type: 'review', decision: 'clarify' }
			])
		).toEqual(['opening', 'contract_declared', 'clarification']);
	});

	it('(c) the write carve-out is one pass and the completion continuation is one pass after a write', () => {
		const phases = run([
			read,
			read,
			{ type: 'disposition', decision: 'contract' },
			{ type: 'review', decision: 'approve_contract' },
			{ type: 'carve_out' },
			mutation,
			{ type: 'completion' },
			mutation,
			{ type: 'completion' },
			finish
		]);
		expect(phases).toEqual([
			'opening',
			'reading',
			'reading',
			'contract_declared',
			'contract_reviewed',
			'contract_carve_out',
			'mutating',
			'completion',
			'completion',
			'completion',
			'terminal'
		]);
		expect(nextTurnPhase('contract_carve_out', { type: 'carve_out' })).toBe(
			'contract_carve_out'
		);
		expect(nextTurnPhase('reading', { type: 'carve_out' })).toBe('reading');
	});

	it('(d) clarification: A1 request_turn_clarification → tool-free question', () => {
		expect(run([{ type: 'disposition', decision: 'clarification' }, finish])).toEqual([
			'opening',
			'clarification',
			'terminal'
		]);
		expect(surfaceFor('clarification', [])).toEqual({ tools: [], toolChoice: 'none' });
	});

	it('(e) project create: opening gate → declare → review → shell carve-out → execute → completion → execute', () => {
		const phases = run(
			[
				{ type: 'disposition', decision: 'contract' },
				{ type: 'review', decision: 'approve_contract' },
				{ type: 'carve_out' },
				mutation,
				{ type: 'completion' },
				mutation,
				finish
			],
			'disposition_gate'
		);
		expect(phases).toEqual([
			'disposition_gate',
			'contract_declared',
			'contract_reviewed',
			'contract_carve_out',
			'mutating',
			'completion',
			'completion',
			'terminal'
		]);
	});

	it('budget exhaustion forces synthesis from any live phase and terminal is absorbing', () => {
		for (const phase of [
			'opening',
			'reading',
			'contract_reviewed',
			'mutating',
			'read_only_declared'
		] as const) {
			expect(nextTurnPhase(phase, { type: 'budget', limit: 'force_synthesis' })).toBe(
				'synthesis'
			);
		}
		expect(nextTurnPhase('reading', { type: 'budget', limit: 'validation_repairs' })).toBe(
			'reading'
		);
		expect(nextTurnPhase('terminal', read)).toBe('terminal');
		expect(nextTurnPhase('terminal', { type: 'disposition', decision: 'contract' })).toBe(
			'terminal'
		);
	});

	it('control rounds never move the phase and a cancelled contract keeps the gate spent', () => {
		expect(nextTurnPhase('reading', control)).toBe('reading');
		expect(nextTurnPhase('contract_reviewed', control)).toBe('contract_reviewed');
		expect(
			run([
				{ type: 'disposition', decision: 'contract' },
				{ type: 'disposition', decision: 'cancel' },
				read
			])
		).toEqual(['opening', 'contract_declared', 'contract_cancelled', 'contract_cancelled']);
		expect(dispositionPending('contract_cancelled')).toBe(false);
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
	tool('declare_turn_contract'),
	tool('request_turn_clarification'),
	tool('cancel_turn_contract'),
	tool('create_onto_task'),
	tool('move_document_in_tree')
];

function names(surface: ReturnType<typeof surfaceFor>): string[] | null {
	return surface ? surface.tools.map((entry) => entry.function.name) : null;
}

describe('surfaceFor', () => {
	it('mounts the opening surface as given and the full admitted surface once a contract is declared', () => {
		const opening = ADMITTED.filter((entry) => entry.function.name !== 'declare_turn_contract');
		expect(surfaceFor('opening', ADMITTED, { openingTools: opening })).toEqual({
			tools: opening,
			toolChoice: 'auto'
		});
		expect(names(surfaceFor('contract_declared', ADMITTED))).toEqual(
			ADMITTED.map((entry) => entry.function.name)
		);
		expect(surfaceFor('opening', [])).toEqual({ tools: [], toolChoice: 'none' });
	});

	it('mounts only the two gate controls plus pure reads on the disposition gate', () => {
		expect(names(surfaceFor('disposition_gate', ADMITTED))).toEqual([
			'get_project_overview',
			'search_project',
			'declare_turn_contract',
			'request_turn_clarification'
		]);
		expect(surfaceFor('disposition_gate', ADMITTED)?.toolChoice).toBe('required');
		expect(names(surfaceFor('disposition_gate', ADMITTED, { allowReads: false }))).toEqual([
			'declare_turn_contract',
			'request_turn_clarification'
		]);
		expect(surfaceFor('disposition_gate', [tool('get_project_overview')])).toBeNull();
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

	it('scopes the carve-out and completion passes to the contract write tools with scheduling sidecars', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'move-1',
					action: 'move',
					entityKind: 'document',
					targetIds: ['d1000000-0000-4000-8000-000000000001'],
					requiredFields: [],
					minimumSuccessfulEffects: 1
				}
			]
		};
		const carveOut = surfaceFor('contract_carve_out', ADMITTED, {
			contract,
			contextType: 'project'
		});
		expect(names(carveOut)).toEqual(['move_document_in_tree']);
		expect(carveOut?.toolChoice).toBe('auto');
		expect(
			Object.keys(
				(carveOut?.tools[0]?.function.parameters as { properties: Record<string, unknown> })
					.properties
			)
		).toEqual(expect.arrayContaining(['call_ref', 'after']));
		expect(names(surfaceFor('completion', ADMITTED, { contract }))).toEqual([
			'move_document_in_tree'
		]);
		expect(surfaceFor('contract_carve_out', ADMITTED, { contract: null })).toBeNull();
	});

	it('narrows the project-create shell carve-out to create_onto_project only', () => {
		const admitted = [...ADMITTED, tool('create_onto_project')];
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'shell',
					action: 'create',
					entityKind: 'project',
					targetIds: [],
					requiredFields: [],
					minimumSuccessfulEffects: 1
				},
				{
					id: 'tasks',
					action: 'create',
					entityKind: 'task',
					targetIds: [],
					requiredFields: [],
					minimumSuccessfulEffects: 1
				}
			]
		};
		expect(
			names(
				surfaceFor('contract_carve_out', admitted, {
					contract,
					contextType: 'project_create'
				})
			)
		).toEqual(['create_onto_project']);
	});

	it('restores the approved surface on repair, keeping the project-create shell narrow', () => {
		const shell = [tool('create_onto_project')];
		expect(
			names(
				surfaceFor('contract_reviewed', ADMITTED, {
					repair: true,
					contractApproved: true,
					contextType: 'project_create',
					requestTools: shell
				})
			)
		).toEqual(['create_onto_project']);
		expect(
			names(
				surfaceFor('mutating', ADMITTED, {
					repair: true,
					contractApproved: true,
					contextType: 'project'
				})
			)
		).toEqual(ADMITTED.map((entry) => entry.function.name));
		expect(
			names(surfaceFor('disposition_gate', ADMITTED, { repair: true, requestTools: shell }))
		).toEqual(['create_onto_project']);
	});

	it('builds the reviewer lanes from the stable admitted surface', () => {
		expect(
			names(
				surfaceFor('contract_review', ADMITTED, {
					allowRevision: true,
					allowReadOnlyCorrection: true
				})
			)
		).toEqual([
			'approve_turn_contract_review',
			'declare_read_only_turn',
			'request_proposal_revision',
			'request_turn_clarification'
		]);
		expect(names(surfaceFor('contract_review', ADMITTED, { allowRevision: false }))).toEqual([
			'approve_turn_contract_review',
			'request_turn_clarification'
		]);
		expect(surfaceFor('contract_review', [tool('create_onto_task')])).toBeNull();
	});
});
