// apps/web/src/lib/components/agent/agent-chat-tool-presenter.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { ChatContextType } from '@buildos/shared-types';
import {
	createToolPresenter,
	formatCalendarDateLabel,
	formatDateOnlyLabel,
	formatErrorMessage,
	type ToolPresenterContext
} from './agent-chat-tool-presenter';

interface TestHarness {
	ctx: ToolPresenterContext;
	setContextType: (v: ChatContextType | null) => void;
	setEntityId: (v: string | undefined) => void;
	setContextLabel: (v: string | null) => void;
	setProjectFocus: (v: ProjectFocus | null) => void;
	setResolvedProjectFocus: (v: ProjectFocus | null) => void;
	toastSuccess: ReturnType<typeof vi.fn>;
	toastError: ReturnType<typeof vi.fn>;
}

function makeHarness(): TestHarness {
	let contextType: ChatContextType | null = null;
	let entityId: string | undefined;
	let contextLabel: string | null = null;
	let projectFocus: ProjectFocus | null = null;
	let resolvedProjectFocus: ProjectFocus | null = null;
	const toastSuccess = vi.fn();
	const toastError = vi.fn();

	const ctx: ToolPresenterContext = {
		getContextType: () => contextType,
		getEntityId: () => entityId,
		getContextLabel: () => contextLabel,
		getProjectFocus: () => projectFocus,
		getResolvedProjectFocus: () => resolvedProjectFocus,
		toast: {
			success: toastSuccess,
			error: toastError
		},
		isDev: false
	};

	return {
		ctx,
		setContextType: (v) => (contextType = v),
		setEntityId: (v) => (entityId = v),
		setContextLabel: (v) => (contextLabel = v),
		setProjectFocus: (v) => (projectFocus = v),
		setResolvedProjectFocus: (v) => (resolvedProjectFocus = v),
		toastSuccess,
		toastError
	};
}

describe('agent-chat-tool-presenter — formatToolMessage', () => {
	it('formats a pending create_onto_task with inline target', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		expect(
			presenter.formatToolMessage('create_onto_task', { title: 'Write tests' }, 'pending')
		).toBe('Creating task: "Write tests"');
	});

	it('formats completed update_onto_task by resolving cached entity name', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.cacheEntityName('task', 'task-1', 'Refactor modal');
		expect(
			presenter.formatToolMessage('update_onto_task', { task_id: 'task-1' }, 'completed')
		).toBe('Updated task: "Refactor modal"');
	});

	it('falls back to simplified format when no target is available', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		expect(presenter.formatToolMessage('search_ontology', {}, 'pending')).toBe(
			'Searching workspace...'
		);
		expect(presenter.formatToolMessage('search_ontology', {}, 'completed')).toBe(
			'Searched workspace'
		);
	});

	it('appends the error suffix on failure', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		const msg = presenter.formatToolMessage(
			'update_onto_task',
			{ title: 'x' },
			'failed',
			'Not found'
		);
		expect(msg).toBe('Failed to update task: "x" - Not found');
	});

	it('uses the unknown-tool fallback when no formatter is registered', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		expect(presenter.formatToolMessage('totally_new_tool', {}, 'pending')).toBe(
			'Using tool: totally_new_tool'
		);
		expect(presenter.formatToolMessage('totally_new_tool', {}, 'completed')).toBe(
			'Tool totally_new_tool completed'
		);
		expect(presenter.formatToolMessage('totally_new_tool', {}, 'failed', 'oops')).toBe(
			'Tool totally_new_tool failed - oops'
		);
	});

	it('formats skill_load pending / completed / failed using skill path', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		const skillArgs = { skill: 'calendar.schedule_event' };
		const pending = presenter.formatToolMessage('skill_load', skillArgs, 'pending');
		const completed = presenter.formatToolMessage('skill_load', skillArgs, 'completed');
		const failed = presenter.formatToolMessage('skill_load', skillArgs, 'failed', 'timeout');
		expect(pending.length).toBeGreaterThan(0);
		expect(completed.length).toBeGreaterThan(0);
		expect(failed).toContain('timeout');
	});

	it('parses JSON string arguments and uses resolved entity names', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.cacheEntityName('project', 'p-1', 'Summer Campaign');
		expect(
			presenter.formatToolMessage(
				'get_onto_project_details',
				JSON.stringify({ project_id: 'p-1' }),
				'pending'
			)
		).toBe('Loading project: "Summer Campaign"');
	});

	it('returns "Using tool: X" on invalid JSON argument strings', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		expect(presenter.formatToolMessage('create_onto_task', '{not json', 'pending')).toBe(
			'Using tool: create_onto_task'
		);
	});
});

