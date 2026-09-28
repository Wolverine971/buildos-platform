// packages/agentic-chat-runtime/src/context/steward-packet.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildStewardLiveFacts,
	hashStewardCharterText,
	loadProjectStewardPacket,
	readStewardProfileState,
	resolveChangeSource,
	type StewardFactRows
} from './steward-packet';

const NOW = '2026-09-26T16:00:00.000Z';

function rows(overrides: Partial<StewardFactRows> = {}): StewardFactRows {
	return {
		goals: [],
		milestones: [],
		plans: [],
		tasks: [],
		edges: [],
		logs: [],
		callers: [],
		events: [],
		...overrides
	};
}

function edge(rel: string, srcKind: string, srcId: string, dstKind: string, dstId: string) {
	return { rel, src_kind: srcKind, src_id: srcId, dst_kind: dstKind, dst_id: dstId };
}

function task(
	id: string,
	state: string,
	extra: Partial<StewardFactRows['tasks'][number]> = {}
): StewardFactRows['tasks'][number] {
	return {
		id,
		title: `Task ${id}`,
		state_key: state,
		due_at: null,
		start_at: null,
		completed_at: null,
		updated_at: '2026-09-01T00:00:00.000Z',
		...extra
	};
}

describe('buildStewardLiveFacts', () => {
	it('builds the goal tree from containment edges, whatever the rel name', () => {
		const facts = buildStewardLiveFacts(
			rows({
				goals: [
					{ id: 'g-done', name: 'Old goal', state_key: 'achieved', target_date: null },
					{
						id: 'g1',
						name: 'Make money with 9takes',
						state_key: 'draft',
						target_date: null
					}
				],
				milestones: [
					{ id: 'm1', title: 'First paid session', state_key: 'pending', due_at: null },
					{ id: 'm2', title: 'Loose milestone', state_key: 'pending', due_at: null }
				],
				plans: [
					{
						id: 'p1',
						name: 'Marketing Plan',
						state_key: 'active',
						start_date: '2026-07-27',
						end_date: '2026-09-21'
					},
					{
						id: 'p2',
						name: 'Phase 1',
						state_key: 'completed',
						start_date: null,
						end_date: null
					}
				],
				tasks: [
					task('t1', 'todo'),
					task('t2', 'done'),
					task('t3', 'in_progress'),
					task('t4', 'todo')
				],
				edges: [
					edge('has_milestone', 'goal', 'g1', 'milestone', 'm1'),
					edge('has_task', 'goal', 'g1', 'task', 't1'),
					edge('has', 'goal', 'g1', 'task', 't2'),
					edge('contains', 'plan', 'p1', 'task', 't3')
				]
			}),
			NOW
		);

		expect(facts.goals.map((goal) => goal.id)).toEqual(['g1', 'g-done']);
		expect(facts.goals[0]).toMatchObject({
			name: 'Make money with 9takes',
			state: 'draft',
			milestones: [{ id: 'm1', title: 'First paid session', state: 'pending' }],
			tasks: { open: 1, done: 1 }
		});
		expect(facts.other_milestones.map((m) => m.id)).toEqual(['m2']);
		expect(facts.other_plans).toEqual([
			expect.objectContaining({
				id: 'p1',
				end_date: '2026-09-21',
				tasks: { open: 1, done: 0 }
			})
		]);
		expect(facts.other_plans_completed).toBe(1);
		// t4 sits under nothing.
		expect(facts.tasks.unlinked_open).toBe(1);
	});

	it('reads child-first rels (task or plan to goal or milestone) and skips non-containment', () => {
		const facts = buildStewardLiveFacts(
			rows({
				goals: [{ id: 'g1', name: 'Beta', state_key: 'active', target_date: null }],
				milestones: [
					{ id: 'm1', title: 'Five sessions', state_key: 'pending', due_at: null },
					{ id: 'm2', title: 'Next milestone', state_key: 'pending', due_at: null }
				],
				plans: [
					{
						id: 'p1',
						name: 'Invites',
						state_key: 'active',
						start_date: null,
						end_date: null
					},
					{
						id: 'p2',
						name: 'Sessions',
						state_key: 'active',
						start_date: null,
						end_date: null
					}
				],
				tasks: [
					task('t1', 'todo'),
					task('t2', 'todo'),
					task('t3', 'done'),
					task('t4', 'todo')
				],
				edges: [
					edge('supports_goal', 'task', 't1', 'goal', 'g1'),
					edge('has_milestone', 'goal', 'g1', 'milestone', 'm1'),
					edge('targets_milestone', 'task', 't2', 'milestone', 'm1'),
					edge('contributes_to', 'task', 't3', 'milestone', 'm1'),
					edge('supports', 'plan', 'p1', 'goal', 'g1'),
					// A plan serving a milestone under the goal serves the goal.
					edge('implements', 'plan', 'p2', 'milestone', 'm1'),
					// Sequence and dependency edges are not containment.
					edge('led_to', 'milestone', 'm1', 'milestone', 'm2'),
					edge('depends_on', 'goal', 'g1', 'task', 't4')
				]
			}),
			NOW
		);

		expect(facts.goals[0]).toMatchObject({
			id: 'g1',
			tasks: { open: 1, done: 0 },
			milestones: [{ id: 'm1', tasks: { open: 1, done: 1 } }]
		});
		expect(facts.goals[0]?.plans.map((plan) => plan.id).sort()).toEqual(['p1', 'p2']);
		expect(facts.other_plans).toEqual([]);
		expect(facts.other_milestones.map((m) => m.id)).toEqual(['m2']);
		expect(facts.tasks.unlinked_open).toBe(1);
	});

	it('counts open goals past the cap as open, not settled', () => {
		const goals = Array.from({ length: 10 }, (_, index) => ({
			id: `g${index}`,
			name: `Goal ${index}`,
			state_key: index === 9 ? 'achieved' : 'active',
			target_date: null
		}));
		const facts = buildStewardLiveFacts(rows({ goals }), NOW);
		expect(facts.goals).toHaveLength(8);
		expect(facts.open_goals_omitted).toBe(1);
		expect(facts.goals_omitted).toBe(1);
	});

	it('counts task states, overdue, and completions this week', () => {
		const facts = buildStewardLiveFacts(
			rows({
				tasks: [
					task('a', 'todo', { due_at: '2026-05-25T00:00:00.000Z' }),
					task('b', 'blocked', { due_at: '2026-06-10T00:00:00.000Z' }),
					task('c', 'in_progress', { updated_at: '2026-09-24T00:00:00.000Z' }),
					task('d', 'in_progress', { updated_at: '2026-06-30T00:00:00.000Z' }),
					task('e', 'done', { completed_at: '2026-09-24T12:00:00.000Z' }),
					task('f', 'done', { completed_at: '2026-08-01T12:00:00.000Z' }),
					// Overdue by date but done: not overdue.
					task('g', 'done', { due_at: '2026-05-01T00:00:00.000Z' })
				]
			}),
			NOW
		);

		expect(facts.tasks).toMatchObject({
			open: 4,
			todo: 1,
			in_progress: 2,
			blocked: 1,
			done: 3,
			overdue: 2,
			oldest_overdue_due_at: '2026-05-25T00:00:00.000Z',
			done_last_7_days: 1
		});
		expect(facts.in_progress.map((t) => t.id)).toEqual(['c', 'd']);
		expect(facts.blocked.map((t) => t.id)).toEqual(['b']);
	});

	it('lists the next 14 days across tasks, milestones, plans, and events, soonest first', () => {
		const facts = buildStewardLiveFacts(
			rows({
				tasks: [
					task('due', 'todo', { due_at: '2026-10-02T00:00:00.000Z' }),
					task('starts', 'todo', { start_at: '2026-09-28T00:00:00.000Z' }),
					task('late', 'todo', { due_at: '2026-11-30T00:00:00.000Z' }),
					task('done-soon', 'done', { due_at: '2026-09-29T00:00:00.000Z' })
				],
				milestones: [
					{
						id: 'm',
						title: 'Beta cohort',
						state_key: 'pending',
						due_at: '2026-10-05T00:00:00.000Z'
					}
				],
				events: [
					{ id: 'ev', title: 'Discovery call', start_at: '2026-09-27T15:00:00.000Z' }
				]
			}),
			NOW
		);

		expect(facts.upcoming.map((item) => `${item.kind}:${item.id}:${item.what}`)).toEqual([
			'event:ev:scheduled',
			'task:starts:starts',
			'task:due:due',
			'milestone:m:due'
		]);
	});

	it('attributes the last 7 days of changes by who made them', () => {
		const log = (
			created_at: string,
			extra: Partial<StewardFactRows['logs'][number]> = {}
		): StewardFactRows['logs'][number] => ({
			created_at,
			change_source: 'agent_call',
			chat_session_id: null,
			external_agent_caller_id: 'caller-codex',
			entity_type: 'document',
			after_title: 'Therapy on Steroids',
			after_name: null,
			event: null,
			...extra
		});
		const facts = buildStewardLiveFacts(
			rows({
				callers: [
					{
						id: 'caller-codex',
						provider: 'codex-cli',
						metadata: {
							client_profile_id: 'codex-cli',
							installation_name: 'Codex-all-projects'
						}
					},
					{
						id: 'caller-custom',
						provider: 'codex-9takes-update',
						metadata: {
							client_profile_id: 'custom-http',
							installation_name: 'Codex 9takes Update'
						}
					}
				],
				logs: [
					log('2026-09-25T10:00:00.000Z'),
					log('2026-09-24T10:00:00.000Z'),
					log('2026-09-24T09:00:00.000Z', { external_agent_caller_id: 'caller-custom' }),
					// In-app chat writes go through the gateway as agent_call too.
					log('2026-09-23T10:00:00.000Z', {
						external_agent_caller_id: null,
						chat_session_id: 'session-1',
						entity_type: 'task',
						after_title: 'Send invites'
					}),
					log('2026-09-22T10:00:00.000Z', {
						external_agent_caller_id: null,
						change_source: 'form'
					}),
					// The steward's own toggle is not project work.
					log('2026-09-26T10:00:00.000Z', {
						external_agent_caller_id: null,
						change_source: 'api',
						entity_type: 'project',
						event: 'steward_toggled'
					}),
					// Older than 7 days.
					log('2026-09-10T10:00:00.000Z')
				]
			}),
			NOW
		);

		expect(facts.changes_last_7_days.total).toBe(5);
		expect(facts.changes_last_7_days.by_source).toEqual([
			{ source: 'Codex', count: 2 },
			{ source: 'Codex 9takes Update', count: 1 },
			{ source: 'BuildOS chat', count: 1 },
			{ source: 'App', count: 1 }
		]);
		expect(facts.changes_last_7_days.latest[0]).toEqual({
			source: 'Codex',
			entity_type: 'document',
			title: 'Therapy on Steroids',
			at: '2026-09-25T10:00:00.000Z'
		});
	});
});

