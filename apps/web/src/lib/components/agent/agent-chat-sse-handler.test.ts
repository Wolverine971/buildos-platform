// apps/web/src/lib/components/agent/agent-chat-sse-handler.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSSEMessage, ChatSession, ContextShiftPayload } from '@buildos/shared-types';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import {
	buildToolCallActivity,
	computeAgentStateActivity,
	computeClarifyingQuestionsCount,
	computeToolResultInfo,
	createSSEHandler,
	normalizeContextShiftContext,
	type ActivityUpdateResult,
	type PendingToolStatus,
	type SSEHandlerDeps,
	type ThinkingBlockDeps,
	type ModalStateDeps
} from './agent-chat-sse-handler';
import { createToolPresenter, type ToolPresenter } from './agent-chat-tool-presenter';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('computeAgentStateActivity', () => {
	it('returns the waiting label for waiting_on_user', () => {
		expect(computeAgentStateActivity('waiting_on_user')).toBe('Waiting on your direction...');
	});

	it('returns the default label for thinking when no details are provided', () => {
		expect(computeAgentStateActivity('thinking')).toBe('Analyzing request...');
	});

	it('uses event details for thinking when provided', () => {
		expect(computeAgentStateActivity('thinking', 'Reading project')).toBe('Reading project');
	});
});

describe('computeClarifyingQuestionsCount', () => {
	it('returns 0 for non-array payloads', () => {
		expect(computeClarifyingQuestionsCount(null)).toBe(0);
		expect(computeClarifyingQuestionsCount('nope')).toBe(0);
		expect(computeClarifyingQuestionsCount(undefined)).toBe(0);
	});

	it('counts only non-empty string questions', () => {
		expect(computeClarifyingQuestionsCount(['why?', '', '   ', 'when?', 42, null])).toBe(2);
	});
});

describe('normalizeContextShiftContext', () => {
	it('maps "general" to "global"', () => {
		expect(normalizeContextShiftContext('general' as any)).toBe('global');
	});

	it('preserves other context types', () => {
		expect(normalizeContextShiftContext('project' as any)).toBe('project');
		expect(normalizeContextShiftContext('daily_brief' as any)).toBe('daily_brief');
	});
});

// ---------------------------------------------------------------------------
// Harness: create a presenter with an empty context (tool_call tests only
// need formatting, not entity resolution).
// ---------------------------------------------------------------------------

function makePresenter(): ToolPresenter {
	return createToolPresenter({
		getContextType: () => null,
		getEntityId: () => undefined,
		getContextLabel: () => null,
		getProjectFocus: () => null,
		getResolvedProjectFocus: () => null,
		isDev: false
	});
}

describe('buildToolCallActivity', () => {
	it('builds a pending tool_call activity with presenter-formatted display message', () => {
		const presenter = makePresenter();
		const event: Extract<AgentSSEMessage, { type: 'tool_call' }> = {
			type: 'tool_call',
			tool_call: {
				id: 'call-1',
				type: 'function',
				function: {
					name: 'create_onto_task',
					arguments: JSON.stringify({ title: 'Write tests' })
				}
			} as any
		};

		const result = buildToolCallActivity(event, presenter);
		expect(result.hidden).toBe(false);
		expect(result.toolCallId).toBe('call-1');
		expect(result.activity?.activityType).toBe('tool_call');
		expect(result.activity?.status).toBe('pending');
		expect(result.activity?.content).toBe('Creating task: "Write tests"');
		expect(result.activity?.metadata?.toolName).toBe('create_onto_task');
		expect(result.activity?.metadata?.toolCallId).toBe('call-1');
	});

	it('attaches skill-activity metadata when formatting a skill_load call', () => {
		const presenter = makePresenter();
		const event: Extract<AgentSSEMessage, { type: 'tool_call' }> = {
			type: 'tool_call',
			tool_call: {
				id: 'skill-call',
				type: 'function',
				function: {
					name: 'skill_load',
					arguments: JSON.stringify({ skill: 'calendar.schedule_event' })
				}
			} as any
		};

		const result = buildToolCallActivity(event, presenter);
		expect(result.hidden).toBe(false);
		expect(result.activity?.metadata?.skillActivity).toBeDefined();
		expect(result.activity?.metadata?.skillAction).toBe('requested');
	});

	it('returns an empty toolCallId when one is not provided', () => {
		const presenter = makePresenter();
		const event: Extract<AgentSSEMessage, { type: 'tool_call' }> = {
			type: 'tool_call',
			tool_call: {
				type: 'function',
				function: { name: 'search_ontology', arguments: JSON.stringify({ query: 'x' }) }
			} as any
		};

		const result = buildToolCallActivity(event, presenter);
		expect(result.toolCallId).toBeUndefined();
		expect(result.activity?.activityType).toBe('tool_call');
	});
});

