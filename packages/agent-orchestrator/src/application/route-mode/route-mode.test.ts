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
	it('versions the post-first-pass scope policy without changing the world card', () => {
		expect(ROUTE_PROMPT_VERSION).toBe('phase-a-route-prompt-v4');
		expect(ROUTE_SYSTEM_PROMPT).toContain('project.read may retrieve records');
		expect(ROUTE_SYSTEM_PROMPT).toContain('current_project makes a phrase');
		expect(ROUTE_SYSTEM_PROMPT).toContain('work domain absent from');
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

	it('reviews a direct or clarify result that conflicts with explicit research intent', async () => {
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
				reviewModel: modelReturning(
					proposal({
						route: 'workflow',
						reason_code: 'context_research_recommendation'
					})
				)
			});

			expect(result.decision.route).toBe('workflow');
			expect(result.reviewReason).toBe('research_intent_conflict');
		}
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
