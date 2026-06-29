// apps/web/src/lib/server/agent-call/change-set-commit.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { commitChangeSet } from '../../../../../../packages/shared-agent-ops/src/gateway/change-set';
import type { ChangeSet, ProposedChange } from '@buildos/shared-types';

const gatewayMocks = vi.hoisted(() => ({
	runGatewayWriteOp: vi.fn()
}));

const inboxMocks = vi.hoisted(() => ({
	syncInboxItemForAgentRun: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', async () => {
	const actual = await vi.importActual<
		typeof import('@buildos/shared-agent-ops/gateway/op-execution-gateway')
	>('@buildos/shared-agent-ops/gateway/op-execution-gateway');
	return {
		...actual,
		runGatewayWriteOp: gatewayMocks.runGatewayWriteOp
	};
});

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	syncInboxItemForAgentRun: inboxMocks.syncInboxItemForAgentRun
}));

type QueryResult = { data: unknown; error: null | { message: string } };

function createSupabaseMock(results: Record<string, QueryResult[]>) {
	const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
	const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

	return {
		updates,
		inserts,
		client: {
			from: vi.fn((table: string) => {
				const chain = {
					error: null,
					select: vi.fn(() => chain),
					update: vi.fn((payload: Record<string, unknown>) => {
						updates.push({ table, payload });
						return chain;
					}),
					insert: vi.fn(async (payload: Record<string, unknown>) => {
						inserts.push({ table, payload });
						return { data: null, error: null };
					}),
					eq: vi.fn(() => chain),
					maybeSingle: vi.fn(async () => {
						const next = results[table]?.shift();
						return next ?? { data: null, error: null };
					}),
					single: vi.fn(async () => {
						const next = results[table]?.shift();
						return next ?? { data: null, error: null };
					})
				};
				return chain;
			})
		}
	};
}

function startHereContent(statusText: string, authoredText: string): string {
	return [
		'# START HERE - Example',
		'',
		'<!-- managed:status v=1 -->',
		statusText,
		'<!-- /managed:status -->',
		'',
		'## What this is',
		authoredText,
		'',
		'<!-- managed:map v=1 -->',
		'## Where the detail lives',
		'- Generated map',
		'<!-- /managed:map -->'
	].join('\n');
}

describe('commitChangeSet', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		inboxMocks.syncInboxItemForAgentRun.mockResolvedValue(null);
		gatewayMocks.runGatewayWriteOp.mockResolvedValue({
			ok: true,
			entityId: 'document-1',
			entityKind: 'document',
			entityProjectId: 'project-1',
			entityTitle: 'START HERE - Example',
			data: { ok: true }
		});
	});

	it('does not treat Start Here managed-region refreshes as stale authored edits', async () => {
		const beforeContent = startHereContent(
			'**Now:** 1 open task',
			'Same authored project orientation.'
		);
		const currentContent = startHereContent(
			'**Now:** 2 open tasks',
			'Same authored project orientation.'
		);
		const beforeSnapshot = {
			id: 'document-1',
			project_id: 'project-1',
			title: 'START HERE - Example',
			description: null,
			type_key: 'document.context.project',
			state_key: 'ready',
			content: beforeContent,
			props: { origin: 'external_agent', body_markdown: beforeContent },
			children: { children: [] },
			created_at: '2026-06-28T19:00:00.000Z',
			updated_at: '2026-06-28T19:07:56.593Z',
			archived_at: null,
			deleted_at: null
		};
		const currentSnapshot = {
			...beforeSnapshot,
			content: currentContent,
			props: { origin: 'external_agent', body_markdown: currentContent },
			updated_at: '2026-06-28T20:26:26.421Z'
		};
		const change: ProposedChange = {
			id: 'change-1',
			op: 'onto.document.update',
			entity_type: 'document',
			entity_id: 'document-1',
			action: 'update',
			before: beforeSnapshot,
			after: {
				document_id: 'document-1',
				content: startHereContent(
					'**Now:** generated elsewhere',
					'Updated authored orientation.'
				),
				update_strategy: 'replace'
			},
			rationale: 'Update Start Here authored orientation',
			decision: 'pending'
		};
		const changeSet: ChangeSet = {
			run_id: 'run-1',
			status: 'pending',
			changes: [change],
			created_at: '2026-06-28T20:20:00.000Z'
		};
		const run = {
			id: 'run-1',
			user_id: 'user-1',
			status: 'proposal_ready',
			change_set: changeSet,
			allowed_ops: ['onto.document.update'],
			context_type: 'project',
			project_id: 'project-1',
			label: 'Update project START HERE',
			goal: 'Review proposed Start Here updates',
			result: { summary: 'Review proposed Start Here updates' }
		};
		const supabase = createSupabaseMock({
			agent_runs: [
				{ data: run, error: null },
				{ data: { id: 'run-1' }, error: null }
			],
			onto_documents: [{ data: currentSnapshot, error: null }]
		});

		const outcome = await commitChangeSet({
			admin: supabase.client as any,
			runId: 'run-1',
			userId: 'user-1',
			decisions: [{ change_id: 'change-1', decision: 'approved' }]
		});

		expect(outcome).toMatchObject({
			ok: true,
			result: {
				change_set_status: 'applied',
				run_status: 'completed',
				applied: 1,
				failed: 0
			}
		});
		expect(gatewayMocks.runGatewayWriteOp).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.document.update',
				args: change.after
			})
		);
		expect(supabase.updates).toContainEqual(
			expect.objectContaining({
				table: 'agent_runs',
				payload: expect.objectContaining({
					status: 'completed'
				})
			})
		);
	});
});
