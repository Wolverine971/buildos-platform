// apps/worker/tests/agentRunWebSecurityPolicy.test.ts
import { describe, expect, it, vi } from 'vitest';
import { buildAgentRunOpCatalog, executeAgentOp } from '@buildos/shared-agent-ops';
import {
	pinAgentRunWebSearchArgs,
	resolveSegregatedAgentRunAllowedOps
} from '../src/workers/agent-run/webSecurityPolicy';

describe('Agent Run web security policy', () => {
	it('removes all web capabilities from mixed workspace and web runs', () => {
		const explicit = resolveSegregatedAgentRunAllowedOps({
			mode: 'read_write',
			allowedOps: ['onto.task.list', 'util.web.search', 'util.web.visit']
		});
		expect(explicit).toEqual({
			allowedOps: ['onto.task.list'],
			webScopeRemoved: true
		});

		const defaultScope = resolveSegregatedAgentRunAllowedOps({
			mode: 'read_only',
			allowedOps: null
		});
		expect(defaultScope.webScopeRemoved).toBe(true);
		expect(defaultScope.allowedOps).not.toContain('util.web.search');
		expect(defaultScope.allowedOps).not.toContain('util.web.visit');
	});

	it('never dispatches the web port for a mixed-scope run', async () => {
		const segregated = resolveSegregatedAgentRunAllowedOps({
			mode: 'read_only',
			allowedOps: ['onto.task.list', 'util.web.search', 'util.web.visit']
		});
		const search = vi.fn();
		const visit = vi.fn();
		const context = {
			admin: {} as any,
			userId: 'user-1',
			scope: { mode: 'read_only' as const, allowed_ops: segregated.allowedOps },
			mutationMode: 'commit' as const,
			web: { search, visit }
		};

		expect(
			buildAgentRunOpCatalog({
				scope: context.scope,
				mutationMode: 'commit',
				web: context.web
			})
		).not.toEqual(expect.arrayContaining(['util.web.search', 'util.web.visit']));
		const result = await executeAgentOp(context, 'util.web.search', {
			query: 'private-workspace-sentinel'
		});

		expect(result.ok).toBe(false);
		expect(search).not.toHaveBeenCalled();
		expect(visit).not.toHaveBeenCalled();
	});

	it('preserves dedicated web-only research children', () => {
		expect(
			resolveSegregatedAgentRunAllowedOps({
				mode: 'read_only',
				allowedOps: ['util.web.search', 'util.web.visit']
			})
		).toEqual({
			allowedOps: ['util.web.search', 'util.web.visit'],
			webScopeRemoved: false
		});
	});

	it.each(['read_only', 'read_write'] as const)(
		'preserves an explicit deny-all allowlist in %s mode',
		async (mode) => {
			const segregated = resolveSegregatedAgentRunAllowedOps({ mode, allowedOps: [] });
			expect(segregated).toEqual({ allowedOps: [], webScopeRemoved: false });
			const scope = { mode, allowed_ops: segregated.allowedOps };
			expect(
				buildAgentRunOpCatalog({
					scope,
					mutationMode: 'commit',
					web: { search: vi.fn(), visit: vi.fn() }
				})
			).toEqual([]);
			const result = await executeAgentOp(
				{
					admin: {} as any,
					userId: 'user-1',
					scope,
					mutationMode: 'commit'
				},
				'onto.task.list',
				{}
			);
			expect(result.ok).toBe(false);
		}
	);

	it('drops domain and provider-option channels from model-authored search args', () => {
		const sentinel = 'private-workspace-sentinel';
		expect(
			pinAgentRunWebSearchArgs({
				query: 'public product research',
				include_domains: [sentinel],
				exclude_domains: ['competitor.example'],
				search_depth: sentinel,
				max_results: 99,
				include_answer: sentinel
			})
		).toEqual({
			query: 'public product research',
			search_depth: 'advanced',
			max_results: 4,
			include_answer: false
		});
	});
});
