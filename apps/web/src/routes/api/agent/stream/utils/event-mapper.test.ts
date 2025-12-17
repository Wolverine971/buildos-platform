// apps/web/src/routes/api/agent/stream/utils/event-mapper.test.ts
/**
 * Unit tests for event mapper utilities.
 */

import { describe, it, expect, vi } from 'vitest';
import type { StreamEvent } from '$lib/services/agentic-chat/shared/types';
import type { AgentSSEMessage } from '@buildos/shared-types';

// Mock the context-utils module
vi.mock('./context-utils', () => ({
	normalizeContextType: vi.fn((type) => type || 'global')
}));

// Import after mocking
import { mapPlannerEventToSSE, isKnownEventType, getRegisteredEventTypes } from './event-mapper';

// ============================================
// mapPlannerEventToSSE
// ============================================

describe('mapPlannerEventToSSE', () => {
	describe('null/undefined handling', () => {
		it('should return null for null input', () => {
			expect(mapPlannerEventToSSE(null)).toBeNull();
		});

		it('should return null for undefined input', () => {
			expect(mapPlannerEventToSSE(undefined)).toBeNull();
		});
	});

	describe('SSE-only event types (passthrough)', () => {
		it('should pass through focus_active events', () => {
			const event = { type: 'focus_active', data: 'test' } as unknown as AgentSSEMessage;
			const result = mapPlannerEventToSSE(event);
			expect(result).toBe(event);
		});

		it('should pass through focus_changed events', () => {
			const event = { type: 'focus_changed', data: 'test' } as unknown as AgentSSEMessage;
			const result = mapPlannerEventToSSE(event);
			expect(result).toBe(event);
		});

		it('should pass through context_shift events', () => {
			const event = { type: 'context_shift', data: 'test' } as unknown as AgentSSEMessage;
			const result = mapPlannerEventToSSE(event);
			expect(result).toBe(event);
		});
	});

	describe('session event', () => {
		it('should map session event', () => {
			const event: StreamEvent = {
				type: 'session',
				session: { id: 'sess_123', status: 'active' } as any
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'session',
				session: { id: 'sess_123', status: 'active' }
			});
		});
	});

	describe('last_turn_context event', () => {
		it('should map last_turn_context event', () => {
			const event: StreamEvent = {
				type: 'last_turn_context',
				context: {
					summary: 'Previous turn',
					entities: {},
					context_type: 'project',
					timestamp: '2024-01-01'
				}
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'last_turn_context',
				context: {
					summary: 'Previous turn',
					entities: {},
					context_type: 'project',
					timestamp: '2024-01-01'
				}
			});
		});
	});

	describe('context_usage event', () => {
		it('should map context_usage event', () => {
			const event: StreamEvent = {
				type: 'context_usage',
				usage: { tokensUsed: 1000, maxTokens: 4000 }
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'context_usage',
				usage: { tokensUsed: 1000, maxTokens: 4000 }
			});
		});
	});

	describe('agent_state event', () => {
		it('should map agent_state event with context normalization', () => {
			const event: StreamEvent = {
				type: 'agent_state',
				state: 'thinking',
				contextType: 'project',
				details: 'Processing request'
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'agent_state',
				state: 'thinking',
				contextType: 'project', // normalizeContextType is mocked
				details: 'Processing request'
			});
		});
	});

	describe('clarifying_questions event', () => {
		it('should map clarifying_questions event', () => {
			const event: StreamEvent = {
				type: 'clarifying_questions',
				questions: [{ id: 'q1', question: 'What is the deadline?' }]
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'clarifying_questions',
				questions: [{ id: 'q1', question: 'What is the deadline?' }]
			});
		});

		it('should default to empty array if questions undefined', () => {
			const event = {
				type: 'clarifying_questions',
				questions: undefined
			} as unknown as StreamEvent;

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'clarifying_questions',
				questions: []
			});
		});
	});

	describe('plan events', () => {
		it('should map plan_created event', () => {
			const event: StreamEvent = {
				type: 'plan_created',
				plan: { id: 'plan_1', steps: [] } as any
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toMatchObject({
				type: 'plan_created',
				plan: expect.objectContaining({
					id: 'plan_1',
					steps: []
				})
			} satisfies AgentSSEMessage);
		});

		it('should map plan_ready_for_review event', () => {
			const event = {
				type: 'plan_ready_for_review',
				plan: { id: 'plan_1' },
				summary: 'Plan summary',
				recommendations: ['rec1', 'rec2']
			} as unknown as StreamEvent;

			const result = mapPlannerEventToSSE(event);

			expect(result).toMatchObject({
				type: 'plan_ready_for_review',
				plan: expect.objectContaining({ id: 'plan_1' }),
				summary: 'Plan summary',
				recommendations: ['rec1', 'rec2']
			} satisfies AgentSSEMessage);
		});

		it('should map plan_review event', () => {
			const event = {
				type: 'plan_review',
				plan: { id: 'plan_1' },
				verdict: 'approved',
				notes: 'Looks good',
				reviewer: 'system'
			} as unknown as StreamEvent;

			const result = mapPlannerEventToSSE(event);

			expect(result).toMatchObject({
				type: 'plan_review',
				plan: expect.objectContaining({ id: 'plan_1' }),
				verdict: 'approved',
				notes: 'Looks good',
				reviewer: 'system'
			} satisfies AgentSSEMessage);
		});
	});

	describe('step events', () => {
		it('should map step_start event', () => {
			const event: StreamEvent = {
				type: 'step_start',
				step: { id: 'step_1', name: 'Initialize' } as any
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'step_start',
				step: { id: 'step_1', name: 'Initialize' }
			});
		});

		it('should map step_complete event', () => {
			const event: StreamEvent = {
				type: 'step_complete',
				step: { id: 'step_1', name: 'Initialize', status: 'done' } as any
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'step_complete',
				step: { id: 'step_1', name: 'Initialize', status: 'done' }
			});
		});
	});

	describe('executor events', () => {
		it('should map executor_spawned event', () => {
			const event: StreamEvent = {
				type: 'executor_spawned',
				executorId: 'exec_1',
				task: { id: 'task_1', name: 'Create file' } as any
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'executor_spawned',
				executorId: 'exec_1',
				task: { id: 'task_1', name: 'Create file' }
			});
		});

		it('should map executor_result event', () => {
			const event: StreamEvent = {
				type: 'executor_result',
				executorId: 'exec_1',
				result: { success: true, output: 'Done' }
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'executor_result',
				executorId: 'exec_1',
				result: { success: true, output: 'Done' }
			});
		});
	});

	describe('text event', () => {
		it('should map text event', () => {
			const event: StreamEvent = {
				type: 'text',
				content: 'Hello, world!'
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'text',
				content: 'Hello, world!'
			});
		});
	});

	describe('tool events', () => {
		it('should map tool_call event', () => {
			const event: StreamEvent = {
				type: 'tool_call',
				toolCall: {
					id: 'tc_1',
					function: { name: 'create_task', arguments: '{}' }
				} as any
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'tool_call',
				tool_call: {
					id: 'tc_1',
					function: { name: 'create_task', arguments: '{}' }
				}
			});
		});

		it('should map tool_result event', () => {
			const event: StreamEvent = {
				type: 'tool_result',
				result: { tool_call_id: 'tc_1', output: 'Task created' }
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'tool_result',
				result: { tool_call_id: 'tc_1', output: 'Task created' }
			});
		});
	});

	describe('done event', () => {
		it('should map done event with usage', () => {
			const event: StreamEvent = {
				type: 'done',
				usage: { promptTokens: 100, completionTokens: 50 }
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'done',
				usage: { promptTokens: 100, completionTokens: 50 }
			});
		});
	});

	describe('error event', () => {
		it('should map error event with message', () => {
			const event: StreamEvent = {
				type: 'error',
				error: 'Something went wrong'
			};

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'error',
				error: 'Something went wrong'
			});
		});

		it('should default to Unknown error if error is undefined', () => {
			const event = {
				type: 'error',
				error: undefined
			} as unknown as StreamEvent;

			const result = mapPlannerEventToSSE(event);

			expect(result).toEqual({
				type: 'error',
				error: 'Unknown error'
			});
		});
	});

	describe('unknown event types', () => {
		it('should return null for unknown event types', () => {
			const event = { type: 'unknown_type', data: 'test' } as unknown as StreamEvent;
			const result = mapPlannerEventToSSE(event);
			expect(result).toBeNull();
		});
	});
});

