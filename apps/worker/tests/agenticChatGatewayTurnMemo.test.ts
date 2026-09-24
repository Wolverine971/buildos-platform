// apps/worker/tests/agenticChatGatewayTurnMemo.test.ts
import { describe, expect, it } from 'vitest';
import { gatewayMemoForTurn } from '../src/workers/agentic-chat/mutations/gateway-turn-memo';

const TURN = 'a1000000-0000-4000-8000-000000000001';

describe('gateway lookup memo per turn execution', () => {
	it('gives every write in one turn execution the same memo', () => {
		const first = gatewayMemoForTurn({ turnRunId: TURN, executionGeneration: 1 }, 1_000);
		const second = gatewayMemoForTurn({ turnRunId: TURN, executionGeneration: 1 }, 2_000);
		expect(second).toBe(first);
	});

	it('starts a recovered execution and another turn from fresh lookups', () => {
		const original = gatewayMemoForTurn({ turnRunId: TURN, executionGeneration: 1 }, 1_000);
		expect(gatewayMemoForTurn({ turnRunId: TURN, executionGeneration: 2 }, 1_000)).not.toBe(
			original
		);
		expect(
			gatewayMemoForTurn(
				{ turnRunId: 'a1000000-0000-4000-8000-000000000002', executionGeneration: 1 },
				1_000
			)
		).not.toBe(original);
	});

	it('expires a memo after the turn could still be running', () => {
		const original = gatewayMemoForTurn({ turnRunId: TURN, executionGeneration: 3 }, 0);
		const later = gatewayMemoForTurn({ turnRunId: TURN, executionGeneration: 3 }, 11 * 60_000);
		expect(later).not.toBe(original);
	});
});
