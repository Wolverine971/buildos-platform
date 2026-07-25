// packages/agent-orchestrator/src/application/route-mode/route-mode.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { RouteDecisionSchema } from '../../contracts';
import type { RouteModelPort } from '../../ports';
import { ROUTE_PROMPT_VERSION, ROUTE_SYSTEM_PROMPT } from './prompts';
import { routeRequest } from './route-mode';
import { routeRequestWithReview } from './route-mode-with-review';
import type { RouteProposal } from './route-proposal';
import type { WorkflowScopeFact } from './workflow-scope';
import {
	buildPhaseAWorldCard,
	estimateWorldCardTokens,
	serializeWorldCard,
	WORLD_CARD_MAX_ESTIMATED_TOKENS,
	type WorldCardSnapshotInput
} from './world-card';

function loadSnapshot(): WorldCardSnapshotInput {
	return JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL(
					'../../testing/harness/fixtures/project-alpha.snapshot.json',
					import.meta.url
				)
			),
			'utf8'
		)
	) as WorldCardSnapshotInput;
}

const snapshot = loadSnapshot();
const worldCard = buildPhaseAWorldCard(snapshot);

function proposal(overrides: Partial<RouteProposal> = {}): RouteProposal {
	return {
		schema_version: 1,
		route: 'direct',
		reason_code: 'simple_read',
		objective: 'Read the requested project information.',
		confidence: 0.9,
		questions: [],
		gap: null,
		...overrides
	} as RouteProposal;
}

function modelReturning(
	...values: unknown[]
): RouteModelPort & { generateJson: ReturnType<typeof vi.fn> } {
	const generateJson = vi.fn();
	for (const value of values) generateJson.mockResolvedValueOnce(value);
	return { generateJson };
}

function scopeFact(
	classification: WorkflowScopeFact['classification'],
	confidence = 0.95
): WorkflowScopeFact {
	return { schema_version: 1, classification, confidence };
}

describe('Phase A world card', () => {
	it('is deterministic, bounded, and contains only lightweight project identity', () => {
		const second = buildPhaseAWorldCard(snapshot);
		const serialized = serializeWorldCard(worldCard);

		expect(second).toEqual(worldCard);
		expect(worldCard.estimated_tokens).toBe(estimateWorldCardTokens(serialized));
		expect(worldCard.estimated_tokens).toBeLessThanOrEqual(WORLD_CARD_MAX_ESTIMATED_TOKENS);
		expect(worldCard.current_project.entity_counts).toEqual({
			goals: 1,
			plans: 3,
			tasks: 11,
			documents: 5,
			relationships: 3
		});
		expect(serialized).not.toContain('hostile-pitch dry-fire session');
		expect(serialized).not.toContain('The weekly Sunday review logs');
	});
});

