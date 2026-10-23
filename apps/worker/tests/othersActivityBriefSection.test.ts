// apps/worker/tests/othersActivityBriefSection.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildOthersActivityBriefSection,
	classifyLogChange,
	fetchOthersActivityBriefSection,
	formatAgentLabel,
	formatOthersActivityForPrompt,
	formatOthersActivitySection,
	resolveOthersActivityWindow,
	type BuildOthersActivityInput,
	type OthersActivityLogRow
} from '../src/workers/brief/othersActivityBriefSection';
import type { OntoProjectWithRelations } from '../src/workers/brief/ontologyBriefTypes';

const ME = 'user-me';
const SAM = 'user-sam';
const JORDAN = 'user-jordan';

let seq = 0;
function log(overrides: Partial<OthersActivityLogRow>): OthersActivityLogRow {
	seq += 1;
	return {
		project_id: 'p-mine',
		entity_type: 'task',
		entity_id: `t-${seq}`,
		action: 'created',
		before_data: null,
		after_data: { title: `Task ${seq}`, state_key: 'todo' },
		// Later rows are newer.
		created_at: new Date(Date.UTC(2026, 9, 23) + seq * 1000).toISOString(),
		changed_by: SAM,
		changed_by_actor_id: null,
		external_agent_caller_id: null,
		...overrides
	};
}

function input(logs: OthersActivityLogRow[]): BuildOthersActivityInput {
	return {
		userId: ME,
		logs,
		projects: [
			{
				id: 'p-mine',
				name: '9takes',
				isShared: false,
				isWorkspace: false,
				createdBy: 'actor-me'
			},
			{
				id: 'p-shared',
				name: 'Cadre',
				isShared: true,
				isWorkspace: false,
				createdBy: 'actor-jordan'
			},
			{ id: 'p-ws', name: 'Inbox', isShared: false, isWorkspace: true, createdBy: 'actor-me' }
		],
		people: new Map([
			[SAM, { actorId: 'actor-sam', name: 'Sam' }],
			[JORDAN, { actorId: 'actor-jordan', name: 'Jordan' }]
		]),
		callers: new Map([
			[
				'caller-my-codex',
				{ id: 'caller-my-codex', user_id: ME, provider: 'codex-cli', metadata: {} }
			],
			[
				'caller-sam-claude',
				{
					id: 'caller-sam-claude',
					user_id: SAM,
					provider: 'claude',
					metadata: { client_name: 'Claude Code', client_profile_id: 'claude-browser' }
				}
			]
		]),
		titles: new Map([['doc-moved', 'Launch plan']]),
		windowStart: new Date('2026-10-22T07:00:00Z'),
		windowLabel: 'since your last brief'
	};
}

describe('classifyLogChange', () => {
	const row = (action: string, before: unknown, after: unknown, entity_type = 'task') => ({
		entity_type,
		action,
		before_data: before,
		after_data: after
	});

	it('reads a finished task from the state change, since the log has no completed action', () => {
		expect(
			classifyLogChange(row('updated', { state_key: 'todo' }, { state_key: 'done' }))
		).toBe('finished');
		expect(classifyLogChange(row('created', null, { state_key: 'done' }))).toBe('finished');
		expect(
			classifyLogChange(
				row('updated', { state_key: 'active' }, { state_key: 'achieved' }, 'goal')
			)
		).toBe('finished');
	});

	it('does not call an edit to an already-done task finished', () => {
		expect(
			classifyLogChange(row('updated', { state_key: 'done' }, { state_key: 'done' }))
		).toBe('updated');
		expect(classifyLogChange(row('updated', null, { state_key: 'done' }))).toBe('updated');
	});

	it('maps created, moved, deleted, and unknown actions', () => {
		expect(classifyLogChange(row('created', null, { state_key: 'todo' }))).toBe('added');
		expect(
			classifyLogChange(
				row('updated', null, { tree_move: true, new_parent_id: 'x' }, 'document')
			)
		).toBe('moved');
		expect(classifyLogChange(row('updated', null, { moved_from_project_id: 'p-old' }))).toBe(
			'moved'
		);
		expect(classifyLogChange(row('deleted', { state_key: 'todo' }, null))).toBe('removed');
		expect(classifyLogChange(row('assigned', null, null))).toBeNull();
	});
});

