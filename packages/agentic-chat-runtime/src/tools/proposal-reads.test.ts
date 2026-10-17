// packages/agentic-chat-runtime/src/tools/proposal-reads.test.ts
//
// The proposal tools' worker-side validation (tasker 122, plan §2-§3): the nest
// block matrix (self, missing/archived/unreadable target, target is a child,
// archived children via child_count, admin on both, detach from either side,
// already in place), combine's hard vs fixable blockers, a duplicate check that
// fails or is slow never sinks the card, and no card without the host's card
// identity. Every card must parse under the shared contract and match the
// tool's own arguments, exactly as the web resolver checks them.
import { describe, expect, it, vi } from 'vitest';
import {
	parseProposalCardEnvelope,
	parseProposalCardNonCardResult,
	proposalCardSpec,
	type ProjectCombineProposalPayloadV1,
	type ProjectParentProposalPayloadV1,
	type ProposalCardEnvelopeV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { AgenticChatToolAccessDeniedError, type AgenticChatToolAccessLevelV1 } from './access-port';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	proposeProjectCombine,
	proposeProjectParent,
	type AgenticChatProposalCardContextV1
} from './proposal-reads';
import { executeAgenticChatSharedReadToolV1 } from './shared-read-dispatch';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = id(1);
const ACTOR = id(2);
const CARD = id(3);
const SESSION = id(4);
const TURN = id(5);
const CHILD = id(10);
const PARENT = id(11);
const OTHER_PARENT = id(12);
const SOURCE = id(20);
const DEST = id(21);
const ALICE = id(30);
const BOB = id(31);
const OWNER = id(32);
const NOW = new Date('2026-10-17T15:00:00.000Z');

type Level = AgenticChatToolAccessLevelV1;
type Row = Record<string, unknown>;

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

function family(
	projectId: string,
	options: {
		parent?: { id: string; name: string; can_detach?: boolean } | null;
		childCount?: number;
	} = {}
): Row {
	return {
		project_id: projectId,
		parent: options.parent
			? {
					id: options.parent.id,
					name: options.parent.name,
					state_key: 'active',
					can_write: true,
					shared_folder_document_id: null,
					child_count: 1,
					can_detach: options.parent.can_detach ?? true
				}
			: null,
		shelf: [],
		// Archived children never appear here; child_count still counts them.
		children: [],
		own_shared_folder_document_id: null,
		child_count: options.childCount ?? 0
	};
}

type Fixture = {
	projects: Row[];
	families: Record<string, Row>;
	members?: Row[];
	actors?: Row[];
	access: Record<string, Level>;
	foldPreview?: { data?: unknown; error?: { code?: string; message: string } | null };
	duplicateCheck?: AgenticChatProposalCardContextV1['startDuplicateCheck'];
	withoutProposal?: boolean;
	timezone?: string | null;
};

function fakeClient(fixture: Fixture) {
	const tables: Record<string, Row[]> = {
		onto_projects: fixture.projects,
		onto_project_members: fixture.members ?? [],
		onto_actors: fixture.actors ?? []
	};
	const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
		if (name === 'onto_project_family_v1') {
			const found = fixture.families[String(args.p_project_id)];
			return found
				? { data: found, error: null }
				: { data: null, error: { code: '42501', message: 'project_family_access_denied' } };
		}
		if (name === 'onto_project_fold_preview') {
			return {
				data: fixture.foldPreview?.data ?? null,
				error: fixture.foldPreview?.error ?? null
			};
		}
		throw new Error(`unexpected rpc ${name}`);
	});
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
	return { from, rpc };
}

const RANK: Record<Level, number> = { read: 1, write: 2, admin: 3 };

