// apps/web/src/lib/services/agentic-chat-v2/turn-preparation.test.ts
import { describe, expect, it } from 'vitest';
import {
	readRecentFastChatContextShiftHint,
	resolveFastChatTurnPreparation
} from './turn-preparation';
import { resolveFastChatScaffoldConfig } from './scaffold-variant';

const NOW_MS = Date.parse('2026-07-09T16:00:00.000Z');

function toolNames(result: ReturnType<typeof resolveFastChatTurnPreparation>): string[] {
	return result.tools.map((tool) => tool.function.name);
}

describe('resolveFastChatTurnPreparation', () => {
	// Stage S6 (2026-09-04): both project-create workflows launch with the same
	// creation surface, and no discovery tools ride along.
	it('admits the reviewed project shell, goal, and task creation surface', () => {
		const result = resolveFastChatTurnPreparation({
			contextType: 'project_create',
			latestUserMessage:
				'Create Agentic Worker PC1 with one dated goal and three standalone tasks.',
			conversationSummary: null,
			agentMetadata: null,
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS
		});

		expect(result.selectedSurfaceProfile).toBe('project_create');
		expect(toolNames(result)).toEqual([
			'declare_turn_contract',
			'declare_read_only_turn',
			'request_turn_clarification',
			'cancel_turn_contract',
			'create_onto_project',
			'create_onto_goal',
			'create_onto_task'
		]);
		expect(toolNames(result)).not.toContain('link_onto_entities');
	});

	it('uses stable project capabilities without classifying message text', () => {
		const times = [100, 107];
		const result = resolveFastChatTurnPreparation({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			latestUserMessage: 'Update the task status to complete.',
			conversationSummary: null,
			agentMetadata: null,
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS,
			measureNow: () => times.shift() ?? 107
		});

		expect(result.turnIntent).toMatchObject({
			requiresWrite: false,
			action: null,
			originalRequestText: null
		});
		expect(result.domainSensingBypassed).toBe(false);
		expect(result.turnDomainSensing).toBeNull();
		expect(result.previousDomainState).toBeNull();
		expect(result.selectedSurfaceProfile).toBe('project');
		expect(toolNames(result)).toContain('declare_turn_contract');
		expect(toolNames(result)).toContain('update_onto_task');
		expect(result.cacheKey).toBe('v2|project|project-1|none|none');
		expect(result.toolSelectionMs).toBe(7);
	});

	it.each([
		'Add a high-priority task to email the beta list by this Friday.',
		"push the beta list email thing to friday, i'm not gonna get to it before then",
		'Reschedule the beta list email task for Friday.',
		'Move the customer list email follow-up to next week.'
	])(
		'keeps the scheduled email-action task on the ordinary project worker surface: %s',
		(message) => {
			const result = resolveFastChatTurnPreparation({
				contextType: 'project',
				entityId: 'project-1',
				projectId: 'project-1',
				latestUserMessage: message,
				conversationSummary: null,
				agentMetadata: null,
				contextShiftHintTtlMs: 120_000,
				nowMs: NOW_MS
			});

			expect(result.selectedSurfaceProfile).toBe('project');
			expect(toolNames(result)).toContain('update_onto_task');
			expect(toolNames(result)).toContain('create_onto_task');
			// The Gmail group is never a launch-surface member; worker admission
			// appends it per user (A8), never per message shape.
			expect(toolNames(result)).not.toEqual(
				expect.arrayContaining([
					'list_email_accounts',
					'search_email_messages',
					'get_email_message'
				])
			);
		}
	);

	it('mounts document organization tools without lexical routing', () => {
		const result = resolveFastChatTurnPreparation({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			latestUserMessage:
				"This project's documents are a mess — loose notes, raw meeting dumps, half-baked ideas, all " +
				'piled at the top level. Help me get it organized into something sensible.',
			conversationSummary: null,
			agentMetadata: null,
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS
		});

		expect(result.turnIntent).toMatchObject({
			requiresWrite: false,
			action: null,
			entityKind: 'unknown'
		});
		expect(result.selectedSurfaceProfile).toBe('project');
		expect(toolNames(result)).toContain('move_document_in_tree');
	});

	it('admits live web tools on every project turn, research phrasing or not', () => {
		const result = resolveFastChatTurnPreparation({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			latestUserMessage:
				'Look into what other scheduling tools for small service businesses charge — ' +
				'I want a sense of the pricing landscape before we put a paid tier together.',
			conversationSummary: null,
			agentMetadata: null,
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS
		});

		expect(result.selectedSurfaceProfile).toBe('project');
		expect(toolNames(result)).toContain('web_search');
		expect(toolNames(result)).toContain('web_visit');
		expect(toolNames(result)).toContain('delegate_task');
	});

	it('gives every cross-project context the same global surface', () => {
		const resolve = (contextType: 'global' | 'general' | 'calendar' | 'daily_brief') =>
			resolveFastChatTurnPreparation({
				contextType,
				latestUserMessage: 'What is on for today?',
				conversationSummary: null,
				agentMetadata: null,
				contextShiftHintTtlMs: 120_000,
				nowMs: NOW_MS
			});

		for (const contextType of ['global', 'general', 'calendar', 'daily_brief'] as const) {
			const result = resolve(contextType);
			expect(result.selectedSurfaceProfile, contextType).toBe('global');
			// Calendar turns used to be the only ones carrying calendar tools, and
			// brief turns the only ones carrying task writes. Both ride every
			// cross-project turn now.
			expect(toolNames(result), contextType).toEqual(
				expect.arrayContaining([
					'list_calendar_events',
					'create_calendar_event',
					'delete_calendar_event',
					'create_onto_task',
					'update_onto_task',
					'move_onto_task',
					'search_all_projects'
				])
			);
			expect(toolNames(result), contextType).not.toContain('create_onto_document');
		}
	});

	it('keeps subject-matter sensing active for advisory work', () => {
		const result = resolveFastChatTurnPreparation({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			latestUserMessage: 'I want to grow my YouTube audience and plan the next videos.',
			conversationSummary: null,
			agentMetadata: {},
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS
		});

		expect(result.turnIntent.requiresWrite).toBe(false);
		expect(result.domainSensingBypassed).toBe(false);
		expect(result.turnDomainSensing?.active_domains[0]?.id).toBe('marketing.youtube_growth');
	});

	it('disables server skill routing under the typed scaffold variant', () => {
		const result = resolveFastChatTurnPreparation({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			latestUserMessage: 'I want to grow my YouTube audience and plan the next videos.',
			conversationSummary: null,
			agentMetadata: {},
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS,
			scaffold: resolveFastChatScaffoldConfig('no-server-skill-routing')
		});

		expect(result.domainSensingBypassed).toBe(true);
		expect(result.turnDomainSensing).toBeNull();
	});

	it('returns cache-routing inputs from recent context-shift metadata', () => {
		const cachedContext = {
			version: 2,
			key: 'v2|project|project-1|none|none',
			created_at: '2026-07-09T15:59:30.000Z',
			context: { contextType: 'project' as const, projectId: 'project-1' }
		};
		const result = resolveFastChatTurnPreparation({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			latestUserMessage: 'What should I do next?',
			conversationSummary: null,
			agentMetadata: {
				fastchat_context_cache: cachedContext,
				fastchat_last_context_shift: {
					context_type: 'global',
					entity_id: null,
					project_id: null,
					shifted_at: '2026-07-09T15:59:50.000Z',
					turn_run_id: '30000000-0000-4000-8000-000000000003',
					execution_generation: 1
				}
			},
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS
		});

		expect(result.recentContextShiftHint).toMatchObject({ context_type: 'global' });
		expect(result.bypassContextCacheForShiftHint).toBe(true);
		expect(result.cachedContext).toBe(cachedContext);
	});

	it('only admits a pending semantic contract in its original project scope', () => {
		const pendingContract = {
			version: 1,
			contract: {
				version: 1,
				source: 'declared',
				outcomes: [
					{
						id: 'rename-task',
						action: 'update',
						entityKind: 'task',
						targetIds: ['task-1'],
						requiredFields: ['title'],
						minimumSuccessfulEffects: 1
					}
				]
			},
			contextType: 'project',
			projectId: 'project-1',
			originatingTurnRunId: 'turn-1',
			createdAt: '2026-07-09T15:59:00.000Z',
			finishedReason: 'length'
		};
		const resolve = (projectId: string) =>
			resolveFastChatTurnPreparation({
				contextType: 'project',
				entityId: projectId,
				projectId,
				latestUserMessage: 'Continue.',
				conversationSummary: null,
				agentMetadata: { fastchat_pending_turn_contract: pendingContract },
				contextShiftHintTtlMs: 120_000,
				nowMs: NOW_MS
			});

		expect(resolve('project-1').pendingTurnContract).not.toBeNull();
		expect(resolve('project-2').pendingTurnContract).toBeNull();
	});
});

describe('readRecentFastChatContextShiftHint', () => {
	it('rejects malformed and expired context-shift metadata', () => {
		expect(
			readRecentFastChatContextShiftHint(
				{ fastchat_last_context_shift: { context_type: 'project', shifted_at: 'invalid' } },
				{ ttlMs: 120_000, nowMs: NOW_MS }
			)
		).toBeNull();
		expect(
			readRecentFastChatContextShiftHint(
				{
					fastchat_last_context_shift: {
						context_type: 'project',
						shifted_at: '2026-07-09T15:55:00.000Z'
					}
				},
				{ ttlMs: 120_000, nowMs: NOW_MS }
			)
		).toBeNull();
	});
});