describe('formatAgentLabel', () => {
	it('prefers the name an OAuth client gives itself over its profile id', () => {
		expect(
			formatAgentLabel({
				caller: {
					provider: 'remote_mcp',
					metadata: { client_name: 'Codex', client_profile_id: 'claude-browser' }
				},
				isYours: true,
				ownerName: null
			})
		).toBe('Your Codex');
	});

	it('uses a known provider name, then the owner name for other people', () => {
		expect(
			formatAgentLabel({
				caller: { provider: 'claude-code', metadata: { installation_name: 'pc-claude' } },
				isYours: false,
				ownerName: 'Sam'
			})
		).toBe("Sam's Claude Code");
	});

	it('wraps a custom connection name so it still reads as an agent', () => {
		expect(
			formatAgentLabel({
				caller: {
					provider: 'wayne-strategies-website',
					metadata: { installation_name: 'Wayne Strategies website' }
				},
				isYours: true,
				ownerName: null
			})
		).toBe('Your agent (Wayne Strategies website)');
	});
});

describe('buildOthersActivityBriefSection', () => {
	it('returns null when only the user changed things by hand', () => {
		expect(buildOthersActivityBriefSection(input([log({ changed_by: ME })]))).toBeNull();
	});

	it('keeps the user’s own agents and labels them "Your Codex"', () => {
		const section = buildOthersActivityBriefSection(
			input([
				log({ changed_by: ME }),
				log({
					changed_by: ME,
					external_agent_caller_id: 'caller-my-codex',
					action: 'updated'
				})
			])
		);
		const actors = section!.projects[0].actors;
		expect(actors.map((a) => a.label)).toEqual(['Your Codex']);
		expect(actors[0]).toMatchObject({ kind: 'agent', isYourAgent: true, itemCount: 1 });
	});

	it('merges two connections of the same agent into one line', () => {
		const base = input([
			log({ changed_by: ME, external_agent_caller_id: 'caller-my-codex' }),
			log({ changed_by: ME, external_agent_caller_id: 'caller-my-codex-server' })
		]);
		base.callers.set('caller-my-codex-server', {
			id: 'caller-my-codex-server',
			user_id: ME,
			provider: 'codex-cli',
			metadata: { installation_name: 'codex-server' }
		});
		const actors = buildOthersActivityBriefSection(base)!.projects[0].actors;
		expect(actors.map((a) => [a.label, a.itemCount])).toEqual([['Your Codex', 2]]);
	});

	it('groups by person and agent, people first, then their agents, then yours', () => {
		const section = buildOthersActivityBriefSection(
			input([
				log({ changed_by: ME, external_agent_caller_id: 'caller-my-codex' }),
				log({ changed_by: ME, external_agent_caller_id: 'caller-my-codex' }),
				log({ changed_by: ME, external_agent_caller_id: 'caller-my-codex' }),
				log({ changed_by: SAM, external_agent_caller_id: 'caller-sam-claude' }),
				log({ changed_by: SAM })
			])
		);
		expect(section!.projects[0].actors.map((a) => a.label)).toEqual([
			'Sam',
			"Sam's Claude Code",
			'Your Codex'
		]);
	});

	it('collapses repeat changes to one item with the most telling verb', () => {
		const section = buildOthersActivityBriefSection(
			input([
				log({
					entity_id: 'a',
					action: 'created',
					after_data: { title: 'A', state_key: 'todo' }
				}),
				log({
					entity_id: 'a',
					action: 'updated',
					before_data: { state_key: 'todo' },
					after_data: { title: 'A', state_key: 'done' }
				}),
				log({
					entity_id: 'b',
					action: 'updated',
					after_data: { title: 'B', state_key: 'todo' }
				}),
				log({
					entity_id: 'b',
					action: 'deleted',
					before_data: { title: 'B' },
					after_data: null
				}),
				log({
					entity_id: 'c',
					action: 'created',
					after_data: { title: 'C', state_key: 'todo' }
				})
			])
		);
		const sam = section!.projects[0].actors[0];
		expect(sam.itemCount).toBe(3);
		expect(sam.counts).toEqual({
			finished: { task: 1 },
			added: { task: 1 },
			removed: { task: 1 }
		});
		expect(sam.items.map((item) => [item.title, item.verb])).toEqual([
			['A', 'finished'],
			['C', 'added'],
			['B', 'removed']
		]);
	});

	it('puts your projects first, marks the owner on shared projects, and names the Workspace', () => {
		const section = buildOthersActivityBriefSection(
			input([
				log({ project_id: 'p-shared', changed_by: JORDAN }),
				log({ project_id: 'p-shared', changed_by: JORDAN }),
				log({ project_id: 'p-mine', changed_by: SAM }),
				log({
					project_id: 'p-ws',
					changed_by: ME,
					external_agent_caller_id: 'caller-my-codex'
				})
			])
		);
		expect(section!.projects.map((p) => [p.projectName, p.isShared])).toEqual([
			['9takes', false],
			['Workspace', false],
			['Cadre', true]
		]);
		expect(section!.projects[2].actors[0]).toMatchObject({
			label: 'Jordan',
			isProjectOwner: true
		});
		expect(section!.projects[0].actors[0].isProjectOwner).toBe(false);
	});

	it('falls back to the current title when the log row has none', () => {
		const section = buildOthersActivityBriefSection(
			input([
				log({
					entity_type: 'document',
					entity_id: 'doc-moved',
					action: 'updated',
					after_data: { tree_move: true }
				})
			])
		);
		expect(section!.projects[0].actors[0].items[0]).toMatchObject({
			title: 'Launch plan',
			verb: 'moved',
			kind: 'document'
		});
	});

	it('skips relationship, calendar, and unknown-project rows', () => {
		expect(
			buildOthersActivityBriefSection(
				input([
					log({ entity_type: 'edge' }),
					log({ entity_type: 'event' }),
					log({ project_id: 'p-gone' })
				])
			)
		).toBeNull();
	});
});

