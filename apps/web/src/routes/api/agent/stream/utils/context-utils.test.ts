// apps/web/src/routes/api/agent/stream/utils/context-utils.test.ts
/**
 * Unit tests for context utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatContextType, ProjectFocus, ChatMessage } from '@buildos/shared-types';
import type { LastTurnContext } from '$lib/types/agent-chat-enhancement';
import type { ContextShiftData } from '../types';

// Mock the logger to avoid noise in tests
vi.mock('$lib/utils/logger', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

// Import after mocking
import {
	normalizeContextType,
	normalizeProjectFocus,
	projectFocusEquals,
	generateOntologyCacheKey,
	assignEntityByPrefix,
	generateLastTurnContext,
	buildContextShiftLastTurnContext,
	buildQuickUsageSnapshot
} from './context-utils';

// ============================================
// normalizeContextType
// ============================================

describe('normalizeContextType', () => {
	it('should return "global" for undefined input', () => {
		expect(normalizeContextType(undefined)).toBe('global');
	});

	it('should return "global" for empty string', () => {
		expect(normalizeContextType('')).toBe('global');
	});

	it('should map "general" to "global" for backwards compatibility', () => {
		expect(normalizeContextType('general')).toBe('global');
	});

	it('should return valid context types unchanged', () => {
		const validTypes: ChatContextType[] = [
			'global',
			'project',
			'calendar',
			'project_audit',
			'project_forecast',
			'project_create',
			'daily_brief_update',
			'brain_dump',
			'ontology'
		];

		for (const type of validTypes) {
			expect(normalizeContextType(type)).toBe(type);
		}
	});

	it('should return "global" for invalid context types', () => {
		expect(normalizeContextType('invalid_type')).toBe('global');
		expect(normalizeContextType('random')).toBe('global');
		expect(normalizeContextType('PROJECT')).toBe('global'); // case sensitive
	});
});

// ============================================
// normalizeProjectFocus
// ============================================

describe('normalizeProjectFocus', () => {
	it('should return null for undefined input', () => {
		expect(normalizeProjectFocus(undefined)).toBeNull();
	});

	it('should return null for null input', () => {
		expect(normalizeProjectFocus(null)).toBeNull();
	});

	it('should return null if projectId is missing', () => {
		const focus = {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: '',
			projectName: 'Test'
		} as ProjectFocus;
		expect(normalizeProjectFocus(focus)).toBeNull();
	});

	it('should normalize a complete focus object', () => {
		const focus: ProjectFocus = {
			focusType: 'task',
			focusEntityId: 'task_123',
			focusEntityName: 'My Task',
			projectId: 'proj_abc',
			projectName: 'My Project'
		};

		const normalized = normalizeProjectFocus(focus);

		expect(normalized).toEqual({
			focusType: 'task',
			focusEntityId: 'task_123',
			focusEntityName: 'My Task',
			projectId: 'proj_abc',
			projectName: 'My Project'
		});
	});

	it('should provide defaults for missing optional fields', () => {
		const focus = {
			projectId: 'proj_abc'
		} as ProjectFocus;

		const normalized = normalizeProjectFocus(focus);

		expect(normalized).toEqual({
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: 'proj_abc',
			projectName: 'Project'
		});
	});
});

// ============================================
// projectFocusEquals
// ============================================

describe('projectFocusEquals', () => {
	it('should return true for two null values', () => {
		expect(projectFocusEquals(null, null)).toBe(true);
	});

	it('should return true for two undefined values', () => {
		expect(projectFocusEquals(undefined, undefined)).toBe(true);
	});

	it('should return true for null and undefined', () => {
		expect(projectFocusEquals(null, undefined)).toBe(true);
	});

	it('should return false when one is null and other has projectId', () => {
		const focus: ProjectFocus = {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: 'proj_abc',
			projectName: 'Test'
		};
		expect(projectFocusEquals(focus, null)).toBe(false);
		expect(projectFocusEquals(null, focus)).toBe(false);
	});

	it('should return true for equivalent focus objects', () => {
		const focus1: ProjectFocus = {
			focusType: 'task',
			focusEntityId: 'task_123',
			focusEntityName: 'My Task',
			projectId: 'proj_abc',
			projectName: 'My Project'
		};
		const focus2: ProjectFocus = {
			focusType: 'task',
			focusEntityId: 'task_123',
			focusEntityName: 'My Task',
			projectId: 'proj_abc',
			projectName: 'My Project'
		};

		expect(projectFocusEquals(focus1, focus2)).toBe(true);
	});

	it('should return false for different project IDs', () => {
		const focus1: ProjectFocus = {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: 'proj_abc',
			projectName: 'Project A'
		};
		const focus2: ProjectFocus = {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: 'proj_xyz',
			projectName: 'Project B'
		};

		expect(projectFocusEquals(focus1, focus2)).toBe(false);
	});

	it('should return false for different focus types', () => {
		const focus1: ProjectFocus = {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: 'proj_abc',
			projectName: 'Project'
		};
		const focus2: ProjectFocus = {
			focusType: 'task',
			focusEntityId: 'task_123',
			focusEntityName: 'Task',
			projectId: 'proj_abc',
			projectName: 'Project'
		};

		expect(projectFocusEquals(focus1, focus2)).toBe(false);
	});
});

// ============================================
// generateOntologyCacheKey
// ============================================

describe('generateOntologyCacheKey', () => {
	it('should generate key from context type when no focus', () => {
		expect(generateOntologyCacheKey(null, 'global')).toBe('global');
		expect(generateOntologyCacheKey(null, 'project')).toBe('project');
	});

	it('should include entity ID when provided without focus', () => {
		expect(generateOntologyCacheKey(null, 'project', 'proj_123')).toBe('project:proj_123');
	});

	it('should generate key from project focus', () => {
		const focus: ProjectFocus = {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: 'proj_abc',
			projectName: 'Test'
		};

		expect(generateOntologyCacheKey(focus, 'project')).toBe('proj_abc:project-wide');
	});

	it('should include focus entity ID when available', () => {
		const focus: ProjectFocus = {
			focusType: 'task',
			focusEntityId: 'task_123',
			focusEntityName: 'My Task',
			projectId: 'proj_abc',
			projectName: 'Test'
		};

		expect(generateOntologyCacheKey(focus, 'project')).toBe('proj_abc:task:task_123');
	});
});

// ============================================
// assignEntityByPrefix
// ============================================

describe('assignEntityByPrefix', () => {
	let entities: LastTurnContext['entities'];

	beforeEach(() => {
		entities = {};
	});

	it('should do nothing for empty entity ID', () => {
		assignEntityByPrefix(entities, '');
		expect(entities).toEqual({});
	});

	it('should assign project IDs', () => {
		assignEntityByPrefix(entities, 'proj_123');
		expect(entities.project_id).toBe('proj_123');
	});

	it('should assign task IDs to array', () => {
		assignEntityByPrefix(entities, 'task_123');
		expect(entities.task_ids).toEqual(['task_123']);
	});

	it('should not duplicate task IDs', () => {
		assignEntityByPrefix(entities, 'task_123');
		assignEntityByPrefix(entities, 'task_123');
		expect(entities.task_ids).toEqual(['task_123']);
	});

	it('should append multiple task IDs', () => {
		assignEntityByPrefix(entities, 'task_123');
		assignEntityByPrefix(entities, 'task_456');
		expect(entities.task_ids).toEqual(['task_123', 'task_456']);
	});

	it('should assign plan IDs', () => {
		assignEntityByPrefix(entities, 'plan_abc');
		expect(entities.plan_id).toBe('plan_abc');
	});

	it('should assign goal IDs to array', () => {
		assignEntityByPrefix(entities, 'goal_xyz');
		expect(entities.goal_ids).toEqual(['goal_xyz']);
	});

	it('should assign document IDs', () => {
		assignEntityByPrefix(entities, 'doc_123');
		expect(entities.document_id).toBe('doc_123');
	});

	it('should assign output IDs', () => {
		assignEntityByPrefix(entities, 'out_456');
		expect(entities.output_id).toBe('out_456');
	});

	it('should ignore unknown prefixes', () => {
		assignEntityByPrefix(entities, 'unknown_123');
		expect(entities).toEqual({});
	});
});

// ============================================
// generateLastTurnContext
// ============================================

describe('generateLastTurnContext', () => {
	it('should return null for empty messages', () => {
		expect(generateLastTurnContext([], 'global')).toBeNull();
	});

	it('should return null for single message', () => {
		const messages = [
			{
				id: '1',
				session_id: 'sess_1',
				user_id: 'user_1',
				role: 'user',
				content: 'Hello',
				created_at: new Date().toISOString()
			}
		] as unknown as ChatMessage[];

		expect(generateLastTurnContext(messages, 'global')).toBeNull();
	});

	it('should return null if no assistant message', () => {
		const messages = [
			{
				id: '1',
				session_id: 'sess_1',
				user_id: 'user_1',
				role: 'user',
				content: 'Hello',
				created_at: new Date().toISOString()
			},
			{
				id: '2',
				session_id: 'sess_1',
				user_id: 'user_1',
				role: 'user',
				content: 'World',
				created_at: new Date().toISOString()
			}
		] as unknown as ChatMessage[];

		expect(generateLastTurnContext(messages, 'global')).toBeNull();
	});

	it('should generate context from user and assistant messages', () => {
		const timestamp = new Date().toISOString();
		const messages = [
			{
				id: '1',
				session_id: 'sess_1',
				user_id: 'user_1',
				role: 'user',
				content: 'What are my tasks for today?',
				created_at: timestamp
			},
			{
				id: '2',
				session_id: 'sess_1',
				user_id: 'user_1',
				role: 'assistant',
				content: 'Here are your tasks...',
				created_at: timestamp
			}
		] as unknown as ChatMessage[];

		const context = generateLastTurnContext(messages, 'project');

		expect(context).not.toBeNull();
		expect(context!.context_type).toBe('project');
		expect(context!.summary).toContain('What are my tasks');
		expect(context!.timestamp).toBe(timestamp);
	});

	it('should extract tool names from tool calls', () => {
		const timestamp = new Date().toISOString();
		const messages = [
			{
				id: '1',
				session_id: 'sess_1',
				user_id: 'user_1',
				role: 'user',
				content: 'Create a new task',
				created_at: timestamp
			},
			{
				id: '2',
				session_id: 'sess_1',
				user_id: 'user_1',
				role: 'assistant',
				content: 'Created task',
				created_at: timestamp,
				tool_calls: [{ id: 'tc_1', function: { name: 'create_task', arguments: '{}' } }]
			}
		] as unknown as ChatMessage[];

		const context = generateLastTurnContext(messages, 'project');

		expect(context!.data_accessed).toContain('create_task');
	});

	it('should extract entities from tool results', () => {
		const messages = [
			{
				id: '1',
				role: 'user',
				content: 'Show me task details',
				created_at: new Date().toISOString()
			},
			{
				id: '2',
				role: 'assistant',
				content: 'Here are the details',
				created_at: new Date().toISOString()
			}
		] as unknown as ChatMessage[];

		const toolResults = [{ entities_accessed: ['task_123', 'proj_abc'] }];

		const context = generateLastTurnContext(messages, 'project', { toolResults });

		expect(context!.entities.task_ids).toContain('task_123');
		expect(context!.entities.project_id).toBe('proj_abc');
	});

	it('should extract entities from tool result payload keys', () => {
		const messages = [
			{
				id: '1',
				role: 'user',
				content: 'Show me project details',
				created_at: new Date().toISOString()
			},
			{
				id: '2',
				role: 'assistant',
				content: 'Here are the details',
				created_at: new Date().toISOString()
			}
		] as unknown as ChatMessage[];

		const projectId = '22222222-2222-2222-2222-222222222222';
		const taskId = '11111111-1111-1111-1111-111111111111';
		const goalId = '33333333-3333-3333-3333-333333333333';
		const planId = '44444444-4444-4444-4444-444444444444';
		const documentId = '55555555-5555-5555-5555-555555555555';
		const outputId = '66666666-6666-6666-6666-666666666666';

		const toolResults = [
			{
				result: {
					tasks: [{ id: taskId, project_id: projectId }],
					goal: { id: goalId },
					plan: { id: planId },
					document: { id: documentId },
					output: { id: outputId }
				}
			}
		];

		const context = generateLastTurnContext(messages, 'project', { toolResults });

		expect(context!.entities.project_id).toBe(projectId);
		expect(context!.entities.task_ids).toContain(taskId);
		expect(context!.entities.goal_ids).toContain(goalId);
		expect(context!.entities.plan_id).toBe(planId);
		expect(context!.entities.document_id).toBe(documentId);
		expect(context!.entities.output_id).toBe(outputId);
	});
});

// ============================================
// buildContextShiftLastTurnContext
// ============================================

describe('buildContextShiftLastTurnContext', () => {
	it('should build context for project shift', () => {
		const shift: ContextShiftData = {
			new_context: 'project',
			entity_type: 'project',
			entity_id: 'proj_123',
			entity_name: 'My Project'
		};

		const context = buildContextShiftLastTurnContext(shift, 'global');

		expect(context.context_type).toBe('project');
		expect(context.entities.project_id).toBe('proj_123');
		expect(context.data_accessed).toEqual(['context_shift']);
		expect(context.summary).toContain('My Project');
	});

	it('should build context for task shift', () => {
		const shift: ContextShiftData = {
			new_context: 'project',
			entity_type: 'task',
			entity_id: 'task_456',
			entity_name: 'Important Task'
		};

		const context = buildContextShiftLastTurnContext(shift, 'project');

		expect(context.context_type).toBe('project');
		expect(context.entities.task_ids).toEqual(['task_456']);
	});

	it('should use default context type if new_context not provided', () => {
		const shift: ContextShiftData = {
			entity_type: 'project',
			entity_id: 'proj_123'
		};

		const context = buildContextShiftLastTurnContext(shift, 'global');

		expect(context.context_type).toBe('global');
	});

	it('should use custom message if provided', () => {
		const shift: ContextShiftData = {
			new_context: 'project',
			entity_type: 'project',
			entity_id: 'proj_123',
			message: 'Switched to project view'
		};

		const context = buildContextShiftLastTurnContext(shift, 'global');

		expect(context.summary).toBe('Switched to project view');
	});

	it('should handle plan entity type', () => {
		const shift: ContextShiftData = {
			new_context: 'project',
			entity_type: 'plan',
			entity_id: 'plan_abc'
		};

		const context = buildContextShiftLastTurnContext(shift, 'global');

		expect(context.entities.plan_id).toBe('plan_abc');
	});

	it('should handle goal entity type', () => {
		const shift: ContextShiftData = {
			new_context: 'project',
			entity_type: 'goal',
			entity_id: 'goal_xyz'
		};

		const context = buildContextShiftLastTurnContext(shift, 'global');

		expect(context.entities.goal_ids).toEqual(['goal_xyz']);
	});

	it('should handle document entity type', () => {
		const shift: ContextShiftData = {
			new_context: 'project',
			entity_type: 'document',
			entity_id: 'doc_123'
		};

		const context = buildContextShiftLastTurnContext(shift, 'global');

		expect(context.entities.document_id).toBe('doc_123');
	});

	it('should handle output entity type', () => {
		const shift: ContextShiftData = {
			new_context: 'project',
			entity_type: 'output',
			entity_id: 'out_456'
		};

		const context = buildContextShiftLastTurnContext(shift, 'global');

		expect(context.entities.output_id).toBe('out_456');
	});
});

// ============================================
// buildQuickUsageSnapshot
// ============================================

describe('buildQuickUsageSnapshot', () => {
	it('should calculate token estimates', () => {
		const messages = [
			{ content: 'Hello world' }, // 11 chars ~ 3 tokens
			{ content: 'This is a longer message for testing' } // 36 chars ~ 9 tokens
		];

		const snapshot = buildQuickUsageSnapshot(messages, 1000);

		// ~47 chars / 4 = ~12 tokens
		expect(snapshot.estimatedTokens).toBe(12);
		expect(snapshot.tokenBudget).toBe(1000);
	});

	it('should return "ok" status when under 85%', () => {
		const messages = [{ content: 'Short' }]; // ~2 tokens

		const snapshot = buildQuickUsageSnapshot(messages, 1000);

		expect(snapshot.status).toBe('ok');
		expect(snapshot.usagePercent).toBeLessThan(85);
	});

	it('should return "near_limit" status between 85-100%', () => {
		// 850 tokens worth of content = 850 * 4 = 3400 chars
		const messages = [{ content: 'x'.repeat(3400) }];

		const snapshot = buildQuickUsageSnapshot(messages, 1000);

		expect(snapshot.status).toBe('near_limit');
	});

	it('should return "over_budget" status when exceeding budget', () => {
		// More than 1000 tokens = 4000+ chars
		const messages = [{ content: 'x'.repeat(4100) }];

		const snapshot = buildQuickUsageSnapshot(messages, 1000);

		expect(snapshot.status).toBe('over_budget');
	});

	it('should cap usage percent at 999', () => {
		// Way over budget
		const messages = [{ content: 'x'.repeat(100000) }];

		const snapshot = buildQuickUsageSnapshot(messages, 100);

		expect(snapshot.usagePercent).toBe(999);
	});

	it('should handle empty content gracefully', () => {
		const messages = [{ content: '' }, { content: undefined as unknown as string }];

		const snapshot = buildQuickUsageSnapshot(messages, 1000);

		expect(snapshot.estimatedTokens).toBe(0);
		expect(snapshot.status).toBe('ok');
	});

	it('should calculate tokens remaining', () => {
		const messages = [{ content: 'x'.repeat(400) }]; // 100 tokens

		const snapshot = buildQuickUsageSnapshot(messages, 1000);

		expect(snapshot.tokensRemaining).toBe(900);
	});

	it('should not have negative tokens remaining', () => {
		const messages = [{ content: 'x'.repeat(8000) }]; // 2000 tokens

		const snapshot = buildQuickUsageSnapshot(messages, 1000);

		expect(snapshot.tokensRemaining).toBe(0);
	});

	it('should set compression metadata to null', () => {
		const snapshot = buildQuickUsageSnapshot([], 1000);

		expect(snapshot.lastCompressedAt).toBeNull();
		expect(snapshot.lastCompression).toBeNull();
	});
});
