// packages/agentic-chat-runtime/src/context-finder/context-finder.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	applyContextPlanEdits,
	buildContextFinderEntities,
	buildContextFinderRequest,
	capContextFinderCandidates,
	CONTEXT_FINDER_POLICY,
	findProjectContext,
	materializeContextPlan,
	parseContextFinderSections,
	parseContextPlanV1,
	rankProjectContext,
	renderContextEvidenceBlock,
	selectProjectContext,
	type ContextFinderDecider,
	type ContextFinderProjectV1,
	type ContextPlanV1
} from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DOC = id(1);
const BIG = id(2);
const START = id(3);
const TASK = id(4);
const DONE = id(5);

function project(): ContextFinderProjectV1 {
	return {
		project: { id: id(99), name: 'School launch', description: 'Open a Christian school.' },
		documents: [
			{
				id: DOC,
				title: 'Questions for Mom',
				description: 'Founder answers.',
				type_key: 'document.knowledge',
				updated_at: '2026-09-20T00:00:00Z',
				content: [
					'# Questions for Mom',
					'Intro text.',
					'## Funding & Operations',
					'Budget is $300K.',
					'### Detail',
					'Land costs $150K/acre.',
					'## Team & Support',
					'Board: grandmother, pastor.',
					'```',
					'## not a heading',
					'```'
				].join('\n')
			},
			{
				id: BIG,
				title: 'Huge notes',
				type_key: 'document.knowledge',
				updated_at: '2026-01-01T00:00:00Z',
				content: `## Everything\n${'x'.repeat(20_000)}`
			},
			{
				id: START,
				title: 'START HERE',
				type_key: 'document.context.project',
				content: '## Current state\nAll good.'
			}
		],
		tasks: [
			{
				id: TASK,
				title: 'Call the pastor',
				state_key: 'todo',
				due_at: '2026-10-01T00:00:00Z'
			},
			{ id: DONE, title: 'Old errand', state_key: 'done', description: 'finished long ago' }
		],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	};
}

function decider(scores: (key: string) => number, fail?: 'entities' | 'headings') {
	const decide = vi.fn(async (request: { questions: Record<string, unknown> }) => {
		const keys = Object.keys(request.questions);
		const stage = keys[0]?.startsWith('h_') ? 'headings' : 'entities';
		const receipt = {
			modelRequested: 'typesafe/jev-1.13',
			modelUsed: 'typesafe/jev-1.13',
			requestId: `r-${stage}`,
			inputTokens: 100,
			outputTokens: 10,
			costUsd: 0.0004,
			durationMs: 300,
			requestBytes: 1000,
			questionCount: keys.length,
			attempts: 1
		};
		if (fail === stage) return { ok: false as const, error: 'jev_timeout', receipt };
		return {
			ok: true as const,
			answers: Object.fromEntries(keys.map((k) => [k, { type: 'noul', noul: scores(k) }])),
			receipt
		};
	});
	return { decide, decider: { decide } as unknown as ContextFinderDecider };
}

