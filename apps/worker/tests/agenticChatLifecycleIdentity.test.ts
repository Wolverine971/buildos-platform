// apps/worker/tests/agenticChatLifecycleIdentity.test.ts
import { describe, expect, it } from 'vitest';
import { createStableAgenticChatLifecycleTransitionIdV1 } from '../src/workers/agentic-chat/lifecycleIdentity';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';

describe('Agentic Chat executor lifecycle identity', () => {
	it('is stable per turn and lifecycle stage without runtime randomness', () => {
		const acknowledged = createStableAgenticChatLifecycleTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			stage: 'acknowledged'
		});
		const finalizing = createStableAgenticChatLifecycleTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			stage: 'finalizing'
		});
		const session = createStableAgenticChatLifecycleTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			stage: 'session'
		});
		const contextUsage = createStableAgenticChatLifecycleTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			stage: 'context_usage'
		});
		const timing = createStableAgenticChatLifecycleTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			stage: 'timing'
		});
		const error = createStableAgenticChatLifecycleTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			stage: 'error'
		});

		expect(
			createStableAgenticChatLifecycleTransitionIdV1({
				turnRunId: TURN_RUN_ID,
				stage: 'acknowledged'
			})
		).toBe(acknowledged);
		expect(acknowledged).toBe('10c73f7a-9ff0-55a2-a158-180066d49198');
		expect(finalizing).toBe('189ab196-c910-547c-b667-9c81d3ebc32f');
		expect(session).toBe('e426f2ab-ba50-56d8-83d1-de6b150b16b0');
		expect(contextUsage).toBe('857d7701-d7fc-5706-89b0-1068e227c482');
		expect(timing).toBe('ea1a6d82-0b8b-5dc8-af61-0b663d90ec6b');
		expect(error).toBe('6e2f3cd9-19fd-562c-b46c-769784b0f3df');
		expect(finalizing).not.toBe(acknowledged);
	});

	it('rejects an invalid turn or lifecycle stage', () => {
		expect(() =>
			createStableAgenticChatLifecycleTransitionIdV1({
				turnRunId: 'not-a-turn',
				stage: 'acknowledged'
			})
		).toThrow('turnRunId must be a canonical UUID');
		expect(() =>
			createStableAgenticChatLifecycleTransitionIdV1({
				turnRunId: TURN_RUN_ID,
				stage: 'unknown' as never
			})
		).toThrow('lifecycle stage is invalid');
	});
});
