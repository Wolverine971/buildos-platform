// apps/web/src/lib/server/proposal-cards/proposal-card.worker-roundtrip.test.ts
//
// The rail end to end (tasker 122): a card minted by the runtime's propose_*
// tool, carried the way the worker carries it (shared read dispatch with the
// user's timezone, canonical JSON, storage projection) into a
// chat_tool_executions-shaped row (id = the card id the worker passed in,
// arguments = the model's arguments), must load through the real resolver.
// Cancel is the only choice that writes nothing, so it proves the resolver's
// row checks (tool name, success, card id, session, argument ids) without a
// product write. Check again on an unchanged combine must show the same digest
// the card carries, or every click would 409 PREVIEW_CHANGED.
import { describe, expect, it } from 'vitest';
import { canonicalizeAgenticChatJson, type JsonValue } from '@buildos/shared-types';
import {
	AgenticChatToolAccessDeniedError,
	executeAgenticChatSharedReadToolV1,
	projectAgenticChatToolResultForStorageV1,
	type AgenticChatSharedReadContextV1
} from '@buildos/agentic-chat-runtime/tools';
import {
	parseFoldImpactV1,
	proposalCardVisibleDigest
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { previewProposalCard, resolveProposalCard } from './proposal-card.service';
import { IDS, NOW, fakeDb, id, turnRow } from './proposal-card.test-helpers';

type Row = Record<string, unknown>;
const ACTOR = id(40);

function workerContext(
	tables: Record<string, Row[]>,
	rpc: Record<string, unknown>
): AgenticChatSharedReadContextV1 {
	const from = (table: string) => {
		const filters: Array<(row: Row) => boolean> = [];
		const query: any = {
			select: () => query,
			in: (key: string, values: unknown[]) => (
				filters.push((row) => values.includes(row[key])),
				query
			),
			is: (key: string, value: unknown) => (
				filters.push((row) => (row[key] ?? null) === value),
				query
			),
			then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
				Promise.resolve({
					data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
					error: null
				}).then(resolve, reject)
		};
		return query;
	};
	return {
		client: {
			from,
			rpc: async (name: string) => ({ data: rpc[name] ?? null, error: null })
		},
		userId: IDS.USER,
		timezone: 'America/New_York',
		access: {
			getActorId: async () => ACTOR,
			resolveProjectSummaries: async () => [],
			assertProjectAccess: async (projectId: string) => {
				if (!tables.onto_projects?.some((row) => row.id === projectId))
					throw new AgenticChatToolAccessDeniedError();
			},
			assertEntityAccess: async () => undefined
		},
		proposal: {
			toolExecutionId: IDS.CARD,
			sessionId: IDS.SESSION,
			turnRunId: IDS.TURN,
			startDuplicateCheck: async (projectIds: readonly string[]) => ({
				run_id: id(99),
				root_project_id: projectIds[0]!
			}),
			now: () => new Date('2026-10-17T12:00:00.000Z')
		}
	} as unknown as AgenticChatSharedReadContextV1;
}

/** What persist_agentic_chat_read_tool_execution stores for a successful read. */
async function workerToolRow(
	toolName: 'propose_project_parent' | 'propose_project_combine',
	context: AgenticChatSharedReadContextV1,
	args: Record<string, unknown>
) {
	const raw = await executeAgenticChatSharedReadToolV1({
		toolName,
		context,
		arguments: args as never
	});
	const canonical = JSON.parse(canonicalizeAgenticChatJson(raw as JsonValue));
	return {
		id: IDS.CARD,
		session_id: IDS.SESSION,
		turn_run_id: IDS.TURN,
		tool_name: toolName,
		success: true,
		arguments: args,
		result: projectAgenticChatToolResultForStorageV1(toolName, canonical),
		created_at: '2026-10-17T12:00:00.000Z'
	};
}

function project(projectId: string, name: string, extra: Row = {}): Row {
	return {
		id: projectId,
		name,
		parent_project_id: null,
		archived_at: null,
		deleted_at: null,
		merged_into_project_id: null,
		shared_folder_document_id: null,
		created_by: ACTOR,
		...extra
	};
}

const emptyFamily = (projectId: string) => ({
	project_id: projectId,
	parent: null,
	shelf: [],
	children: [],
	own_shared_folder_document_id: null,
	child_count: 0
});

function call(admin: ReturnType<typeof fakeDb>) {
	return {
		cardId: IDS.CARD,
		sessionId: IDS.SESSION,
		userId: IDS.USER,
		userClient: {} as never,
		admin: admin.client,
		deps: { now: () => NOW }
	};
}

describe('worker-minted proposal cards through the web resolver', () => {
	it('loads a nest card the worker stored and settles Cancel', async () => {
		const args = { project_id: IDS.CHILD, parent_project_id: IDS.PARENT };
		const row = await workerToolRow(
			'propose_project_parent',
			workerContext(
				{
					onto_projects: [
						project(IDS.CHILD, 'DJ Internal'),
						project(IDS.PARENT, 'Wayne Strategies')
					]
				},
				{ onto_project_family_v1: emptyFamily(IDS.CHILD) }
			),
			args
		);
		expect(row.result).toMatchObject({ card_rail: 'proposal_v1', card_id: IDS.CARD });
		const admin = fakeDb({ chat_tool_executions: [row], chat_turn_runs: [turnRow()] });
		const result = await resolveProposalCard({ ...call(admin), choice: 'cancel' });
		expect(result).toMatchObject({
			ok: true,
			alreadyResolved: false,
			resolution: { outcome: 'cancelled', kind: 'project_parent', card_id: IDS.CARD }
		});
	});

	it('refuses the same card when the stored arguments name another project', async () => {
		const args = { project_id: IDS.CHILD, parent_project_id: IDS.PARENT };
		const row = await workerToolRow(
			'propose_project_parent',
			workerContext(
				{
					onto_projects: [
						project(IDS.CHILD, 'DJ Internal'),
						project(IDS.PARENT, 'Wayne Strategies')
					]
				},
				{ onto_project_family_v1: emptyFamily(IDS.CHILD) }
			),
			args
		);
		const admin = fakeDb({
			chat_tool_executions: [{ ...row, arguments: { ...args, parent_project_id: IDS.DEST } }],
			chat_turn_runs: [turnRow()]
		});
		const result = await resolveProposalCard({ ...call(admin), choice: 'cancel' });
		expect(result).toMatchObject({ ok: false, status: 404, code: 'CARD_NOT_FOUND' });
	});

	it('loads a combine card, and Check again on an unchanged world shows the same digest', async () => {
		const preview = {
			confirmation_token: 'token-1',
			impact: {
				source: { id: IDS.SOURCE, name: 'Content Ops', archived: false },
				destination: { id: IDS.DEST, name: 'DJ Internal' },
				folder_title: 'From Content Ops',
				counts: { onto_documents: 4, onto_tasks: 3, upcoming_standalone_events: 1 },
				members: [
					{
						actor_id: IDS.ALICE,
						name: 'Alice',
						role_key: 'editor',
						access: 'write',
						destination_access: null,
						named_for_addition: false
					}
				],
				members_missing: [IDS.ALICE],
				member_additions: [],
				blockers: ['members_missing', 'standalone_events_not_supported'],
				past_events_left_with_source: [],
				upcoming_standalone_events: [
					{ id: IDS.EVENT, title: 'Launch call', start_at: '2026-11-02T15:00:00+00:00' }
				],
				connector_grants_not_copied: {
					project_permissions: 0,
					oauth_grants_naming_source: 0
				}
			},
			info: { repointed: { chat_sessions: 1 } }
		};
		const args = { source_project_id: IDS.SOURCE, destination_project_id: IDS.DEST };
		const row = await workerToolRow(
			'propose_project_combine',
			workerContext(
				{
					onto_projects: [
						project(IDS.SOURCE, 'Content Ops'),
						project(IDS.DEST, 'DJ Internal')
					]
				},
				{
					onto_project_family_v1: emptyFamily(IDS.SOURCE),
					onto_project_fold_preview: preview
				}
			),
			args
		);
		const stored = row.result as Record<string, any>;
		// The user's timezone re-rendered the event instant; the digest ignores it.
		expect(stored.client_action.payload.upcoming_events[0].start_at).toBe(
			'2026-11-02T10:00:00-05:00'
		);
		const admin = fakeDb({ chat_tool_executions: [row], chat_turn_runs: [turnRow()] });
		const checked = await previewProposalCard({
			...call(admin),
			phase: 'decide',
			deps: { now: () => NOW, previewProjectFold: async () => parseFoldImpactV1(preview)! }
		});
		expect(checked).toMatchObject({ ok: true });
		expect((checked as { digest: string }).digest).toBe(
			proposalCardVisibleDigest('project_combine', stored.client_action.payload)
		);
		const cancelled = await resolveProposalCard({ ...call(admin), choice: 'cancel' });
		expect(cancelled).toMatchObject({
			ok: true,
			resolution: { outcome: 'cancelled', kind: 'project_combine' }
		});
	});
});