describe('document recency', () => {
	it('keeps the last edit per document for the document map', () => {
		const facts = buildStewardLiveFacts(
			rows({
				documents: [
					{ id: 'doc-a', updated_at: '2026-09-24T15:16:50.000Z' },
					{ id: 'doc-b', updated_at: null }
				]
			}),
			NOW
		);
		expect(facts.document_updated_at).toEqual({ 'doc-a': '2026-09-24T15:16:50.000Z' });
	});
});

describe('resolveChangeSource', () => {
	it('names connector callers, chat, and the app', () => {
		const labels = new Map([['c1', 'Codex']]);
		const base = {
			change_source: 'agent_call',
			chat_session_id: null,
			external_agent_caller_id: null
		};
		expect(resolveChangeSource({ ...base, external_agent_caller_id: 'c1' }, labels)).toBe(
			'Codex'
		);
		expect(resolveChangeSource({ ...base, external_agent_caller_id: 'unknown' }, labels)).toBe(
			'Outside agent'
		);
		expect(resolveChangeSource({ ...base, chat_session_id: 's1' }, labels)).toBe(
			'BuildOS chat'
		);
		expect(resolveChangeSource(base, labels)).toBe('BuildOS agent run');
		expect(resolveChangeSource({ ...base, change_source: 'api' }, labels)).toBe('App');
	});
});

