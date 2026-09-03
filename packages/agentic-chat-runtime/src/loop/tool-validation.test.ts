import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import { REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION } from '../catalog/definitions/controls';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';
import { executeAgenticChatStandardControlToolV1 } from './turn-contract';
import { validateToolCalls } from './tool-validation';

beforeAll(() => {
	provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} }));
});

describe('clarification semantic preflight', () => {
	const candidates = [
		{ id: 'alpha', label: 'Launch email', kind: 'task' },
		{ id: 'beta', label: 'Investor email', kind: 'task' }
	];

	it.each([
		['paraphrased candidates', 'Should I update the launch or investor one?', candidates],
		['missing candidate', 'Should I update Launch email?', candidates],
		['invalid candidate set', 'Which email should I update?', [{ label: '' }]]
	])(
		'returns repairable feedback for %s before control execution',
		(_name, question, choices) => {
			const args = { reason: 'Two tasks match the request.', question, candidates: choices };
			const call: ChatToolCall = {
				id: 'clarification-1',
				type: 'function',
				function: { name: 'request_turn_clarification', arguments: JSON.stringify(args) }
			};
			const execution = executeAgenticChatStandardControlToolV1({
				toolName: 'request_turn_clarification',
				arguments: args
			});
			if (execution.success) throw new Error('Fixture must fail execution validation');

			const issues = validateToolCalls([call], [REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION]);
			expect(issues).toEqual([
				expect.objectContaining({ toolCall: call, errors: [execution.error] })
			]);
		}
	);

	it('accepts a corrected question that names every candidate', () => {
		const args = {
			reason: 'Two tasks match the request.',
			question: 'Should I update Launch email or Investor email?',
			candidates
		};
		expect(
			validateToolCalls(
				[
					{
						id: 'clarification-repaired',
						type: 'function',
						function: {
							name: 'request_turn_clarification',
							arguments: JSON.stringify(args)
						}
					}
				],
				[REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION]
			)
		).toEqual([]);
	});
});