describe('agent-chat-tool-presenter — formatOperationEvent', () => {
	it('formats a list start', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		expect(
			presenter.formatOperationEvent({
				action: 'list',
				status: 'start',
				entity_type: 'task'
			})
		).toEqual({ message: 'Listing task', activityStatus: 'pending' });
	});

	it('formats a create success with entity name', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		expect(
			presenter.formatOperationEvent({
				action: 'create',
				status: 'success',
				entity_type: 'task',
				entity_name: 'Write tests'
			})
		).toEqual({ message: 'Created task: "Write tests"', activityStatus: 'completed' });
	});

	it('formats an error as failed with the present verb', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		const result = presenter.formatOperationEvent({
			action: 'update',
			status: 'error',
			entity_type: 'goal'
		});
		expect(result.activityStatus).toBe('failed');
		expect(result.message).toContain('Updating');
	});

	it('falls back to capitalized verb on unknown action', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		const result = presenter.formatOperationEvent({
			action: 'migrate',
			status: 'start',
			entity_type: 'plan'
		});
		expect(result.message).toBe('Migrate plan');
	});
});

describe('agent-chat-tool-presenter — resolveEntityName precedence', () => {
	it('prefers a directly provided candidate name', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		expect(presenter.resolveEntityName('project', 'p-1', 'Direct Name')).toBe('Direct Name');
	});

	it('falls back to resolved project focus when candidate is missing', () => {
		const h = makeHarness();
		h.setContextType('project');
		h.setResolvedProjectFocus({
			projectId: 'p-1',
			projectName: 'From Focus',
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null
		} as unknown as ProjectFocus);
		const presenter = createToolPresenter(h.ctx);
		expect(presenter.resolveEntityName('project', 'p-1')).toBe('From Focus');
	});

	it('falls back to cached name by kind, then by entity', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.cacheEntityName('task', 't-1', 'Typed cache');
		expect(presenter.resolveEntityName('task', 't-1')).toBe('Typed cache');

		presenter.cacheEntityName('entity', 't-2', 'Generic cache');
		expect(presenter.resolveEntityName(undefined, 't-2')).toBe('Generic cache');
	});

	it('returns undefined when nothing resolves', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		expect(presenter.resolveEntityName('task', 'nope')).toBeUndefined();
	});
});

describe('agent-chat-tool-presenter — indexEntitiesFromPayload', () => {
	it('caches project + singular + plural entries', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.indexEntitiesFromPayload({
			project_id: 'p-1',
			project_name: 'Summer Campaign',
			task: { id: 't-1', title: 'Draft brief' },
			goals: [
				{ id: 'g-1', name: 'Ship Q3' },
				{ id: 'g-2', name: 'Hire PM' }
			]
		});
		expect(presenter.resolveEntityName('project', 'p-1')).toBe('Summer Campaign');
		expect(presenter.resolveEntityName('task', 't-1')).toBe('Draft brief');
		expect(presenter.resolveEntityName('goal', 'g-1')).toBe('Ship Q3');
		expect(presenter.resolveEntityName('goal', 'g-2')).toBe('Hire PM');
	});

	it('caches context_shift entities by entity_type', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		presenter.indexEntitiesFromPayload({
			context_shift: {
				entity_type: 'task',
				entity_id: 't-9',
				entity_name: 'Shifted'
			}
		});
		expect(presenter.resolveEntityName('task', 't-9')).toBe('Shifted');
	});

	it('descends into nested result payloads', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		presenter.indexEntitiesFromPayload({
			result: {
				task: { id: 't-nested', title: 'Nested task' }
			}
		});
		expect(presenter.resolveEntityName('task', 't-nested')).toBe('Nested task');
	});

	it('indexes results arrays using entity_type / entity_id / entity_name', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		presenter.indexEntitiesFromPayload({
			results: [
				{ entity_type: 'document', entity_id: 'd-1', entity_name: 'Brief.md' },
				{ entity_type: 'risk', entity_id: 'r-1', entity_name: 'Scope creep' }
			]
		});
		expect(presenter.resolveEntityName('document', 'd-1')).toBe('Brief.md');
		expect(presenter.resolveEntityName('risk', 'r-1')).toBe('Scope creep');
	});
});