describe('Phase A route mode', () => {
	it('states the scope policy as general tests rather than corpus-shaped rules', () => {
		expect(ROUTE_PROMPT_VERSION).toBe('phase-a-route-prompt-v5');
		expect(ROUTE_SYSTEM_PROMPT).toContain('UNRESOLVED PROJECT REFERENT');
		expect(ROUTE_SYSTEM_PROMPT).toContain('SELF-CONTAINED');
		expect(ROUTE_SYSTEM_PROMPT).toContain('OUT OF SCOPE');
		expect(ROUTE_SYSTEM_PROMPT).toContain('project.read may retrieve records');
	});

	it('makes the workflow reason code an ordered plan-selection test', () => {
		// A2 compiles the execution plan from `reason_code`, so the prompt has to select it with
		// a deterministic first-match procedure. See PHASE_A_AUDIT_2026-07-25.md B1.
		const procedure = ROUTE_SYSTEM_PROMPT.slice(ROUTE_SYSTEM_PROMPT.indexOf('Step 3'));
		for (const [order, code] of [
			'single_source_research',
			'context_research_recommendation',
			'multi_source_research',
			'multi_step_synthesis'
		].entries()) {
			expect(procedure).toContain(`${order + 1}. ${code}`);
		}
	});

	it('compiles a valid direct RouteDecision in one model call', async () => {
		const model = modelReturning(proposal());
		const result = await routeRequest({ worldCard, request: 'What is this score?', model });

		expect(RouteDecisionSchema.parse(result.decision)).toEqual(result.decision);
		expect(result.decision).toMatchObject({
			route: 'direct',
			reason_code: 'simple_read',
			risk: 'low'
		});
		expect(result.attempts).toBe(1);
		expect(result.repaired).toBe(false);
		expect(model.generateJson).toHaveBeenCalledTimes(1);
	});

	it('compiles workflow, clarify, and capability-gap payloads into the core contract', async () => {
		const cases: RouteProposal[] = [
			proposal({
				route: 'workflow',
				reason_code: 'multi_source_research',
				objective: 'Research a multi-part product workflow.'
			}),
			proposal({
				route: 'clarify',
				reason_code: 'missing_required_context',
				questions: ['Which content project should I use?']
			}),
			proposal({
				route: 'capability_gap',
				reason_code: 'unsupported_capability',
				gap: {
					capability: 'Connected inbox search',
					description: 'No inbox-read capability is present in the world card.',
					suggested_resolution: 'Connect an approved read-only inbox tool.'
				}
			})
		];

		for (const candidate of cases) {
			const result = await routeRequest({
				worldCard,
				request: 'request',
				model: modelReturning(candidate)
			});
			expect(RouteDecisionSchema.safeParse(result.decision).success).toBe(true);
		}
	});

	it('compiles workflow topology from request features instead of the reason label', async () => {
		const cases = [
			{
				request: 'Analyze https://example.com/report for the decision.',
				reasonCode: 'context_research_recommendation' as const,
				stageKey: 'research',
				stepCount: 1
			},
			{
				request: 'Research which service is best for this project.',
				reasonCode: 'multi_source_research' as const,
				stageKey: 'gather-project-context',
				stepCount: 1
			},
			{
				request:
					'Compare onboarding practice, accessibility risks, and validation methods.',
				reasonCode: 'context_research_recommendation' as const,
				stageKey: 'research',
				stepCount: 2
			}
		];

		for (const testCase of cases) {
			const result = await routeRequest({
				worldCard,
				request: testCase.request,
				model: modelReturning(
					proposal({
						route: 'workflow',
						reason_code: testCase.reasonCode,
						objective: 'Collect relevant external evidence.'
					})
				)
			});

			if (result.decision.route !== 'workflow') {
				throw new Error(`Expected workflow decision, received ${result.decision.route}`);
			}
			expect(result.decision.initial_stage.client_stage_key).toBe(testCase.stageKey);
			expect(result.decision.initial_stage.steps).toHaveLength(testCase.stepCount);
		}
	});

	it('makes exactly one bounded repair after invalid model output', async () => {
		const model = modelReturning(
			{ ...proposal(), reason_code: 'multi_source_research' },
			proposal({ route: 'workflow', reason_code: 'multi_source_research' })
		);
		const result = await routeRequest({ worldCard, request: 'Research this.', model });

		expect(result.decision.route).toBe('workflow');
		expect(result.attempts).toBe(2);
		expect(result.repaired).toBe(true);
		expect(model.generateJson).toHaveBeenCalledTimes(2);
		expect(model.generateJson.mock.calls[1]?.[0]).toMatchObject({ attempt: 2 });
		expect(model.generateJson.mock.calls[1]?.[0].userPrompt).toContain('Validation issues');
	});

	it('fails after the one allowed repair remains invalid', async () => {
		const model = modelReturning({ route: 'direct' }, { route: 'workflow' });
		await expect(routeRequest({ worldCard, request: 'Request', model })).rejects.toMatchObject({
			name: 'RouteModeFailure',
			attempts: 2
		});
		expect(model.generateJson).toHaveBeenCalledTimes(2);
	});
});

