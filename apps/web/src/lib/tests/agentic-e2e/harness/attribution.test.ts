// apps/web/src/lib/tests/agentic-e2e/harness/attribution.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildTurnAttributionFromEvents,
	classifyHarnessOutcome,
	type HarnessInterventions,
	type HarnessLlmPassAttribution
} from './attribution';

const pass: HarnessLlmPassAttribution = {
	pass: 1,
	passRole: 'initial_plan',
	requestedProfile: 'balanced',
	requestedModels: [],
	model: 'test/model',
	provider: 'test-provider',
	finishedReason: 'stop',
	streamRetryCount: 0
};

const clean: HarnessInterventions = {
	projectCreateStopRepair: false,
	gatewayMutationStopRepair: false,
	skillGateStopRepair: false,
	gatewaySchemaRepair: false,
	gatewayCreateFieldRepair: false,
	validationRepairRounds: 0,
	readLoopRepairRank: 0,
	forcedSynthesisPasses: 0,
	writeIntentCarveOut: false,
	lengthContinuations: 0,
	documentOrganizationRecovery: false,
	finalizationGuard: false,
	supervisorRecoveryDecisions: 0,
	streamRetries: 0,
	evalScaffoldVariant: null,
	evalPinnedModels: []
};

describe('classifyHarnessOutcome', () => {
	it('does not claim native success when attribution is incomplete', () => {
		expect(classifyHarnessOutcome([], clean)).toBe('unattributed');
		expect(classifyHarnessOutcome([pass], null)).toBe('unattributed');
	});

	it('classifies an intervention-free attributed turn as native', () => {
		expect(classifyHarnessOutcome([pass], clean)).toBe('native');
	});

	it('classifies model retry and repair paths as self-repaired', () => {
		expect(classifyHarnessOutcome([pass], { ...clean, gatewaySchemaRepair: true })).toBe(
			'self_repaired'
		);
		expect(classifyHarnessOutcome([pass], { ...clean, streamRetries: 1 })).toBe(
			'self_repaired'
		);
	});

	it('gives supervisor rescue precedence over self-repair', () => {
		expect(
			classifyHarnessOutcome([pass], {
				...clean,
				gatewaySchemaRepair: true,
				forcedSynthesisPasses: 1
			})
		).toBe('supervisor_rescued');
	});
});

describe('buildTurnAttributionFromEvents', () => {
	it('maps persisted route payloads into pass and intervention attribution', () => {
		const result = buildTurnAttributionFromEvents([
			{
				event_type: 'orchestration_interventions',
				sequence_index: 1,
				payload: {
					...clean,
					eval_scaffold_variant: 'no-static-catalog',
					eval_pinned_models: ['provider/model']
				}
			},
			{
				event_type: 'llm_pass_completed',
				sequence_index: 2,
				payload: {
					pass: 1,
					pass_role: 'initial_plan',
					requested_profile: 'balanced',
					requested_models: ['provider/model'],
					model: 'provider/model',
					provider: 'provider',
					finished_reason: 'stop',
					stream_retry_count: 0
				}
			}
		]);

		expect(result.outcomeClass).toBe('native');
		expect(result.passes[0]).toMatchObject({
			model: 'provider/model',
			provider: 'provider',
			passRole: 'initial_plan'
		});
		expect(result.interventions).toMatchObject({
			evalScaffoldVariant: 'no-static-catalog',
			evalPinnedModels: ['provider/model']
		});
	});
});