function context(fixture: Fixture) {
	const client = fakeClient(fixture);
	const startDuplicateCheck = vi.fn(
		fixture.duplicateCheck ??
			(async (projectIds: readonly string[]) => ({
				run_id: id(99),
				root_project_id: projectIds[0]!
			}))
	);
	const assertProjectAccess = vi.fn(async (projectId: string, level: Level) => {
		const have = fixture.access[projectId];
		if (!have || RANK[have] < RANK[level]) throw new AgenticChatToolAccessDeniedError();
	});
	const ctx = {
		client,
		userId: USER,
		timezone: fixture.timezone ?? null,
		access: {
			getActorId: async () => ACTOR,
			resolveProjectSummaries: async () => [],
			assertProjectAccess,
			assertEntityAccess: async () => undefined
		},
		...(fixture.withoutProposal
			? {}
			: {
					proposal: {
						toolExecutionId: CARD,
						sessionId: SESSION,
						turnRunId: TURN,
						startDuplicateCheck,
						now: () => NOW
					}
				})
	} as unknown as AgenticChatSharedReadContextV1;
	return { ctx, client, startDuplicateCheck, assertProjectAccess };
}

/** What the web resolver checks: a parseable envelope whose payload ids match the tool's arguments. */
function expectResolvableCard<P>(result: unknown, args: Record<string, unknown>) {
	const stored = JSON.parse(JSON.stringify(result));
	const card = parseProposalCardEnvelope(stored) as ProposalCardEnvelopeV1<P> | null;
	expect(card, 'card envelope must parse').not.toBeNull();
	expect(card!.card_id).toBe(CARD);
	expect(card!.client_action.session_id).toBe(SESSION);
	expect(proposalCardSpec(card!.kind).argumentsMatch(args, card!.client_action.payload)).toBe(
		true
	);
	expect(stored.requires_user_action).toBe(true);
	expect(stored.saved).toBe(false);
	return card!;
}

function expectNonCard(result: unknown, status: 'blocked' | 'no_change', reasonCode: string) {
	const parsed = parseProposalCardNonCardResult(JSON.parse(JSON.stringify(result)));
	expect(parsed).toMatchObject({ status, reason_code: reasonCode });
	expect((result as Row).client_action).toBeUndefined();
	return parsed!;
}

// ---------------------------------------------------------------------------

