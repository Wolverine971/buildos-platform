// packages/agent-orchestrator/src/testing/harness/open-brief-eval.test.ts
import { describe, expect, it } from 'vitest';

import {
	evaluateFeasibility,
	evaluateGrounding,
	evaluateOpenBriefL0,
	evaluateOpenBriefRun,
	evaluateSwapTest,
	extractOpenBriefAssumptions,
	extractOpenBriefExternalClaims,
	extractOpenBriefQuestions,
	type OpenBriefEvaluationProfile,
	type OpenBriefRunEvidence,
	type OpenBriefSnapshot
} from './open-brief-eval';

const snapshot: OpenBriefSnapshot = {
	snapshot_id: 'project-beta',
	as_of: '2026-07-24T04:30:07.684Z',
	project: {
		id: 'project-1',
		name: 'Project Beta',
		description: 'A thinking environment for people making complex things.',
		now: '84 open tasks, 8 overdue. Target 10 daily active users by 2026-09-30.'
	},
	tasks: [
		{
			id: 'task-1',
			title: 'Record demo video for reactivation emails',
			description: 'The final item blocking the campaign.'
		}
	],
	documents: [
		{
			id: 'doc-1',
			title: 'Marketing Strategy',
			content: 'Primary wedge: authors and video creators. Lead with relief, not hype.'
		}
	],
	goals: [{ id: 'goal-1', name: 'Get 10+ daily active users' }],
	plans: [{ id: 'plan-1', name: '30-Day User Launch Campaign' }]
};

const planProfile: OpenBriefEvaluationProfile = {
	clarificationLabel: 'proceedable',
	loadBearingUnknowns: [],
	requiresPlanShape: true,
	researchBearing: false,
	maxSteps: 8,
	maxTokens: 8_000
};

function validEvidence(overrides: Partial<OpenBriefRunEvidence> = {}): OpenBriefRunEvidence {
	return {
		assistantText: `## Bottom line

- Record the demo first.
- Keep the plan narrow.

I created **Recovery Plan** with the complete rationale.`,
		documents: [
			{
				documentId: 'doc-output-1',
				title: 'Recovery Plan',
				persisted: true,
				author: 'model',
				content: `# Recovery Plan

## Knowns

Project Beta has 84 open tasks and the **Record demo video for reactivation emails** task is blocking the campaign.

## Unknowns

The reactivation conversion rate is not known.

## Steps

1. Record the demo video. Effort: 2 hours.
2. Send the reactivation campaign. Effort: 1 hour.

## Feasibility

The project context is sufficient to begin. Difficulty is moderate because founder bandwidth is the main risk. I need the conversion result after the send before recommending another channel.`
			}
		],
		projectContextReadCount: 1,
		assumptions: ['Assume the existing Marketing Strategy remains the direction.'],
		questions: [],
		externalClaims: [],
		resolvedSourceUrls: [],
		stepsUsed: 4,
		tokensUsed: 2_000,
		repeatedAssignmentCount: 0,
		...overrides
	};
}

describe('open-brief L0 machine checks', () => {
	it('accepts steps with effort, knowns/unknowns, a model document, and a named BLUF', () => {
		const result = evaluateOpenBriefL0({ profile: planProfile, evidence: validEvidence() });
		expect(result.passed).toBe(true);
		expect(
			result.checks.filter((check) => check.applicable).every((check) => check.passed)
		).toBe(true);
	});

	it('rejects week scaffolding even when the rest of the plan is grounded', () => {
		const evidence = validEvidence();
		evidence.documents[0]!.content += '\n\n## Week 1 — Launch\nDo the work.';
		const result = evaluateOpenBriefL0({ profile: planProfile, evidence });
		expect(result.passed).toBe(false);
		expect(result.checks.find((check) => check.id === 'steps_not_schedules')).toMatchObject({
			passed: false
		});
	});

	it('does not let a system-written Research Log satisfy the durable-document contract', () => {
		const evidence = validEvidence({
			documents: [
				{
					documentId: 'research-log',
					title: 'Research Log',
					content: 'System-captured searches.',
					persisted: true,
					author: 'system'
				}
			]
		});
		const result = evaluateOpenBriefL0({ profile: planProfile, evidence });
		expect(result.checks.find((check) => check.id === 'durable_document')).toMatchObject({
			passed: false
		});
	});

	it('allows ask-first and run-with-assumption, but rejects a truly silent load-bearing guess', () => {
		const blockedProfile: OpenBriefEvaluationProfile = {
			...planProfile,
			clarificationLabel: 'blocked',
			loadBearingUnknowns: [
				{
					description: "DJ's intended direction or permission to use best judgment",
					matchTerms: ['direction', 'vision', 'permission', 'best judgment']
				}
			]
		};
		const asked = evaluateOpenBriefL0({
			profile: blockedProfile,
			evidence: validEvidence({
				questions: ['What direction should this take?'],
				assumptions: []
			})
		});
		const assumed = evaluateOpenBriefL0({
			profile: blockedProfile,
			evidence: validEvidence({
				questions: [],
				assumptions: ['I am using my best judgment because no direction document exists.']
			})
		});
		const silent = evaluateOpenBriefL0({
			profile: blockedProfile,
			evidence: validEvidence({ questions: [], assumptions: [] })
		});

		expect(asked.checks.find((check) => check.id === 'silent_guessing')?.passed).toBe(true);
		expect(assumed.checks.find((check) => check.id === 'silent_guessing')?.passed).toBe(true);
		expect(silent.checks.find((check) => check.id === 'silent_guessing')?.passed).toBe(false);
	});

	it('requires every extracted external claim to cite a resolved source', () => {
		const profile = { ...planProfile, researchBearing: true };
		const evidence = validEvidence({
			externalClaims: [
				{
					claim: 'Teams typically convert at 12%.',
					citationUrls: ['https://example.com/study']
				},
				{ claim: 'The market is growing.', citationUrls: [] }
			],
			resolvedSourceUrls: ['https://example.com/study']
		});
		const result = evaluateOpenBriefL0({ profile, evidence });
		expect(result.checks.find((check) => check.id === 'citation_floor')).toMatchObject({
			passed: false
		});
	});
});