describe('computeToolResultInfo', () => {
	it('defaults to success=true when omitted', () => {
		const info = computeToolResultInfo({ tool_call_id: 'abc' }, makePresenter());
		expect(info.success).toBe(true);
		expect(info.resultToolCallId).toBe('abc');
		expect(info.toolErrorMessage).toBeUndefined();
	});

	it('picks toolName / tool_name in order of preference', () => {
		expect(
			computeToolResultInfo(
				{ toolName: 'create_onto_task', tool_name: 'ignored' },
				makePresenter()
			).rawResultToolName
		).toBe('create_onto_task');

		expect(
			computeToolResultInfo({ tool_name: 'fallback' }, makePresenter()).rawResultToolName
		).toBe('fallback');
	});

	it('formats the error message on failure', () => {
		const info = computeToolResultInfo(
			{ success: false, error: new Error('Not found'), tool_call_id: 'abc' },
			makePresenter()
		);
		expect(info.success).toBe(false);
		expect(info.toolErrorMessage).toBe('Not found');
	});
});

// ---------------------------------------------------------------------------
// Integration: the handler itself
// ---------------------------------------------------------------------------

interface HandlerHarness {
	handler: (event: AgentSSEMessage) => void;
	deps: SSEHandlerDeps;
	calls: {
		addActivity: Array<{
			content: string;
			activityType: string;
			metadata?: Record<string, any>;
			status?: string;
		}>;
		updateState: Array<{ state: string; details?: string }>;
		updateActivityStatus: Array<{
			toolCallId: string;
			status: string;
			errorMessage?: string;
			result: ActivityUpdateResult;
		}>;
		upsertSkillActivity: number;
		upsertOperationActivity: number;
		finalize: Array<{ status?: string; note?: string }>;
		hydrateSessionFromEvent: number;
		attachServerTiming: number;
		flushAssistantText: number;
		bufferAssistantText: string[];
		finalizeAssistantMessage: number;
		addClarifyingQuestionsMessage: number;
		logFocusActivity: Array<{ action: string }>;
	};
	snapshot: {
		currentActivity: string;
		isStreaming: boolean;
		error: string | null;
		selectedContextType: string | null;
		selectedEntityId: string | undefined;
		selectedContextLabel: string | null;
		projectFocus: unknown;
		lastTurnContext: unknown;
		contextUsage: unknown;
		contextUsageOverheadTokens: number;
		showFocusSelector: boolean;
		showProjectActionSelector: boolean;
		currentSession: ChatSession | null;
		agentLoopActive: boolean;
		agentTurnsRemaining: number;
	};
	presenter: ToolPresenter;
	hiddenToolCallIds: Set<string>;
	pendingToolResults: Map<string, PendingToolStatus>;
	// Override the next updateActivityStatus return value
	nextActivityUpdateResult: (result: ActivityUpdateResult) => void;
}