// ============================================
// isKnownEventType
// ============================================

describe('isKnownEventType', () => {
	it('should return true for registered mapper types', () => {
		const knownTypes = [
			'session',
			'last_turn_context',
			'context_usage',
			'agent_state',
			'clarifying_questions',
			'plan_created',
			'plan_ready_for_review',
			'step_start',
			'step_complete',
			'executor_spawned',
			'executor_result',
			'plan_review',
			'text',
			'tool_call',
			'tool_result',
			'done',
			'error'
		];

		for (const type of knownTypes) {
			expect(isKnownEventType(type)).toBe(true);
		}
	});

	it('should return true for SSE-only passthrough types', () => {
		expect(isKnownEventType('focus_active')).toBe(true);
		expect(isKnownEventType('focus_changed')).toBe(true);
		expect(isKnownEventType('context_shift')).toBe(true);
	});

	it('should return false for unknown types', () => {
		expect(isKnownEventType('unknown')).toBe(false);
		expect(isKnownEventType('custom_event')).toBe(false);
		expect(isKnownEventType('')).toBe(false);
	});
});

// ============================================
// getRegisteredEventTypes
// ============================================

describe('getRegisteredEventTypes', () => {
	it('should return array of registered event types', () => {
		const types = getRegisteredEventTypes();

		expect(Array.isArray(types)).toBe(true);
		expect(types.length).toBeGreaterThan(0);
	});

	it('should include core event types', () => {
		const types = getRegisteredEventTypes();

		expect(types).toContain('session');
		expect(types).toContain('text');
		expect(types).toContain('done');
		expect(types).toContain('error');
	});

	it('should include all mapped event types', () => {
		const types = getRegisteredEventTypes();
		const expectedTypes = [
			'session',
			'last_turn_context',
			'context_usage',
			'agent_state',
			'clarifying_questions',
			'plan_created',
			'plan_ready_for_review',
			'step_start',
			'step_complete',
			'executor_spawned',
			'executor_result',
			'plan_review',
			'text',
			'tool_call',
			'tool_result',
			'done',
			'error'
		];

		for (const expected of expectedTypes) {
			expect(types).toContain(expected);
		}
	});
});
