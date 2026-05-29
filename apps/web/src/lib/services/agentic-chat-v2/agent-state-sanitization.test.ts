// apps/web/src/lib/services/agentic-chat-v2/agent-state-sanitization.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentState } from '$lib/types/agent-chat-enhancement';
import {
	buildEmptyAgentState,
	isValidAgentStateEntityId,
	sanitizeAgentStateForPrompt,
	sanitizeUuidStringArray
} from './agent-state-sanitization';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('buildEmptyAgentState', () => {
	it('returns a fully-initialized empty state for the session', () => {
		const state = buildEmptyAgentState('session-1');
		expect(state).toEqual({
			sessionId: 'session-1',
			current_understanding: { entities: [], dependencies: [] },
			assumptions: [],
			expectations: [],
			tentative_hypotheses: [],
			items: []
		});
	});
});

describe('isValidAgentStateEntityId', () => {
	it('accepts a real UUID', () => {
		expect(isValidAgentStateEntityId(UUID_A)).toBe(true);
	});

	it('rejects non-strings, blanks, placeholders, and non-UUIDs', () => {
		expect(isValidAgentStateEntityId(undefined)).toBe(false);
		expect(isValidAgentStateEntityId('')).toBe(false);
		expect(isValidAgentStateEntityId('   ')).toBe(false);
		expect(isValidAgentStateEntityId('abc...')).toBe(false);
		expect(isValidAgentStateEntityId('not-a-uuid')).toBe(false);
	});

	it('trims surrounding whitespace before validating', () => {
		expect(isValidAgentStateEntityId(`  ${UUID_A}  `)).toBe(true);
	});
});

describe('sanitizeUuidStringArray', () => {
	it('returns undefined for non-arrays', () => {
		expect(sanitizeUuidStringArray('nope')).toBeUndefined();
		expect(sanitizeUuidStringArray(undefined)).toBeUndefined();
	});

	it('keeps only valid UUIDs, trims, and dedupes', () => {
		expect(sanitizeUuidStringArray([UUID_A, `  ${UUID_A}  `, 'bad', UUID_B])).toEqual([
			UUID_A,
			UUID_B
		]);
	});

	it('returns undefined when nothing valid survives', () => {
		expect(sanitizeUuidStringArray(['bad', 'abc...'])).toBeUndefined();
	});
});

describe('sanitizeAgentStateForPrompt', () => {
	it('drops malformed entity/dependency ids and trims valid ones', () => {
		const state: AgentState = {
			sessionId: 'session-1',
			current_understanding: {
				entities: [{ id: `  ${UUID_A}  ` } as any, { id: 'abc...' } as any],
				dependencies: [
					{ from: UUID_A, to: UUID_B } as any,
					{ from: UUID_A, to: 'bad' } as any
				]
			},
			assumptions: [],
			expectations: [
				{ expected_ids: [UUID_A, 'bad'] } as any,
				{ expected_ids: ['nope'] } as any
			],
			tentative_hypotheses: [],
			items: [
				{ relatedEntityIds: [UUID_B, 'bad'] } as any,
				{ relatedEntityIds: ['nope'] } as any
			]
		};

		const result = sanitizeAgentStateForPrompt(state);

		expect(result.current_understanding.entities).toEqual([{ id: UUID_A }]);
		expect(result.current_understanding.dependencies).toEqual([{ from: UUID_A, to: UUID_B }]);
		expect(result.expectations[0].expected_ids).toEqual([UUID_A]);
		expect(result.expectations[1].expected_ids).toBeUndefined();
		expect(result.items[0].relatedEntityIds).toEqual([UUID_B]);
		expect(result.items[1].relatedEntityIds).toBeUndefined();
	});

	it('preserves other top-level fields', () => {
		const state = buildEmptyAgentState('session-9');
		const result = sanitizeAgentStateForPrompt(state);
		expect(result.sessionId).toBe('session-9');
	});
});