function createHarness(
	options: {
		messages?: UIMessage[];
		inputValue?: string;
		agentToAgentMode?: boolean;
		agentTurnsRemaining?: number;
	} = {}
): HandlerHarness {
	const snapshot: HandlerHarness['snapshot'] = {
		currentActivity: '',
		isStreaming: true,
		error: null,
		selectedContextType: null,
		selectedEntityId: undefined,
		selectedContextLabel: null,
		projectFocus: null,
		lastTurnContext: null,
		contextUsage: null,
		contextUsageOverheadTokens: 0,
		showFocusSelector: false,
		showProjectActionSelector: false,
		currentSession: null,
		agentLoopActive: Boolean(options.agentToAgentMode),
		agentTurnsRemaining: options.agentTurnsRemaining ?? 5
	};

	const calls: HandlerHarness['calls'] = {
		addActivity: [],
		updateState: [],
		updateActivityStatus: [],
		upsertSkillActivity: 0,
		upsertOperationActivity: 0,
		finalize: [],
		hydrateSessionFromEvent: 0,
		attachServerTiming: 0,
		flushAssistantText: 0,
		bufferAssistantText: [],
		finalizeAssistantMessage: 0,
		addClarifyingQuestionsMessage: 0,
		logFocusActivity: []
	};

	const messages: UIMessage[] = options.messages ?? [];
	const messagesView: UIMessage[] = [...messages];
	let currentThinkingBlockId: string | null = null;
	let nextActivityUpdateResult: ActivityUpdateResult = { matched: true };

	const presenter = createToolPresenter({
		getContextType: () => snapshot.selectedContextType as any,
		getEntityId: () => snapshot.selectedEntityId,
		getContextLabel: () => snapshot.selectedContextLabel,
		getProjectFocus: () => snapshot.projectFocus as any,
		getResolvedProjectFocus: () => snapshot.projectFocus as any,
		isDev: false
	});

	const thinking: ThinkingBlockDeps = {
		ensure() {
			if (!currentThinkingBlockId) {
				currentThinkingBlockId = 'block-1';
			}
			return currentThinkingBlockId;
		},
		update(blockId, updater) {
			const fake: ThinkingBlockMessage = {
				id: blockId ?? 'block-1',
				content: '',
				type: 'thinking_block',
				timestamp: new Date(),
				activities: [],
				status: 'active'
			};
			updater(fake);
		},
		addActivity(content, activityType, metadata, status) {
			calls.addActivity.push({ content, activityType, metadata, status });
		},
		updateState(state, details) {
			calls.updateState.push({ state, details });
		},
		upsertSkillActivity() {
			calls.upsertSkillActivity += 1;
		},
		upsertOperationActivity() {
			calls.upsertOperationActivity += 1;
		},
		updateActivityStatus(toolCallId, status, errorMessage) {
			const result = nextActivityUpdateResult;
			calls.updateActivityStatus.push({ toolCallId, status, errorMessage, result });
			return result;
		},
		finalize(status, note) {
			calls.finalize.push({ status, note });
			currentThinkingBlockId = null;
		},
		getCurrentBlockId: () => currentThinkingBlockId
	};

	const state: ModalStateDeps = {
		getMessages: () => messagesView,
		getInputValue: () => options.inputValue ?? '',
		getCurrentSession: () => snapshot.currentSession,
		getSelectedContextLabel: () => snapshot.selectedContextLabel,
		getActiveStreamRunId: () => 42,
		isAgentToAgentMode: () => Boolean(options.agentToAgentMode),
		getAgentLoopActive: () => snapshot.agentLoopActive,
		getAgentTurnsRemaining: () => snapshot.agentTurnsRemaining,

		setContextUsage(usage, overheadTokens) {
			snapshot.contextUsage = usage;
			snapshot.contextUsageOverheadTokens = overheadTokens;
		},
		setLastTurnContext(ctx) {
			snapshot.lastTurnContext = ctx;
		},
		setProjectFocus(focus) {
			snapshot.projectFocus = focus;
		},
		setCurrentActivity(label) {
			snapshot.currentActivity = label;
		},
		setIsStreaming(value) {
			snapshot.isStreaming = value;
		},
		setError(message) {
			snapshot.error = message;
		},
		setSelectedContext({ contextType, entityId, label }) {
			snapshot.selectedContextType = contextType;
			snapshot.selectedEntityId = entityId;
			snapshot.selectedContextLabel = label;
		},
		setShowFocusSelector(value) {
			snapshot.showFocusSelector = value;
		},
		setShowProjectActionSelector(value) {
			snapshot.showProjectActionSelector = value;
		},
		setCurrentSession(session) {
			snapshot.currentSession = session;
		},
		setAgentLoopActive(value) {
			snapshot.agentLoopActive = value;
		},
		setAgentTurnsRemaining(value) {
			snapshot.agentTurnsRemaining = value;
		}
	};

	const hiddenToolCallIds = new Set<string>();
	const pendingToolResults = new Map<string, PendingToolStatus>();

	const deps: SSEHandlerDeps = {
		presenter,
		thinking,
		state,
		hydrateSessionFromEvent: () => {
			calls.hydrateSessionFromEvent += 1;
		},
		attachServerTiming: () => {
			calls.attachServerTiming += 1;
		},
		bufferAssistantText: (content) => {
			calls.bufferAssistantText.push(String(content));
		},
		flushAssistantText: () => {
			calls.flushAssistantText += 1;
		},
		finalizeAssistantMessage: () => {
			calls.finalizeAssistantMessage += 1;
		},
		hiddenToolCallIds,
		pendingToolResults,
		addClarifyingQuestionsMessage: () => {
			calls.addClarifyingQuestionsMessage += 1;
		},
		logFocusActivity: (action) => {
			calls.logFocusActivity.push({ action });
		},
		isDev: false
	};

	return {
		handler: createSSEHandler(deps),
		deps,
		calls,
		snapshot,
		presenter,
		hiddenToolCallIds,
		pendingToolResults,
		nextActivityUpdateResult: (result) => {
			nextActivityUpdateResult = result;
		}
	};
}

