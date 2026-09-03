// packages/agentic-chat-runtime/src/loop/round-analysis.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import { buildRoundToolPattern } from './round-analysis';
import { CONTROL_TOOL_NAMES, isControlToolName } from './tool-classification';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';

beforeAll(() => {
	// Mirror the worker: reads and controls are both `kind: 'read'` in the host
	// catalog, which is exactly why the control check must run before the
	// read classification.
	const entries = [
		{ op: 'onto.project.overview', tool_name: 'get_project_overview', kind: 'read' as const },
		...[...CONTROL_TOOL_NAMES].map((name) => ({
			op: `control.${name}`,
			tool_name: name,
			kind: 'read' as const
		}))
	];
	provideAgenticChatLoopToolCatalog(() => ({
		ops: Object.fromEntries(entries.map((entry) => [entry.op, entry])),
		byToolName: Object.fromEntries(entries.map((entry) => [entry.tool_name, entry]))
	}));
});

function call(name: string, args: Record<string, unknown> = {}): ChatToolCall {
	return {
		id: `call-${name}`,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
}

describe('control rounds in the round tool pattern', () => {
	it('names every harness control the ladder must ignore', () => {
		expect([...CONTROL_TOOL_NAMES].sort()).toEqual([
			'approve_mutation_batch_review',
			'approve_turn_contract_review',
			'cancel_turn_contract',
			'declare_read_only_turn',
			'declare_turn_contract',
			'request_proposal_revision',
			'request_turn_clarification'
		]);
		expect(isControlToolName('declare_turn_contract')).toBe(true);
		expect(isControlToolName('get_project_overview')).toBe(false);
	});

	it('classifies a control-only round as neither read-only nor a write', () => {
		for (const name of CONTROL_TOOL_NAMES) {
			expect(buildRoundToolPattern([call(name)])).toEqual({
				readOps: [],
				researchOps: [],
				hasWriteOps: false
			});
		}
	});

	it('keeps the read of a mixed declare+read round and drops the control', () => {
		const pattern = buildRoundToolPattern([
			call('declare_turn_contract', { outcomes: [] }),
			call('get_project_overview', { project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40' })
		]);
		expect(pattern.hasWriteOps).toBe(false);
		expect(pattern.readOps).toHaveLength(1);
		expect(pattern.readOps[0]).not.toContain('declare');
	});
});