describe('propose_project_parent', () => {
	const nestFixture = (overrides: Partial<Fixture> = {}): Fixture => ({
		projects: [project(CHILD, 'DJ Internal'), project(PARENT, 'Wayne Strategies')],
		families: { [CHILD]: family(CHILD), [PARENT]: family(PARENT) },
		members: [
			{ project_id: CHILD, actor_id: ALICE, removed_at: null },
			{ project_id: CHILD, actor_id: BOB, removed_at: '2026-10-01T00:00:00Z' },
			{ project_id: PARENT, actor_id: OWNER, removed_at: null }
		],
		actors: [
			{ id: ALICE, name: 'Alice' },
			{ id: BOB, name: 'Bob' }
		],
		access: { [CHILD]: 'admin', [PARENT]: 'admin' },
		...overrides
	});

	it('proposes a first nest as a card the resolver accepts, with a duplicate check', async () => {
		const { ctx, startDuplicateCheck } = context(nestFixture());
		const args = { project_id: CHILD, parent_project_id: PARENT, note: ' Cadre lives here ' };
		const result = await proposeProjectParent(ctx, args);
		const card = expectResolvableCard<ProjectParentProposalPayloadV1>(result, args);
		expect(card.kind).toBe('project_parent');
		expect(card.client_action.payload).toEqual({
			version: 1,
			action: 'attach',
			project: { id: CHILD, name: 'DJ Internal' },
			from_parent: null,
			to_parent: { id: PARENT, name: 'Wayne Strategies' },
			// Removed members don't count; the acting user is never listed.
			child_only_members: { names: ['Alice'], count: 1 },
			effects: ['nothing_moves', 'no_access_change', 'creates_shared_folder'],
			undo_needs_admin_on_both: false,
			duplicate_check: { run_id: id(99), root_project_id: CHILD },
			note: 'Cadre lives here'
		});
		expect(card.client_action.expires_at).toBe('2026-10-18T15:00:00.000Z');
		expect(startDuplicateCheck).toHaveBeenCalledWith([CHILD, PARENT]);
		expect(card.message).toMatch(
			/^Needs your choice: put DJ Internal inside Wayne Strategies\./
		);
	});

	it('moves between parents: leaves the old parent and undo needs admin on both', async () => {
		const { ctx } = context(
			nestFixture({
				projects: [
					project(CHILD, 'DJ Internal', { parent_project_id: OTHER_PARENT }),
					project(PARENT, 'Wayne Strategies', { shared_folder_document_id: id(50) })
				],
				families: {
					[CHILD]: family(CHILD, { parent: { id: OTHER_PARENT, name: 'Old hub' } })
				}
			})
		);
		const args = { project_id: CHILD, parent_project_id: PARENT };
		const card = expectResolvableCard<ProjectParentProposalPayloadV1>(
			await proposeProjectParent(ctx, args),
			args
		);
		expect(card.client_action.payload).toMatchObject({
			from_parent: { id: OTHER_PARENT, name: 'Old hub' },
			effects: ['nothing_moves', 'no_access_change', 'leaves_previous_parent'],
			undo_needs_admin_on_both: true
		});
	});

	it('blocks a project going inside itself before reading anything', async () => {
		const { ctx, client } = context(nestFixture());
		const result = await proposeProjectParent(ctx, {
			project_id: CHILD,
			parent_project_id: CHILD.toUpperCase()
		});
		expectNonCard(result, 'blocked', 'parent_self');
		expect(client.rpc).not.toHaveBeenCalled();
	});

	it.each([
		['missing', { projects: [project(CHILD, 'DJ Internal')] }],
		[
			'archived',
			{
				projects: [
					project(CHILD, 'DJ Internal'),
					project(PARENT, 'Wayne', { archived_at: '2026-10-01T00:00:00Z' })
				]
			}
		],
		[
			'deleted',
			{
				projects: [
					project(CHILD, 'DJ Internal'),
					project(PARENT, 'Wayne', { deleted_at: '2026-10-01T00:00:00Z' })
				]
			}
		],
		['unreadable', { access: { [CHILD]: 'admin' as Level } }]
	])('blocks a %s target as parent_not_found', async (_label, overrides) => {
		const { ctx, startDuplicateCheck } = context(nestFixture(overrides));
		const result = await proposeProjectParent(ctx, {
			project_id: CHILD,
			parent_project_id: PARENT
		});
		expectNonCard(result, 'blocked', 'parent_not_found');
		expect(startDuplicateCheck).not.toHaveBeenCalled();
	});

	it('blocks a target that is itself inside another project', async () => {
		const { ctx } = context(
			nestFixture({
				projects: [
					project(CHILD, 'DJ Internal'),
					project(PARENT, 'Wayne', { parent_project_id: OTHER_PARENT })
				]
			})
		);
		expectNonCard(
			await proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: PARENT }),
			'blocked',
			'parent_is_a_child'
		);
	});

	it('blocks a project with sub-projects using child_count, which counts archived ones', async () => {
		const { ctx } = context(
			nestFixture({ families: { [CHILD]: family(CHILD, { childCount: 1 }) } })
		);
		const result = await proposeProjectParent(ctx, {
			project_id: CHILD,
			parent_project_id: PARENT
		});
		const parsed = expectNonCard(result, 'blocked', 'has_children');
		expect(parsed.message).toContain('archived ones count');
	});

	it.each([
		['the child', { [CHILD]: 'write' as Level, [PARENT]: 'admin' as Level }, 'DJ Internal'],
		['the parent', { [CHILD]: 'admin' as Level, [PARENT]: 'read' as Level }, 'Wayne Strategies']
	])('needs admin on both to attach (missing on %s)', async (_label, access, named) => {
		const { ctx, startDuplicateCheck } = context(nestFixture({ access }));
		const parsed = expectNonCard(
			await proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: PARENT }),
			'blocked',
			'admin_required'
		);
		expect(parsed.message).toContain(named);
		expect(startDuplicateCheck).not.toHaveBeenCalled();
	});

	it('answers no_change when the project is already inside that parent', async () => {
		const { ctx } = context(
			nestFixture({
				projects: [
					project(CHILD, 'DJ Internal', { parent_project_id: PARENT }),
					project(PARENT, 'Wayne Strategies')
				],
				families: {
					[CHILD]: family(CHILD, { parent: { id: PARENT, name: 'Wayne Strategies' } })
				}
			})
		);
		expectNonCard(
			await proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: PARENT }),
			'no_change',
			'already_nested'
		);
	});

	describe('detach', () => {
		const nestedFixture = (canDetach: boolean, access: Record<string, Level>) =>
			nestFixture({
				projects: [
					project(CHILD, 'DJ Internal', { parent_project_id: PARENT }),
					project(PARENT, 'Wayne Strategies')
				],
				families: {
					[CHILD]: family(CHILD, {
						parent: { id: PARENT, name: 'Wayne Strategies', can_detach: canDetach }
					})
				},
				access
			});

		it.each([
			['the child', { [CHILD]: 'admin' as Level, [PARENT]: 'read' as Level }],
			['the parent', { [CHILD]: 'read' as Level, [PARENT]: 'admin' as Level }]
		])('takes a project out when the user is admin of %s', async (_label, access) => {
			const { ctx, startDuplicateCheck } = context(nestedFixture(true, access));
			const args = { project_id: CHILD, parent_project_id: null };
			const card = expectResolvableCard<ProjectParentProposalPayloadV1>(
				await proposeProjectParent(ctx, args),
				args
			);
			expect(card.client_action.payload).toMatchObject({
				action: 'detach',
				from_parent: { id: PARENT, name: 'Wayne Strategies' },
				to_parent: null,
				effects: ['nothing_moves', 'no_access_change', 'leaves_previous_parent'],
				undo_needs_admin_on_both: true,
				duplicate_check: null
			});
			// The duplicate check covers attach only.
			expect(startDuplicateCheck).not.toHaveBeenCalled();
			// An omitted parent argument is a detach too, and still matches.
			expect(
				proposalCardSpec('project_parent').argumentsMatch(
					{ project_id: CHILD },
					card.client_action.payload
				)
			).toBe(true);
		});

		it('blocks a detach when the family says the user may not detach', async () => {
			const { ctx } = context(nestedFixture(false, { [CHILD]: 'write', [PARENT]: 'write' }));
			expectNonCard(
				await proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: null }),
				'blocked',
				'admin_required'
			);
		});

		it('answers no_change for a top-level project', async () => {
			const { ctx } = context(nestFixture());
			expectNonCard(
				await proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: null }),
				'no_change',
				'already_top_level'
			);
		});
	});

	it('blocks when the current parent is hidden from the user (the click could only go stale)', async () => {
		const { ctx } = context(
			nestFixture({
				projects: [
					project(CHILD, 'DJ Internal', { parent_project_id: OTHER_PARENT }),
					project(PARENT, 'Wayne Strategies')
				]
			})
		);
		expectNonCard(
			await proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: PARENT }),
			'blocked',
			'current_parent_hidden'
		);
	});

	it('fails the call (no card) for a project the user cannot read', async () => {
		const { ctx } = context(nestFixture({ access: { [PARENT]: 'admin' } }));
		await expect(
			proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: PARENT })
		).rejects.toBeInstanceOf(AgenticChatToolAccessDeniedError);
	});

	it.each([
		['a duplicate check that throws', async () => Promise.reject(new Error('boom'))],
		['a duplicate check that could not start', async () => null]
	])('still shows the card after %s', async (_label, duplicateCheck) => {
		const { ctx } = context(nestFixture({ duplicateCheck }));
		const args = { project_id: CHILD, parent_project_id: PARENT };
		const card = expectResolvableCard<ProjectParentProposalPayloadV1>(
			await proposeProjectParent(ctx, args),
			args
		);
		expect(card.client_action.payload.duplicate_check).toBeNull();
		expect(card.message).not.toContain('duplicate check');
	});

	it('mints no card without the host card identity', async () => {
		const { ctx, client } = context(nestFixture({ withoutProposal: true }));
		await expect(
			proposeProjectParent(ctx, { project_id: CHILD, parent_project_id: PARENT })
		).rejects.toThrow(/only available where chat can show its card/);
		expect(client.rpc).not.toHaveBeenCalled();
	});

	it.each([
		[{ project_id: ` ${CHILD}`, parent_project_id: PARENT }],
		[{ project_id: CHILD, parent_project_id: '' }],
		[{ project_id: 'DJ Internal', parent_project_id: PARENT }]
	])('rejects arguments the resolver could not match (%j)', async (args) => {
		const { ctx } = context(nestFixture());
		await expect(proposeProjectParent(ctx, args as never)).rejects.toThrow(/UUID/);
	});
});