describe('createSSEHandler — routing', () => {
	it('flushes buffered text before any non-text event', () => {
		const h = createHarness();
		h.handler({ type: 'timing', timing: { total_ms: 5 } as any });
		expect(h.calls.flushAssistantText).toBe(1);
	});

	it('does NOT flush buffered text for text/text_delta', () => {
		const h = createHarness();
		h.handler({ type: 'text_delta', content: 'hi' });
		h.handler({ type: 'text', content: 'there' });
		expect(h.calls.flushAssistantText).toBe(0);
		expect(h.calls.bufferAssistantText).toEqual(['hi', 'there']);
	});

	it('hydrates a session when event.session is present', () => {
		const h = createHarness();
		h.handler({ type: 'session', session: { id: 'sess-1' } as ChatSession });
		expect(h.calls.hydrateSessionFromEvent).toBe(1);
	});

	it('records context usage and derives overhead tokens', () => {
		const h = createHarness({
			messages: [
				{
					id: '1',
					role: 'user',
					content: '1234',
					type: 'user',
					timestamp: new Date()
				}
			],
			inputValue: '1234'
		});
		h.handler({
			type: 'context_usage',
			usage: {
				estimatedTokens: 1000,
				totalTokenBudget: 8000
			} as any
		});
		expect(h.snapshot.contextUsage).toEqual({
			estimatedTokens: 1000,
			totalTokenBudget: 8000
		});
		// "1234" = 1 token, draft "1234" = 1 token, so overhead = 1000 - 2 = 998
		expect(h.snapshot.contextUsageOverheadTokens).toBe(998);
	});

	it('clears context usage when the event omits usage', () => {
		const h = createHarness();
		h.handler({ type: 'context_usage', usage: undefined as any });
		expect(h.snapshot.contextUsage).toBeNull();
		expect(h.snapshot.contextUsageOverheadTokens).toBe(0);
	});

	it('attaches server timing with the current stream run id', () => {
		const h = createHarness();
		h.handler({ type: 'timing', timing: { total_ms: 5 } as any });
		expect(h.calls.attachServerTiming).toBe(1);
	});

	it('stores last turn context', () => {
		const h = createHarness();
		h.handler({
			type: 'last_turn_context',
			context: { turn_id: 'abc' } as any
		});
		expect(h.snapshot.lastTurnContext).toEqual({ turn_id: 'abc' });
	});

	it('sets focus on focus_active (no log)', () => {
		const h = createHarness();
		h.handler({ type: 'focus_active', focus: { projectId: 'p-1' } as any });
		expect(h.snapshot.projectFocus).toEqual({ projectId: 'p-1' });
		expect(h.calls.logFocusActivity).toEqual([]);
	});

	it('sets focus AND logs on focus_changed', () => {
		const h = createHarness();
		h.handler({ type: 'focus_changed', focus: { projectId: 'p-1' } as any });
		expect(h.snapshot.projectFocus).toEqual({ projectId: 'p-1' });
		expect(h.calls.logFocusActivity).toEqual([{ action: 'Focus changed' }]);
	});

	it('routes agent_state through thinking.updateState and sets activity label', () => {
		const h = createHarness();
		h.handler({
			type: 'agent_state',
			state: 'thinking',
			contextType: 'project' as any,
			details: 'Reading project'
		});
		expect(h.calls.updateState).toEqual([{ state: 'thinking', details: 'Reading project' }]);
		expect(h.calls.addActivity).toEqual([
			{
				content: 'Reading project',
				activityType: 'state_change',
				metadata: { state: 'thinking', details: 'Reading project' },
				status: undefined
			}
		]);
		expect(h.snapshot.currentActivity).toBe('Reading project');
	});

	it('handles waiting_on_user without details', () => {
		const h = createHarness();
		h.handler({ type: 'agent_state', state: 'waiting_on_user', contextType: 'global' as any });
		expect(h.snapshot.currentActivity).toBe('Waiting on your direction...');
		expect(h.calls.addActivity).toEqual([]);
	});

	it('routes clarifying_questions + logs activity when count > 0', () => {
		const h = createHarness();
		h.handler({
			type: 'clarifying_questions',
			questions: ['why?', 'when?']
		});
		expect(h.calls.addClarifyingQuestionsMessage).toBe(1);
		expect(h.calls.addActivity[0]?.content).toBe('Clarifying questions requested (2)');
		expect(h.calls.updateState).toEqual([
			{ state: 'waiting_on_user', details: 'Waiting on your clarifications to continue...' }
		]);
	});

	it('routes clarifying_questions without activity when count = 0', () => {
		const h = createHarness();
		h.handler({ type: 'clarifying_questions', questions: [] });
		expect(h.calls.addClarifyingQuestionsMessage).toBe(1);
		expect(h.calls.addActivity).toEqual([]);
	});
});