describe('Phase A fast-first route review', () => {
	it('keeps an uncontested direct result on the fast path', async () => {
		const primaryModel = modelReturning(proposal());
		const reviewModel = modelReturning(
			proposal({ route: 'clarify', reason_code: 'ambiguous_scope', questions: ['Scope?'] })
		);
		const result = await routeRequestWithReview({
			worldCard,
			request: 'What tasks need action next?',
			primaryModel,
			reviewModel
		});

		expect(result.decision.route).toBe('direct');
		expect(result.reviewed).toBe(false);
		expect(primaryModel.generateJson).toHaveBeenCalledTimes(1);
		expect(reviewModel.generateJson).not.toHaveBeenCalled();
	});

	it('compiles an observable supplied source without invoking the scope model', async () => {
		const reviewModel = modelReturning(scopeFact('missing_required_scope'));
		const result = await routeRequestWithReview({
			worldCard,
			request: 'Analyze https://example.com/report for this decision.',
			primaryModel: modelReturning(
				proposal({
					route: 'clarify',
					reason_code: 'ambiguous_scope',
					questions: ['Scope?']
				})
			),
			reviewModel
		});

		expect(result.decision).toMatchObject({
			route: 'workflow',
			reason_code: 'single_source_research'
		});
		expect(result.reviewed).toBe(false);
		expect(reviewModel.generateJson).not.toHaveBeenCalled();
	});

	it('uses a narrow scope fact to compile conflicting research requests', async () => {
		for (const primary of [
			proposal(),
			proposal({
				route: 'clarify',
				reason_code: 'ambiguous_scope',
				questions: ['What should I research?']
			})
		]) {
			const result = await routeRequestWithReview({
				worldCard,
				request: 'Please research which app I should use for this project.',
				primaryModel: modelReturning(primary),
				reviewModel: modelReturning(scopeFact('current_project_then_research'))
			});

			expect(result.decision.route).toBe('workflow');
			expect(result.decision.reason_code).toBe('context_research_recommendation');
			expect(result.reviewReason).toBe('workflow_scope_resolution');
			expect(result.reviewResult).toBeNull();
			expect(result.scopeResult?.fact.classification).toBe('current_project_then_research');
		}
	});

	it('reviews primary workflow proposals and compiles missing scope to clarify', async () => {
		const result = await routeRequestWithReview({
			worldCard,
			request: 'Please research this and let me know.',
			primaryModel: modelReturning(
				proposal({ route: 'workflow', reason_code: 'multi_source_research' })
			),
			reviewModel: modelReturning(scopeFact('missing_required_scope'))
		});

		expect(result.decision).toMatchObject({
			route: 'clarify',
			reason_code: 'missing_required_context'
		});
		if (result.decision.route !== 'clarify') throw new Error('Expected clarify decision');
		expect(result.decision.questions).toHaveLength(1);
	});

	it('leaves genuine non-research multi-step proposals outside the research classifier', async () => {
		const reviewModel = modelReturning(scopeFact('bounded_project_read'));
		const result = await routeRequestWithReview({
			worldCard,
			request: 'Turn this supplied specification into a dependency-ordered explanation.',
			primaryModel: modelReturning(
				proposal({ route: 'workflow', reason_code: 'multi_step_synthesis' })
			),
			reviewModel
		});

		expect(result.decision).toMatchObject({
			route: 'workflow',
			reason_code: 'multi_step_synthesis'
		});
		expect(result.reviewed).toBe(false);
		expect(reviewModel.generateJson).not.toHaveBeenCalled();
	});

	it('keeps capability gaps outside the scope classifier', async () => {
		const reviewModel = modelReturning(scopeFact('self_contained_research'));
		const result = await routeRequestWithReview({
			worldCard,
			request: 'Research my connected inbox.',
			primaryModel: modelReturning(
				proposal({
					route: 'capability_gap',
					reason_code: 'unsupported_capability',
					gap: {
						capability: 'email.search',
						description: 'No inbox tool is available.',
						suggested_resolution: null
					}
				})
			),
			reviewModel
		});

		expect(result.decision.route).toBe('capability_gap');
		expect(reviewModel.generateJson).not.toHaveBeenCalled();
	});

	it('uses the reviewer when the primary exhausts its bounded repair', async () => {
		const primaryModel = modelReturning({ route: 'direct' }, { route: 'direct' });
		const result = await routeRequestWithReview({
			worldCard,
			request: 'Research this.',
			primaryModel,
			reviewModel: modelReturning(
				proposal({ route: 'workflow', reason_code: 'multi_source_research' })
			)
		});

		expect(result.decision.route).toBe('workflow');
		expect(result.reviewReason).toBe('primary_failure');
		expect(result.primaryError).toContain('bounded repair');
		expect(primaryModel.generateJson).toHaveBeenCalledTimes(2);
	});
});