// ---------------------------------------------------------------------------

function foldPreview(overrides: Row = {}, impactOverrides: Row = {}): Row {
	return {
		confirmation_token: 'token-1',
		impact: {
			source: { id: SOURCE, name: 'Content Ops', archived: false, parent_project_id: null },
			destination: { id: DEST, name: 'DJ Internal' },
			folder_title: 'From Content Ops',
			counts: {
				onto_documents: 4,
				onto_tasks: '3',
				onto_goals: 1,
				dated_tasks: 1,
				past_events_left_with_source: 2,
				upcoming_standalone_events: 0
			},
			members: [
				{
					actor_id: ALICE,
					name: 'Alice',
					role_key: 'editor',
					access: 'write',
					destination_access: null,
					named_for_addition: false
				},
				{
					actor_id: OWNER,
					name: 'Owner',
					role_key: 'owner',
					access: 'admin',
					destination_access: null,
					named_for_addition: false
				},
				{
					actor_id: ACTOR,
					name: 'DJ',
					role_key: 'owner',
					access: 'admin',
					destination_access: 'admin',
					named_for_addition: false
				}
			],
			members_missing: [ALICE, OWNER],
			member_additions: [],
			blockers: ['members_missing'],
			past_events_left_with_source: [
				{ id: id(60), title: 'Kickoff', start_at: '2026-09-01T14:00:00+00:00' },
				{ id: id(61), title: 'Review', start_at: '2026-09-15T14:00:00+00:00' }
			],
			upcoming_standalone_events: [],
			connector_grants_not_copied: { project_permissions: 0, oauth_grants_naming_source: 0 },
			...impactOverrides
		},
		info: { repointed: { chat_sessions: 2 } },
		...overrides
	};
}