describe('createSSEHandler — tool call + result', () => {
	it('adds a pending tool_call activity and consumes a prior pending result', () => {
		const h = createHarness();
		h.pendingToolResults.set('call-1', { status: 'completed' });
		h.handler({
			type: 'tool_call',
			tool_call: {
				id: 'call-1',
				type: 'function',
				function: {
					name: 'create_onto_task',
					arguments: JSON.stringify({ title: 'Hi' })
				}
			} as any
		});
		expect(h.calls.updateActivityStatus).toHaveLength(1);
		expect(h.calls.updateActivityStatus[0]?.status).toBe('completed');
		expect(h.pendingToolResults.has('call-1')).toBe(false);
	});

	it('tool_result updates a matching activity and records mutation + toast', () => {
		const h = createHarness();
		const toastSpy = vi.spyOn(h.presenter, 'showToolResultToast');
		const mutationSpy = vi.spyOn(h.presenter, 'recordDataMutation');
		h.nextActivityUpdateResult({
			matched: true,
			toolName: 'create_onto_task',
			args: { title: 'x' }
		});
		h.handler({
			type: 'tool_result',
			result: {
				tool_call_id: 'call-1',
				success: true,
				toolName: 'create_onto_task'
			}
		});
		expect(h.calls.updateActivityStatus).toHaveLength(1);
		expect(toastSpy).toHaveBeenCalledWith('create_onto_task', { title: 'x' }, true);
		expect(mutationSpy).toHaveBeenCalled();
	});

	it('tool_result buffers status when no matching activity exists yet', () => {
		const h = createHarness();
		h.nextActivityUpdateResult({ matched: false });
		h.handler({
			type: 'tool_result',
			result: {
				tool_call_id: 'call-late',
				success: false,
				error: 'Boom'
			}
		});
		expect(h.pendingToolResults.get('call-late')).toEqual({
			status: 'failed',
			errorMessage: 'Boom'
		});
	});

	it('tool_result for a hidden tool clears the hidden + pending maps and exits', () => {
		const h = createHarness();
		h.hiddenToolCallIds.add('hidden-1');
		h.pendingToolResults.set('hidden-1', { status: 'completed' });
		h.handler({
			type: 'tool_result',
			result: { tool_call_id: 'hidden-1', success: true }
		});
		expect(h.hiddenToolCallIds.has('hidden-1')).toBe(false);
		expect(h.pendingToolResults.has('hidden-1')).toBe(false);
		expect(h.calls.updateActivityStatus).toHaveLength(0);
	});
});