describe('resolveOthersActivityWindow', () => {
	const now = new Date('2026-10-23T07:00:00Z');

	it('uses the last 24 hours without an earlier brief', () => {
		expect(resolveOthersActivityWindow(null, now)).toEqual({
			start: new Date('2026-10-22T07:00:00Z'),
			label: 'in the last 24 hours'
		});
	});

	it('starts at the last brief', () => {
		expect(resolveOthersActivityWindow('2026-10-21T07:05:00Z', now)).toEqual({
			start: new Date('2026-10-21T07:05:00Z'),
			label: 'since your last brief'
		});
	});

	it('looks back at least 12 hours and at most a week', () => {
		expect(resolveOthersActivityWindow('2026-10-23T05:00:00Z', now).start).toEqual(
			new Date('2026-10-22T19:00:00Z')
		);
		expect(resolveOthersActivityWindow('2026-10-01T07:00:00Z', now)).toEqual({
			start: new Date('2026-10-16T07:00:00Z'),
			label: 'in the last week'
		});
	});
});

describe('formatOthersActivitySection', () => {
	it('renders nothing when nothing changed', () => {
		expect(formatOthersActivitySection(null)).toBe('');
	});

	it('renders one line per person with linked items, your projects before shared ones', () => {
		const section = buildOthersActivityBriefSection(
			input([
				log({
					entity_id: 'launch',
					action: 'updated',
					before_data: { state_key: 'todo' },
					after_data: { title: 'Draft launch email', state_key: 'done' }
				}),
				log({ entity_id: 'n1', after_data: { title: 'Fix login', state_key: 'todo' } }),
				log({ entity_id: 'n2', after_data: { title: 'Pricing page', state_key: 'todo' } }),
				log({
					entity_id: 'n3',
					after_data: { title: 'Onboarding copy', state_key: 'todo' }
				}),
				log({
					entity_type: 'document',
					entity_id: 'spec',
					changed_by: SAM,
					external_agent_caller_id: 'caller-sam-claude',
					action: 'updated',
					after_data: { title: 'Spec [v2]', state_key: 'draft' }
				}),
				log({
					project_id: 'p-shared',
					entity_id: 'old',
					changed_by: JORDAN,
					action: 'deleted',
					before_data: { title: 'Old task' },
					after_data: null
				})
			])
		);

		expect(formatOthersActivitySection(section)).toBe(
			[
				'## While you were away',
				'',
				'_What other people and agents changed since your last brief._',
				'',
				'### [9takes](/projects/p-mine)',
				'- **Sam** finished 1 task, added 3 tasks: ✅ [Draft launch email](/projects/p-mine/tasks/launch), [Onboarding copy](/projects/p-mine/tasks/n3), [Pricing page](/projects/p-mine/tasks/n2), and 1 more',
				"- **Sam's Claude Code** updated 1 doc: [Spec \\[v2\\]](/projects/p-mine/documents/spec)",
				'',
				'### Shared with you',
				'',
				'#### [Cadre](/projects/p-shared)',
				'- **Jordan** (owner) removed 1 task: ~~Old task~~',
				'',
				''
			].join('\n')
		);
	});

	it('caps projects per group and says how many were left out', () => {
		const logs: OthersActivityLogRow[] = [];
		const projects: BuildOthersActivityInput['projects'] = [];
		for (let index = 0; index < 7; index += 1) {
			projects.push({
				id: `p-${index}`,
				name: `Project ${index}`,
				isShared: false,
				isWorkspace: false,
				createdBy: 'actor-me'
			});
			logs.push(log({ project_id: `p-${index}` }));
		}
		const section = buildOthersActivityBriefSection({ ...input(logs), projects });
		const markdown = formatOthersActivitySection(section);
		expect(markdown.match(/^### /gm)).toHaveLength(5);
		expect(markdown).toContain('_2 more projects had changes._');
	});
});

describe('formatOthersActivityForPrompt', () => {
	it('summarizes each project in one plain line', () => {
		const section = buildOthersActivityBriefSection(
			input([
				log({ after_data: { title: 'Fix login', state_key: 'todo' } }),
				log({
					project_id: 'p-shared',
					changed_by: JORDAN,
					after_data: { title: 'Kickoff', state_key: 'todo' }
				})
			])
		);
		expect(formatOthersActivityForPrompt(section)).toBe(
			[
				'- 9takes: Sam added 1 task (Fix login)',
				'- Cadre [shared with the user]: Jordan (owner) added 1 task (Kickoff)'
			].join('\n')
		);
		expect(formatOthersActivityForPrompt(null)).toBe('');
	});
});

describe('fetchOthersActivityBriefSection', () => {
	type Call = { table: string; method: string; args: unknown[] };

	function fakeClient(tables: Record<string, { data: unknown; error: unknown }>) {
		const calls: Call[] = [];
		const client = {
			from(table: string) {
				const result = tables[table] ?? { data: [], error: null };
				const query: Record<string, unknown> = {};
				for (const method of ['select', 'eq', 'lt', 'in', 'or', 'gte', 'order', 'limit']) {
					query[method] = (...args: unknown[]) => {
						calls.push({ table, method, args });
						return query;
					};
				}
				query.maybeSingle = async () => result;
				query.then = (resolve: (value: unknown) => unknown) => resolve(result);
				return query;
			}
		};
		return { client: client as never, calls };
	}

	const projectsData = [
		{
			project: { id: 'p-mine', name: '9takes', kind: 'project', created_by: 'actor-me' },
			isShared: false,
			tasks: [],
			documents: [],
			goals: [],
			plans: [],
			milestones: [],
			risks: []
		}
	] as unknown as OntoProjectWithRelations[];

	it('reads only other people’s rows and agent rows, since the last brief', async () => {
		const { client, calls } = fakeClient({
			ontology_daily_briefs: {
				data: { generation_completed_at: '2026-10-22T07:10:00Z' },
				error: null
			},
			onto_project_logs: {
				data: [
					log({ changed_by: SAM, after_data: { title: 'Fix login', state_key: 'todo' } }),
					log({ changed_by: ME, external_agent_caller_id: 'caller-my-codex' })
				],
				error: null
			},
			external_agent_callers: {
				data: [{ id: 'caller-my-codex', user_id: ME, provider: 'codex-cli', metadata: {} }],
				error: null
			},
			onto_actors: { data: [{ id: 'actor-sam', user_id: SAM, name: 'Sam' }], error: null }
		});

		const section = await fetchOthersActivityBriefSection(client, {
			userId: ME,
			projectsData,
			briefDate: '2026-10-23',
			now: new Date('2026-10-23T07:00:00Z')
		});

		expect(section?.windowLabel).toBe('since your last brief');
		expect(section?.projects[0].actors.map((a) => a.label)).toEqual(['Sam', 'Your Codex']);
		const logCalls = calls.filter((call) => call.table === 'onto_project_logs');
		expect(logCalls).toContainEqual({
			table: 'onto_project_logs',
			method: 'or',
			args: [`changed_by.neq.${ME},external_agent_caller_id.not.is.null`]
		});
		expect(logCalls).toContainEqual({
			table: 'onto_project_logs',
			method: 'gte',
			args: ['created_at', '2026-10-22T07:10:00.000Z']
		});
		expect(calls).toContainEqual({
			table: 'ontology_daily_briefs',
			method: 'lt',
			args: ['brief_date', '2026-10-23']
		});
	});

	it('leaves the section out instead of failing the brief when a read errors', async () => {
		const { client } = fakeClient({
			ontology_daily_briefs: { data: null, error: null },
			onto_project_logs: { data: null, error: { message: 'boom' } }
		});
		await expect(
			fetchOthersActivityBriefSection(client, {
				userId: ME,
				projectsData,
				briefDate: '2026-10-23'
			})
		).resolves.toBeNull();
	});
});
