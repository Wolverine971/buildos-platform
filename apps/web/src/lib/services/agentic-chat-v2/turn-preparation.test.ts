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
	it('routes a native task mutation without activating domain sensing', () => {
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
			requiresWrite: true,
			action: 'update',
			entityKind: 'task'
		});
		expect(result.domainSensingBypassed).toBe(true);
		expect(result.turnDomainSensing).toBeNull();
		expect(result.previousDomainState).toBeNull();
		expect(result.selectedSurfaceProfile).toBe('project_write');
		expect(toolNames(result)).toContain('update_onto_task');
		expect(result.cacheKey).toBe('v2|project|project-1|none|none');
		expect(result.toolSelectionMs).toBe(7);
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
					shifted_at: '2026-07-09T15:59:50.000Z'
				}
			},
			contextShiftHintTtlMs: 120_000,
			nowMs: NOW_MS
		});

		expect(result.recentContextShiftHint).toMatchObject({ context_type: 'global' });
		expect(result.bypassContextCacheForShiftHint).toBe(true);
		expect(result.cachedContext).toBe(cachedContext);
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