describe('propose_project_combine', () => {
	const combineFixture = (overrides: Partial<Fixture> = {}): Fixture => ({
		projects: [project(SOURCE, 'Content Ops'), project(DEST, 'DJ Internal')],
		families: { [SOURCE]: family(SOURCE), [DEST]: family(DEST) },
		access: { [SOURCE]: 'admin', [DEST]: 'admin' },
		foldPreview: { data: foldPreview() },
		...overrides
	});

	it('proposes a combine card from the fold preview, naming who loses access', async () => {
		const { ctx, client, startDuplicateCheck } = context(combineFixture());
		const args = { source_project_id: SOURCE, destination_project_id: DEST };
		const card = expectResolvableCard<ProjectCombineProposalPayloadV1>(
			await proposeProjectCombine(ctx, args),
			args
		);
		const payload = card.client_action.payload;
		expect(client.rpc).toHaveBeenCalledWith('onto_project_fold_preview', {
			p_user_id: USER,
			p_source_project_id: SOURCE,
			p_destination_project_id: DEST,
			p_member_additions: []
		});
		expect(startDuplicateCheck).toHaveBeenCalledWith([DEST, SOURCE]);
		expect(payload).toMatchObject({
			source: { id: SOURCE, name: 'Content Ops' },
			destination: { id: DEST, name: 'DJ Internal' },
			folder_title: 'From Content Ops',
			chats_follow: 2,
			members_missing_total: 2,
			past_events_total: 2,
			upcoming_events_total: 0,
			// members_missing is settled by the click's member choice, not a blocker.
			blockers: [],
			checked_at: NOW.toISOString(),
			duplicate_check: { run_id: id(99), root_project_id: DEST }
		});
		expect(payload.counts).toMatchObject({ documents: 4, tasks: 3, goals: 1, dated_tasks: 1 });
		expect(payload.members_missing).toEqual([
			{
				actor_id: ALICE,
				name: 'Alice',
				role_key: 'editor',
				access: 'write',
				removable: true
			},
			// Owners can't be removed; the card then offers only "add".
			{ actor_id: OWNER, name: 'Owner', role_key: 'owner', access: 'admin', removable: false }
		]);
		expect(card.message).toContain('2 people can open Content Ops but not DJ Internal');
		// The model sees the people and blockers through model_view, never the client action.
		expect(card.model_view).toMatchObject({
			members_missing_total: 2,
			duplicate_check_run_id: id(99)
		});
	});

	it('keeps fixable blockers on the card (button disabled until Check again)', async () => {
		const upcoming = Array.from({ length: 25 }, (_, index) => ({
			id: id(100 + index),
			title: `Call ${index + 1}`,
			start_at: '2026-11-01T14:00:00+00:00'
		}));
		const { ctx } = context(
			combineFixture({
				foldPreview: {
					data: foldPreview(
						{},
						{
							blockers: [
								'members_missing',
								'standalone_events_not_supported',
								'pending_document_proposal'
							],
							upcoming_standalone_events: upcoming,
							counts: { onto_documents: 4, upcoming_standalone_events: 25 }
						}
					)
				}
			})
		);
		const args = { source_project_id: SOURCE, destination_project_id: DEST };
		const card = expectResolvableCard<ProjectCombineProposalPayloadV1>(
			await proposeProjectCombine(ctx, args),
			args
		);
		const payload = card.client_action.payload;
		expect(payload.blockers).toEqual([
			{ code: 'standalone_events_not_supported', fixable: true },
			{ code: 'pending_document_proposal', fixable: true }
		]);
		// Every list is capped at 20; the true total rides along.
		expect(payload.upcoming_events).toHaveLength(20);
		expect(payload.upcoming_events_total).toBe(25);
		expect(card.message).toContain(
			'25 upcoming events in Content Ops must be moved or deleted'
		);
		expect(card.message).toContain('Check again');
		expect(card.model_view.blockers).toEqual(payload.blockers);
	});

	it.each([
		['calendar_sync_not_deployed', 'dated tasks can’t move until calendar sync is switched on'],
		['recurring_task_not_supported', 'recurring tasks can’t move yet'],
		['too_many_documents', 'too large to combine in one step'],
		['event_links_not_supported', 'linked to other records'],
		['table_policy_incomplete', 'isn’t fully switched on yet']
	])('returns blocked with no card for the hard blocker %s', async (blocker, text) => {
		const { ctx, startDuplicateCheck } = context(
			combineFixture({
				foldPreview: {
					data: foldPreview(
						{},
						{
							blockers: [
								'members_missing',
								'standalone_events_not_supported',
								blocker
							]
						}
					)
				}
			})
		);
		const parsed = expectNonCard(
			await proposeProjectCombine(ctx, {
				source_project_id: SOURCE,
				destination_project_id: DEST
			}),
			'blocked',
			blocker
		);
		expect(parsed.message).toContain(text);
		expect(startDuplicateCheck).not.toHaveBeenCalled();
	});

	it('blocks combining a project into itself without reading anything', async () => {
		const { ctx, client } = context(combineFixture());
		expectNonCard(
			await proposeProjectCombine(ctx, {
				source_project_id: SOURCE,
				destination_project_id: SOURCE
			}),
			'blocked',
			'same_project'
		);
		expect(client.rpc).not.toHaveBeenCalled();
	});

	it.each([
		[
			'source_already_merged',
			[project(SOURCE, 'Content Ops', { merged_into_project_id: id(70) }), project(DEST, 'D')]
		],
		[
			'destination_archived',
			[project(SOURCE, 'Content Ops'), project(DEST, 'D', { archived_at: '2026-10-01' })]
		],
		[
			'destination_archived',
			[project(SOURCE, 'Content Ops'), project(DEST, 'D', { merged_into_project_id: id(70) })]
		]
	])('blocks %s before the preview', async (code, projects) => {
		const { ctx, client } = context(combineFixture({ projects }));
		expectNonCard(
			await proposeProjectCombine(ctx, {
				source_project_id: SOURCE,
				destination_project_id: DEST
			}),
			'blocked',
			code
		);
		expect(client.rpc).not.toHaveBeenCalledWith('onto_project_fold_preview', expect.anything());
	});

	it('needs admin on both projects', async () => {
		const { ctx, client } = context(
			combineFixture({ access: { [SOURCE]: 'admin', [DEST]: 'write' } })
		);
		const parsed = expectNonCard(
			await proposeProjectCombine(ctx, {
				source_project_id: SOURCE,
				destination_project_id: DEST
			}),
			'blocked',
			'admin_required'
		);
		expect(parsed.message).toContain('DJ Internal');
		expect(client.rpc).not.toHaveBeenCalled();
	});

	it('blocks a source with sub-projects (child_count, archived ones included)', async () => {
		const { ctx } = context(
			combineFixture({ families: { [SOURCE]: family(SOURCE, { childCount: 2 }) } })
		);
		expectNonCard(
			await proposeProjectCombine(ctx, {
				source_project_id: SOURCE,
				destination_project_id: DEST
			}),
			'blocked',
			'source_has_sub_projects'
		);
	});

	it('maps fold refusals to blocked results and fails on anything else', async () => {
		const args = { source_project_id: SOURCE, destination_project_id: DEST };
		const refused = context(
			combineFixture({
				foldPreview: {
					error: { code: '42501', message: 'project_fold_access_denied' }
				}
			})
		);
		expectNonCard(await proposeProjectCombine(refused.ctx, args), 'blocked', 'admin_required');
		const missing = context(
			combineFixture({
				foldPreview: { error: { code: 'PGRST202', message: 'Could not find the function' } }
			})
		);
		expectNonCard(await proposeProjectCombine(missing.ctx, args), 'blocked', 'not_available');
		const broken = context(
			combineFixture({ foldPreview: { error: { code: 'XX000', message: 'boom' } } })
		);
		await expect(proposeProjectCombine(broken.ctx, args)).rejects.toThrow(
			/preview the combine/
		);
	});

	it('still shows the card when the duplicate check fails', async () => {
		const { ctx } = context(
			combineFixture({ duplicateCheck: async () => Promise.reject(new Error('down')) })
		);
		const args = { source_project_id: SOURCE, destination_project_id: DEST };
		const card = expectResolvableCard<ProjectCombineProposalPayloadV1>(
			await proposeProjectCombine(ctx, args),
			args
		);
		expect(card.client_action.payload.duplicate_check).toBeNull();
	});

	it('mints no card without the host card identity', async () => {
		const { ctx } = context(combineFixture({ withoutProposal: true }));
		await expect(
			proposeProjectCombine(ctx, { source_project_id: SOURCE, destination_project_id: DEST })
		).rejects.toThrow(/only available where chat can show its card/);
	});

	it('survives the shared read dispatch (timezone projection) and still resolves', async () => {
		const { ctx } = context(combineFixture({ timezone: 'America/New_York' }));
		const args = { source_project_id: SOURCE, destination_project_id: DEST };
		const result = await executeAgenticChatSharedReadToolV1({
			toolName: 'propose_project_combine',
			context: ctx,
			arguments: args
		});
		const card = expectResolvableCard<ProjectCombineProposalPayloadV1>(result, args);
		// Instants are re-rendered in the user's zone but stay the same instant.
		expect(Date.parse(card.client_action.expires_at)).toBe(
			Date.parse('2026-10-18T15:00:00.000Z')
		);
		expect(card.client_action.expires_at).toContain('-04:00');
	});
});