describe('charter approval helpers', () => {
	it('hashes the normalized text, so line endings and outer whitespace do not matter', async () => {
		const a = await hashStewardCharterText('Purpose: keep it true.\r\nRules:\r\n1. One.\n');
		const b = await hashStewardCharterText('  Purpose: keep it true.\nRules:\n1. One.');
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashStewardCharterText('Purpose: keep it false.')).not.toBe(a);
	});

	it('reads steward state from profile dimensions, active unless switched off', () => {
		expect(readStewardProfileState(null)).toBeNull();
		expect(readStewardProfileState({ other: true })).toBeNull();
		expect(readStewardProfileState({ steward: { approved_sha256: 'abc' } })).toMatchObject({
			active: true,
			approved_sha256: 'abc'
		});
		expect(readStewardProfileState({ steward: { active: false } })?.active).toBe(false);
	});
});

// A minimal PostgREST stand-in: every filter is recorded and ignored, and the
// table's rows come back as the result.
function fakeSupabase(tables: Record<string, unknown[] | Error>) {
	const calls: string[] = [];
	const builder = (table: string) => {
		const failure = tables[table] instanceof Error ? tables[table] : null;
		const result = failure
			? { data: null, error: failure }
			: { data: (tables[table] as unknown[] | undefined) ?? [], error: null };
		const chain: Record<string, unknown> = {};
		for (const method of ['select', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
			chain[method] = () => chain;
		}
		chain.maybeSingle = () =>
			Promise.resolve(
				failure
					? { data: null, error: failure }
					: {
							data: ((tables[table] as unknown[] | undefined) ?? [])[0] ?? null,
							error: null
						}
			);
		chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
		return chain;
	};
	return {
		calls,
		client: {
			from: (table: string) => {
				calls.push(table);
				return builder(table);
			}
		} as never
	};
}

describe('loadProjectStewardPacket', () => {
	const charter = 'Purpose: keep 9takes moving.\nRules:\n1. Nothing goes out without DJ.';

	it('returns null, after one read, when the user has no steward for the project', async () => {
		const fake = fakeSupabase({ user_project_behavioral_profiles: [] });
		const packet = await loadProjectStewardPacket({
			supabase: fake.client,
			userId: 'u1',
			projectId: 'p1',
			nowIso: NOW
		});
		expect(packet).toBeNull();
		expect(fake.calls).toEqual(['user_project_behavioral_profiles']);
	});

	it('returns null when the steward is switched off', async () => {
		const fake = fakeSupabase({
			user_project_behavioral_profiles: [
				{ agent_instructions: charter, dimensions: { steward: { active: false } } }
			]
		});
		expect(
			await loadProjectStewardPacket({
				supabase: fake.client,
				userId: 'u1',
				projectId: 'p1',
				nowIso: NOW
			})
		).toBeNull();
	});

	it('loads the approved charter and flags unapproved edits to the charter document', async () => {
		const approvedSha = await hashStewardCharterText(charter);
		const approved = fakeSupabase({
			user_project_behavioral_profiles: [
				{
					agent_instructions: charter,
					dimensions: {
						steward: {
							charter_document_id: 'doc-1',
							approved_sha256: approvedSha,
							approved_at: '2026-09-26T12:00:00.000Z'
						}
					}
				}
			],
			feature_flags: [{ enabled: true }],
			onto_documents: [{ content: `${charter}\n`, updated_at: '2026-09-26T12:00:00.000Z' }],
			onto_tasks: [task('t1', 'todo')]
		});
		const packet = await loadProjectStewardPacket({
			supabase: approved.client,
			userId: 'u1',
			projectId: 'p1',
			nowIso: NOW
		});
		expect(packet?.charter).toEqual({
			text: charter,
			approved_at: '2026-09-26T12:00:00.000Z',
			document_id: 'doc-1',
			pending_edits_at: null
		});
		expect(packet?.facts.tasks.open).toBe(1);

		const edited = fakeSupabase({
			user_project_behavioral_profiles: [
				{
					agent_instructions: charter,
					dimensions: {
						steward: { charter_document_id: 'doc-1', approved_sha256: approvedSha }
					}
				}
			],
			feature_flags: [{ enabled: true }],
			onto_documents: [
				{ content: `${charter}\n2. Post daily.`, updated_at: '2026-09-26T15:00:00.000Z' }
			]
		});
		const pending = await loadProjectStewardPacket({
			supabase: edited.client,
			userId: 'u1',
			projectId: 'p1',
			nowIso: NOW
		});
		// The approved text is what the steward follows; the edit is only flagged.
		expect(pending?.charter.text).toBe(charter);
		expect(pending?.charter.pending_edits_at).toBe('2026-09-26T15:00:00.000Z');
	});

	async function approvedProfile(text = charter) {
		return {
			agent_instructions: charter,
			dimensions: {
				steward: {
					charter_document_id: 'doc-1',
					approved_sha256: await hashStewardCharterText(text),
					approved_at: '2026-09-26T12:00:00.000Z'
				}
			}
		};
	}

	it('returns null when the project_steward flag is off (the kill switch)', async () => {
		const fake = fakeSupabase({
			user_project_behavioral_profiles: [await approvedProfile()],
			feature_flags: []
		});
		expect(
			await loadProjectStewardPacket({
				supabase: fake.client,
				userId: 'u1',
				projectId: 'p1',
				nowIso: NOW
			})
		).toBeNull();
	});

	it('refuses a stored charter that does not hash to the approval', async () => {
		const errors: string[] = [];
		const fake = fakeSupabase({
			user_project_behavioral_profiles: [await approvedProfile('Some other text')],
			feature_flags: [{ enabled: true }]
		});
		expect(
			await loadProjectStewardPacket({
				supabase: fake.client,
				userId: 'u1',
				projectId: 'p1',
				nowIso: NOW,
				onError: (stage) => errors.push(stage)
			})
		).toBeNull();
		expect(errors).toEqual(['steward.charter_hash_mismatch']);
		expect(fake.calls).toEqual(['user_project_behavioral_profiles']);
	});

	it('marks a failed read unavailable instead of reporting an empty list', async () => {
		const errors: string[] = [];
		const fake = fakeSupabase({
			user_project_behavioral_profiles: [await approvedProfile()],
			feature_flags: [{ enabled: true }],
			onto_goals: new Error('statement timeout'),
			onto_tasks: [task('t1', 'todo')]
		});
		const packet = await loadProjectStewardPacket({
			supabase: fake.client,
			userId: 'u1',
			projectId: 'p1',
			nowIso: NOW,
			onError: (stage) => errors.push(stage)
		});
		expect(errors).toEqual(['query.steward.goals']);
		expect(packet?.facts.unavailable).toEqual(['goals']);
		expect(packet?.facts.tasks.open).toBe(1);
	});
});