describe('agent-chat-tool-presenter — mutation tracking', () => {
	let h: TestHarness;

	beforeEach(() => {
		h = makeHarness();
	});

	it('records a successful data mutation and bumps the counter', () => {
		const presenter = createToolPresenter(h.ctx);
		presenter.recordDataMutation('create_onto_task', { title: 'x', project_id: 'p-1' }, true);
		const summary = presenter.buildMutationSummary({
			hasMessagesSent: true,
			sessionId: 'sess-1'
		});
		expect(summary.hasChanges).toBe(true);
		expect(summary.totalMutations).toBe(1);
		expect(summary.affectedProjectIds).toEqual(['p-1']);
		expect(summary.sessionId).toBe('sess-1');
		expect(summary.hasMessagesSent).toBe(true);
	});

	it('ignores unsuccessful calls', () => {
		const presenter = createToolPresenter(h.ctx);
		presenter.recordDataMutation('create_onto_task', { title: 'x' }, false);
		expect(presenter.buildMutationSummary({ hasMessagesSent: false }).totalMutations).toBe(0);
	});

	it('ignores untracked tools', () => {
		const presenter = createToolPresenter(h.ctx);
		presenter.recordDataMutation('search_ontology', { query: 'x' }, true);
		expect(presenter.buildMutationSummary({ hasMessagesSent: false }).totalMutations).toBe(0);
	});

	it('suppresses create_onto_project when result has clarifications', () => {
		const presenter = createToolPresenter(h.ctx);
		presenter.recordDataMutation('create_onto_project', { name: 'x' }, true, {
			data: { clarifications: [{ question: 'y' }] }
		});
		expect(presenter.buildMutationSummary({ hasMessagesSent: false }).totalMutations).toBe(0);
	});

	it('falls back to tool-result project_id when args lack one', () => {
		const presenter = createToolPresenter(h.ctx);
		presenter.recordDataMutation('create_onto_task', { title: 'x' }, true, {
			data: { task: { project_id: 'p-result' } }
		});
		const summary = presenter.buildMutationSummary({ hasMessagesSent: false });
		expect(summary.affectedProjectIds).toEqual(['p-result']);
	});

	it('falls back to the active project context when both args and result lack one', () => {
		h.setContextType('project');
		h.setEntityId('p-context');
		const presenter = createToolPresenter(h.ctx);
		presenter.recordDataMutation('update_onto_task', { task_id: 't-1' }, true);
		const summary = presenter.buildMutationSummary({ hasMessagesSent: false });
		expect(summary.affectedProjectIds).toEqual(['p-context']);
	});

	it('resets the counter via resetMutationTracking', () => {
		const presenter = createToolPresenter(h.ctx);
		presenter.recordDataMutation('create_onto_task', { title: 'x', project_id: 'p-1' }, true);
		presenter.resetMutationTracking();
		const summary = presenter.buildMutationSummary({ hasMessagesSent: false });
		expect(summary.totalMutations).toBe(0);
		expect(summary.affectedProjectIds).toEqual([]);
	});
});