describe('createSSEHandler — context_shift', () => {
	it('updates context, caches entity name, sets project focus, and logs an activity', () => {
		const h = createHarness();
		const cacheSpy = vi.spyOn(h.presenter, 'cacheEntityName');

		const shift: ContextShiftPayload = {
			new_context: 'project',
			entity_id: 'p-1',
			entity_name: 'Summer Campaign',
			entity_type: 'project',
			message: 'Now focused on Summer Campaign'
		} as any;

		h.handler({ type: 'context_shift', context_shift: shift });

		expect(h.snapshot.selectedContextType).toBe('project');
		expect(h.snapshot.selectedEntityId).toBe('p-1');
		expect(h.snapshot.selectedContextLabel).toBe('Summer Campaign');
		expect(cacheSpy).toHaveBeenCalledWith('project', 'p-1', 'Summer Campaign');
		expect(h.snapshot.projectFocus).not.toBeNull();
		expect(h.snapshot.showProjectActionSelector).toBe(false);
		expect(h.calls.addActivity[0]?.content).toBe('Now focused on Summer Campaign');
	});

	it('clears project focus when shifting to a non-project context', () => {
		const h = createHarness();
		const shift: ContextShiftPayload = {
			new_context: 'global',
			entity_id: undefined,
			entity_name: undefined,
			entity_type: undefined
		} as any;
		h.handler({ type: 'context_shift', context_shift: shift });
		expect(h.snapshot.projectFocus).toBeNull();
		expect(h.snapshot.showFocusSelector).toBe(false);
	});

	it('normalizes "general" to "global"', () => {
		const h = createHarness();
		const shift: ContextShiftPayload = {
			new_context: 'general'
		} as any;
		h.handler({ type: 'context_shift', context_shift: shift });
		expect(h.snapshot.selectedContextType).toBe('global');
	});
});

describe('createSSEHandler — done + error', () => {
	it('finalizes assistant message, thinking block, and clears isStreaming on done', () => {
		const h = createHarness();
		h.handler({ type: 'done' });
		expect(h.calls.finalizeAssistantMessage).toBe(1);
		expect(h.calls.finalize[0]).toEqual({ status: undefined, note: undefined });
		expect(h.snapshot.isStreaming).toBe(false);
		expect(h.snapshot.currentActivity).toBe('');
	});

	it('decrements turn budget in agent-to-agent mode and stops when exhausted', () => {
		const h = createHarness({ agentToAgentMode: true, agentTurnsRemaining: 1 });
		h.snapshot.agentLoopActive = true;
		h.handler({ type: 'done' });
		expect(h.snapshot.agentTurnsRemaining).toBe(0);
		expect(h.snapshot.agentLoopActive).toBe(false);
		expect(h.snapshot.currentActivity).toBe('Turn limit reached');
	});

	it('sets error and finalizes thinking block with error status', () => {
		const h = createHarness();
		// Seed a thinking block so finalize is reachable
		h.deps.thinking.ensure();
		h.handler({ type: 'error', error: 'Stream died' });
		expect(h.snapshot.error).toBe('Stream died');
		expect(h.snapshot.isStreaming).toBe(false);
		expect(h.calls.finalize[0]).toEqual({ status: 'error', note: undefined });
	});

	it('does not try to finalize the thinking block when there is none', () => {
		const h = createHarness();
		h.handler({ type: 'error', error: 'Stream died' });
		expect(h.snapshot.error).toBe('Stream died');
		expect(h.calls.finalize).toEqual([]);
	});
});

describe('createSSEHandler — skill_activity + operation', () => {
	it('forwards skill_activity to thinking.upsertSkillActivity', () => {
		const h = createHarness();
		h.handler({
			type: 'skill_activity',
			action: 'loaded',
			path: 'calendar.schedule_event',
			via: 'skill_load'
		} as any);
		expect(h.calls.upsertSkillActivity).toBe(1);
	});

	it('formats operation events via presenter and forwards to thinking.upsertOperationActivity', () => {
		const h = createHarness();
		h.handler({
			type: 'operation',
			operation: {
				action: 'create',
				status: 'start',
				entity_type: 'task',
				entity_name: 'Do X'
			}
		} as any);
		expect(h.calls.upsertOperationActivity).toBe(1);
	});
});