describe('open-brief grounding and feasibility', () => {
	it('extracts explicit assumptions, questions, and cited/uncited external claims', () => {
		const text = `## Assumptions

- Use the existing direction.

## Questions for DJ

- May I use my best judgment?

## Findings

Research suggests 42% of teams struggle with this [1].

The market is typically fragmented.

## Sources

[1]: https://example.com/study`;
		expect(extractOpenBriefAssumptions(text)).toEqual(['Use the existing direction.']);
		expect(extractOpenBriefQuestions(text)).toEqual(['May I use my best judgment?']);
		expect(extractOpenBriefExternalClaims(text)).toEqual([
			{
				claim: 'Research suggests 42% of teams struggle with this [1].',
				citationUrls: ['https://example.com/study']
			},
			{ claim: 'The market is typically fragmented.', citationUrls: [] }
		]);
	});

	it('reports a grounding ratio and the unresolved hallucination surface', () => {
		const result = evaluateGrounding({
			text: `Project Beta has 84 open tasks. Start with **Record demo video for reactivation emails**, then launch the **Apollo Ambassador Campaign**. See https://example.com/source.`,
			snapshot,
			resolvedSourceUrls: ['https://example.com/source']
		});
		expect(result.ratio).not.toBeNull();
		expect(
			result.referents.some(
				(referent) => referent.value === 'Project Beta' && referent.resolved
			)
		).toBe(true);
		expect(result.unresolved.map((referent) => referent.value)).toContain(
			'Apollo Ambassador Campaign'
		);
	});

	it('requires an explicit section that assesses context, difficulty, and needs', () => {
		const passing = evaluateFeasibility(`# Feasibility

The project context is sufficient to start. Difficulty is moderate because bandwidth is the main risk. I need the campaign result before step three.`);
		const vague = evaluateFeasibility('This should be feasible. There are some risks.');
		expect(passing.passed).toBe(true);
		expect(vague).toMatchObject({ passed: false, hasExplicitSection: false });
	});

	it('reports blocked ask-rate and proceedable needless-ask rate without conflating them', () => {
		const blocked = evaluateOpenBriefRun({
			profile: {
				...planProfile,
				clarificationLabel: 'blocked',
				loadBearingUnknowns: [
					{ description: 'Direction', matchTerms: ['direction', 'permission'] }
				]
			},
			evidence: validEvidence({ questions: ['Which direction should I use?'] }),
			snapshot
		});
		const proceedable = evaluateOpenBriefRun({
			profile: planProfile,
			evidence: validEvidence({ questions: ['Should I begin?'] }),
			snapshot
		});
		expect(blocked.clarification).toMatchObject({
			askOnBlocked: true,
			needlessAskOnProceedable: null
		});
		expect(proceedable.clarification).toMatchObject({
			askOnBlocked: null,
			needlessAskOnProceedable: true
		});
	});
});

describe('open-brief swap test', () => {
	it('strips entity names and exposes generic shared scaffolding as high overlap', () => {
		const alpha: OpenBriefSnapshot = {
			...snapshot,
			snapshot_id: 'project-alpha',
			project: { id: 'alpha', name: 'Project Alpha' },
			tasks: [{ id: 'alpha-task', title: 'Ship training equipment' }],
			documents: [],
			goals: [],
			plans: []
		};
		const generic = evaluateSwapTest({
			leftText: `# Plan for Project Alpha\n## Knowns\nReview Project Alpha.\n## Steps\n1. Audit the current state.\n2. Execute the highest-impact action.\n## Feasibility\nContext is sufficient.`,
			leftSnapshot: alpha,
			rightText: `# Plan for Project Beta\n## Knowns\nReview Project Beta.\n## Steps\n1. Audit the current state.\n2. Execute the highest-impact action.\n## Feasibility\nContext is sufficient.`,
			rightSnapshot: snapshot
		});
		const specific = evaluateSwapTest({
			leftText:
				'# Training sequence\nShip training equipment, establish a reaction-time baseline, then add pressure drills.',
			leftSnapshot: alpha,
			rightText:
				'# Product and GTM sequence\nRecord the demo, send reactivation emails, then test the author workflow wedge.',
			rightSnapshot: snapshot
		});

		expect(generic.structuralOverlap).toBeGreaterThan(0.7);
		expect(generic.specificityDelta).toBeLessThan(0.3);
		expect(specific.structuralOverlap).toBeLessThan(generic.structuralOverlap);
		expect(specific.specificityDelta).toBeGreaterThan(generic.specificityDelta);
	});
});