describe('agent-chat-tool-presenter — catalog consolidation', () => {
	it('exposes MUTATION_TRACKED_TOOLS as a superset of DATA_MUTATION_TOOLS', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		for (const toolName of presenter.DATA_MUTATION_TOOLS) {
			expect(presenter.MUTATION_TRACKED_TOOLS.has(toolName)).toBe(true);
		}
	});

	it('includes tracked-but-not-toasted tools only in MUTATION_TRACKED_TOOLS', () => {
		const presenter = createToolPresenter(makeHarness().ctx);
		expect(presenter.MUTATION_TRACKED_TOOLS.has('create_task_document')).toBe(true);
		expect(presenter.DATA_MUTATION_TOOLS.has('create_task_document')).toBe(false);
		expect(presenter.MUTATION_TRACKED_TOOLS.has('link_onto_entities')).toBe(true);
		expect(presenter.DATA_MUTATION_TOOLS.has('link_onto_entities')).toBe(false);
	});
});

describe('agent-chat-tool-presenter — showToolResultToast', () => {
	it('calls toast.success for a mutation tool on success with target', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.showToolResultToast('create_onto_task', { title: 'Hello' }, true);
		expect(h.toastSuccess).toHaveBeenCalledWith('Created task: "Hello"');
		expect(h.toastError).not.toHaveBeenCalled();
	});

	it('calls toast.error for a mutation tool on failure', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.showToolResultToast('delete_onto_task', { task_id: 't-1' }, false);
		expect(h.toastError).toHaveBeenCalledTimes(1);
		expect(h.toastError.mock.calls[0]?.[0]).toMatch(/Failed to delete task/);
	});

	it('is a no-op for non-mutation tools', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.showToolResultToast('search_ontology', { query: 'x' }, true);
		expect(h.toastSuccess).not.toHaveBeenCalled();
		expect(h.toastError).not.toHaveBeenCalled();
	});

	it('is a no-op for tracked-but-not-toasted tools', () => {
		const h = makeHarness();
		const presenter = createToolPresenter(h.ctx);
		presenter.showToolResultToast('create_task_document', { task_id: 't-1' }, true);
		expect(h.toastSuccess).not.toHaveBeenCalled();
	});
});

describe('agent-chat-tool-presenter — calendar formatters', () => {
	it('formats a date-only value', () => {
		expect(formatDateOnlyLabel('2026-04-18')).toBe('Apr 18, 2026');
	});

	it('formats an ISO string with a Z suffix', () => {
		expect(formatCalendarDateLabel('2026-04-18T14:30:00Z')).toContain('Apr 18, 2026');
	});

	it('formats an ISO string with an explicit +05:30 offset without a caller-supplied tz', () => {
		const label = formatCalendarDateLabel('2026-04-18T09:30+05:30');
		expect(label).toContain('Apr 18, 2026');
		expect(label).toContain('UTC+05:30');
	});

	it('returns the raw string on invalid input', () => {
		expect(formatCalendarDateLabel('not-a-date')).toBe('not-a-date');
	});
});

describe('agent-chat-tool-presenter — formatErrorMessage', () => {
	it('returns the raw string for small strings', () => {
		expect(formatErrorMessage('oops')).toBe('oops');
	});

	it('truncates long messages with an ellipsis', () => {
		const long = 'x'.repeat(500);
		const result = formatErrorMessage(long, 100);
		expect(result).toHaveLength(100);
		expect(result?.endsWith('...')).toBe(true);
	});

	it('extracts Error.message', () => {
		expect(formatErrorMessage(new Error('boom'))).toBe('boom');
	});

	it('JSON-stringifies unknown objects', () => {
		expect(formatErrorMessage({ code: 42 })).toContain('42');
	});

	it('returns undefined for null / empty', () => {
		expect(formatErrorMessage(null)).toBeUndefined();
		expect(formatErrorMessage('')).toBeUndefined();
		expect(formatErrorMessage('   ')).toBeUndefined();
	});
});