describe('packets', () => {
	it('parses markdown sections with offsets, nesting and fenced code', () => {
		const sections = parseContextFinderSections(String(project().documents[0]!.content));
		expect(sections.map((s) => [s.level, s.heading])).toEqual([
			[1, 'Questions for Mom'],
			[2, 'Funding & Operations'],
			[3, 'Detail'],
			[2, 'Team & Support']
		]);
		const funding = sections[1]!;
		expect(funding.body).toContain('Land costs'); // H2 includes its H3
		expect(funding.body).not.toContain('Board');
		expect(String(project().documents[0]!.content).slice(funding.start)).toMatch(/^## Funding/);
	});

	it('builds eval-compatible refs and drops an H1 that repeats the title', () => {
		const entities = buildContextFinderEntities(project());
		expect(entities.map((e) => e.ref)).toEqual(['d0', 'd1', 'd2', 't0', 't1']);
		expect(entities[0]!.packet.headings).toEqual([
			'Funding & Operations',
			'Detail',
			'Team & Support'
		]);
		expect(entities[3]!.packet).toMatchObject({
			kind: 'task',
			state: 'todo',
			due: '2026-10-01'
		});
	});

	it('asks one question per entity, then headings for the chosen documents only', () => {
		const entities = buildContextFinderEntities(project());
		const first = buildContextFinderRequest({
			project: project().project,
			entities,
			message: 'q'
		});
		expect(Object.keys(first.questions)).toEqual(['e_d0', 'e_d1', 'e_d2', 'e_t0', 'e_t1']);
		const second = buildContextFinderRequest({
			project: project().project,
			entities,
			message: 'q',
			headingRefs: new Set(['d0'])
		});
		expect(Object.keys(second.questions)).toEqual(['h_d0_0', 'h_d0_1', 'h_d0_2']);
		expect(second.state.packets).toHaveLength(5);
	});

	it('caps a large request by dropping finished tasks first and disclosing the count', () => {
		const entities = buildContextFinderEntities(project());
		const all = JSON.stringify(
			buildContextFinderRequest({ project: project().project, entities, message: 'q' })
		).length;
		const capped = capContextFinderCandidates(project().project, entities, 'q', all - 50);
		expect(capped.unchecked).toBe(1);
		expect(capped.entities.map((e) => e.id)).not.toContain(DONE);
	});
});

describe('ranking', () => {
	it('runs two stages and asks headings only of documents scoring at least 0.3', async () => {
		const entities = buildContextFinderEntities(project());
		const { decide, decider: d } = decider((k) =>
			k === 'e_d0' ? 0.9 : k === 'e_d1' ? 0.2 : k.startsWith('h_') ? 0.7 : 0.1
		);
		const ranking = await rankProjectContext({
			decider: d,
			project: project().project,
			entities,
			message: 'Who runs it?'
		});
		expect(ranking.status).toBe('ranked');
		expect(decide).toHaveBeenCalledTimes(2);
		expect(Object.keys(decide.mock.calls[1]![0].questions)).toEqual([
			'h_d0_0',
			'h_d0_1',
			'h_d0_2'
		]);
		expect(ranking.costUsd).toBeCloseTo(0.0008);
		expect(ranking.stages.map((s) => s.stage)).toEqual(['entities', 'headings']);
	});

	it('keeps the entity ranking when the heading stage fails and reports unavailable otherwise', async () => {
		const entities = buildContextFinderEntities(project());
		const partial = await rankProjectContext({
			decider: decider(() => 0.8, 'headings').decider,
			project: project().project,
			entities,
			message: 'q'
		});
		expect(partial.status).toBe('partial');
		expect(partial.scores.e_d0).toBe(0.8);
		const failed = await rankProjectContext({
			decider: decider(() => 0.8, 'entities').decider,
			project: project().project,
			entities,
			message: 'q'
		});
		expect(failed).toMatchObject({ status: 'unavailable', scores: {} });
	});
});

describe('selection and evidence', () => {
	const entities = buildContextFinderEntities(project());

	it('loads the best sections of relevant documents first', () => {
		const scores: Record<string, number> = {
			e_d0: 0.8,
			e_d1: 0.9,
			e_t0: 0.6,
			e_t1: 0.1,
			h_d0_0: 0.7,
			h_d0_1: 0.2,
			h_d0_2: 0.9,
			h_d1_0: 0.9
		};
		const plan = selectProjectContext({ entities, scores, skipIds: new Set([START]) });
		const full = plan.items.filter((i) => i.tier === 'full');
		// d1's only section is 20K chars, clipped to 2K; everything fits the 14K budget.
		expect(full.map((i) => i.id)).toEqual([BIG, DOC, TASK]);
		expect(full[1]!.sections.map((s) => s.heading)).toEqual([
			'Team & Support',
			'Funding & Operations'
		]);
		expect(plan.items.map((i) => i.id)).not.toContain(START);
		expect(plan.items.find((i) => i.id === DONE)).toBeUndefined(); // below the floor
		const evidence = materializeContextPlan({ plan, entities });
		expect(evidence.status).toBe('selected');
		expect(evidence.full[1]!.excerpts.map((x) => x.heading)).toEqual([
			'Team & Support',
			'Funding & Operations'
		]);
		expect(evidence.full[1]!.excerpts[0]!.text).toContain('Board: grandmother, pastor.');
		expect(evidence.full[1]!.excerpts[1]!.text).toContain('Budget is $300K.');
		expect(evidence.full[0]!.excerpts[0]!.text).toHaveLength(
			CONTEXT_FINDER_POLICY.sectionChars
		);
		expect(evidence.full[0]!.partial).toBe(true);
		expect(evidence.full[2]!.excerpts).toEqual([
			{ heading: null, text: expect.stringContaining('Call the pastor') }
		]);
	});

	it('uses a rank-relative bar with an absolute floor', () => {
		const plan = selectProjectContext({
			entities,
			scores: { e_d0: 0.5, e_d1: 0.29, e_t0: 0.31, e_t1: 0.26 }
		});
		// Bar = max(0.25, 0.6 × 0.5) = 0.3.
		expect(plan.items.filter((i) => i.tier === 'full').map((i) => i.id)).toEqual([DOC, TASK]);
		expect(plan.items.filter((i) => i.tier === 'summary').map((i) => i.id)).toEqual([
			BIG,
			DONE
		]);
		expect(plan.topScore).toBe(0.5);
		const chitChat = selectProjectContext({ entities, scores: { e_d0: 0.1 } });
		expect(chitChat.items).toEqual([]);
		expect(materializeContextPlan({ plan: chitChat, entities }).status).toBe('empty');
	});

	it('loads pins first and never loads drops', () => {
		const plan = selectProjectContext({
			entities,
			scores: { e_d0: 0.9, e_d1: 0.1, e_t0: 0.8 },
			pins: new Set([BIG]),
			drops: new Set([TASK])
		});
		expect(plan.source).toBe('curated');
		expect(plan.items[0]).toMatchObject({ id: BIG, pinned: true, tier: 'full' });
		expect(plan.items.map((i) => i.id)).not.toContain(TASK);
		expect(plan.dropped).toEqual([{ kind: 'task', id: TASK }]);
	});

	it('re-enforces the budget and reports records that disappeared', () => {
		const plan: ContextPlanV1 = {
			version: 'context_plan_v1',
			policy: 'safe_v1',
			source: 'curated',
			topScore: null,
			checked: 5,
			unchecked: 0,
			dropped: [],
			items: [
				{ kind: 'document', id: DOC, title: 'x', tier: 'full', p: null, sections: [] },
				{ kind: 'task', id: id(77), title: 'gone', tier: 'full', p: 0.9, sections: [] },
				{
					kind: 'document',
					id: DOC,
					title: 'dup',
					tier: 'summary',
					p: null,
					sections: []
				}
			]
		};
		const evidence = materializeContextPlan({ plan, entities });
		expect(evidence.full.map((i) => i.id)).toEqual([DOC]);
		expect(evidence.full[0]!.excerpts).toEqual([
			{ heading: null, text: String(project().documents[0]!.content).slice(0, 1500) }
		]);
		expect(evidence.full[0]!.partial).toBe(false);
		expect(evidence.summaries).toEqual([]); // already loaded in full
		expect(evidence.missing).toEqual([{ kind: 'task', id: id(77) }]);
		expect(renderContextEvidenceBlock(evidence)).toContain(
			`document ${DOC} — Questions for Mom`
		);
	});

	it('validates browser-edited plans strictly', () => {
		const plan = selectProjectContext({
			entities,
			scores: { e_d0: 0.9, h_d0_2: 0.8 },
			pins: new Set([TASK])
		});
		expect(parseContextPlanV1(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
		const bad = (patch: (p: any) => void) => {
			const copy = JSON.parse(JSON.stringify(plan));
			patch(copy);
			return () => parseContextPlanV1(copy);
		};
		expect(bad((p) => (p.items[0].id = 'not-a-uuid'))).toThrow();
		expect(bad((p) => p.items.push({ ...p.items[0] }))).toThrow(); // duplicate id
		expect(
			bad(
				(p) =>
					(p.items.find((i: any) => i.kind === 'task').sections = [
						{ heading: 'x', p: 1 }
					])
			)
		).toThrow();
		expect(
			bad((p) => {
				for (let n = 0; n < 6; n++)
					p.items.push({
						kind: 'task',
						id: id(200 + n),
						title: 't',
						tier: 'full',
						p: null,
						pinned: true,
						sections: []
					});
			})
		).toThrow(); // too many pins
		expect(bad((p) => (p.extra = true))).not.toThrow(); // unknown top-level keys are dropped
	});
});

describe('findProjectContext', () => {
	it('materializes a curated plan without calling Jev', async () => {
		const entities = buildContextFinderEntities(project());
		const plan = selectProjectContext({ entities, scores: { e_t0: 0.9 } });
		const { decide, decider: d } = decider(() => 0.5);
		const result = await findProjectContext({
			project: project(),
			message: 'q',
			decider: d,
			plan
		});
		expect(decide).not.toHaveBeenCalled();
		expect(result.evidence.full.map((i) => i.id)).toEqual([TASK]);
	});

	it('skips START HERE, ranks, selects and records the ranker receipt', async () => {
		const { decide, decider: d } = decider((k) => (k === 'e_t0' ? 0.9 : 0.1));
		const result = await findProjectContext({
			project: project(),
			message: 'Next step?',
			decider: d
		});
		expect(Object.keys(decide.mock.calls[0]![0].questions)).not.toContain('e_d2');
		expect(result.evidence).toMatchObject({
			status: 'selected',
			source: 'jev',
			ranker: { status: 'ranked', checked: 4, costUsd: 0.0004 }
		});
		const failed = await findProjectContext({
			project: project(),
			message: 'q',
			decider: decider(() => 1, 'entities').decider
		});
		expect(failed.evidence.status).toBe('unavailable');
	});
});

describe('plan edits', () => {
	const entities = buildContextFinderEntities(project());
	const base = selectProjectContext({
		entities,
		scores: { e_d0: 0.9, h_d0_2: 0.8, e_t0: 0.3, e_d1: 0.28 }
	});

	it('pins a summary with its sections, drops a full item and adds a candidate', () => {
		expect(base.items.map((i) => [i.id, i.tier])).toEqual([
			[DOC, 'full'],
			[TASK, 'summary'],
			[BIG, 'summary']
		]);
		const edited = applyContextPlanEdits(base, {
			pins: [TASK],
			drops: [DOC],
			added: [{ kind: 'task', id: DONE, title: 'Old errand', p: null }]
		});
		expect(edited.source).toBe('curated');
		expect(edited.items.map((i) => [i.id, i.tier, !!i.pinned])).toEqual([
			[TASK, 'full', true],
			[DONE, 'full', true],
			[BIG, 'summary', false]
		]);
		expect(edited.dropped).toEqual([{ kind: 'document', id: DOC }]);
		expect(parseContextPlanV1(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
		const evidence = materializeContextPlan({ plan: edited, entities });
		expect(evidence.full.map((i) => i.id)).toEqual([TASK, DONE]);
		expect(evidence.full.every((i) => i.pinned)).toBe(true);
	});

	it('returns the base plan untouched without edits and caps pins', () => {
		expect(applyContextPlanEdits(base, { pins: [], drops: [], added: [] })).toBe(base);
		const many = applyContextPlanEdits(base, {
			pins: [],
			drops: [],
			added: Array.from({ length: 7 }, (_, n) => ({
				kind: 'task' as const,
				id: id(300 + n),
				title: `t${n}`,
				p: null
			}))
		});
		expect(many.items.filter((i) => i.pinned)).toHaveLength(CONTEXT_FINDER_POLICY.maxPins);
		expect(() => parseContextPlanV1(JSON.parse(JSON.stringify(many)))).not.toThrow();
	});
});

describe('pinned documents', () => {
	// Pilot 2026-09-22: a pinned document Jev had not section-ranked loaded 1,500 characters,
	// hid the answer at ~5,700, and the specialist then skipped reading it.
	it('load at least what a document read returns, in labeled pieces under the string cap', () => {
		const filler = (n: number) =>
			`${'Planning notes line.\n'.repeat(Math.ceil(n / 21))}`.slice(0, n);
		const content = `# Questions\n${filler(3000)}\n## Funding\n${filler(2600)}\n## Team & Support\nThe grandmother sits on the founding board.\n${filler(4000)}`;
		const DOC = 'af000000-0000-4000-8000-0000000000d9';
		const entities = buildContextFinderEntities({
			project: { id: 'af000000-0000-4000-8000-0000000000a1', name: 'School' },
			documents: [
				{ id: DOC, title: 'Questions', updated_at: '2026-09-01T00:00:00Z', content }
			],
			tasks: [],
			goals: [],
			plans: [],
			milestones: [],
			risks: []
		});
		const plan = (pinned: boolean): ContextPlanV1 => ({
			version: 'context_plan_v1',
			policy: 'safe_v1',
			source: 'curated',
			items: [
				{
					kind: 'document',
					id: DOC,
					title: 'Questions',
					tier: 'full',
					p: null,
					...(pinned ? { pinned: true as const } : {}),
					sections: []
				}
			],
			dropped: [],
			topScore: null,
			checked: 1,
			unchecked: 0
		});
		const pinned = materializeContextPlan({ plan: plan(true), entities }).full[0]!;
		const text = pinned.excerpts.map((x) => x.text).join('');
		expect(text).toBe(content.slice(0, CONTEXT_FINDER_POLICY.pinnedOpeningChars));
		expect(text).toContain('grandmother sits on the founding board');
		expect(
			pinned.excerpts.every((x) => x.text.length <= CONTEXT_FINDER_POLICY.sectionChars)
		).toBe(true);
		expect(pinned.excerpts.map((x) => x.heading)).toContain('Team & Support');
		expect(pinned.partial).toBe(true);
		// An unpinned document without ranked sections keeps the short opening.
		const unpinned = materializeContextPlan({ plan: plan(false), entities }).full[0]!;
		expect(unpinned.excerpts).toEqual([
			{ heading: null, text: content.slice(0, CONTEXT_FINDER_POLICY.openingChars) }
		]);
	});
});
