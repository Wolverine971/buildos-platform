// apps/web/src/lib/tests/agentic-e2e/harness/attribution.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildWorkerTurnAttributionFromUsage,
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
	evalScaffoldFingerprint: null,
	evalScaffoldConfig: null,
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
					eval_scaffold_fingerprint: 'scaffold-sha',
					eval_scaffold_config: {
						version: 1,
						variant: 'no-static-catalog'
					},
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
			evalScaffoldFingerprint: 'scaffold-sha',
			evalScaffoldConfig: {
				version: 1,
				variant: 'no-static-catalog'
			},
			evalPinnedModels: ['provider/model']
		});
	});
});

describe('buildWorkerTurnAttributionFromUsage', () => {
	it('uses exact worker provider usage without requiring legacy intervention events', () => {
		const result = buildWorkerTurnAttributionFromUsage([
			{
				id: 'usage-1',
				model_requested: 'test/model',
				model_used: 'test/model',
				provider: 'test-provider',
				profile: null,
				operation_type: 'agentic_chat_worker_stream',
				prompt_tokens: 10,
				completion_tokens: 2,
				total_tokens: 12,
				total_cost_usd: 0.001,
				request_started_at: '2026-08-09T00:00:00.000Z',
				request_completed_at: '2026-08-09T00:00:01.000Z'
			}
		]);

		expect(result).toMatchObject({
			outcomeClass: 'native',
			interventions: null,
			passes: [
				{
					pass: 1,
					passRole: 'agentic_chat_worker_stream',
					model: 'test/model',
					provider: 'test-provider'
				}
			]
		});
	});

	it('fails closed for non-worker or incomplete usage attribution', () => {
		const legacyUsage = {
			id: 'usage-1',
			model_requested: 'test/model',
			model_used: 'test/model',
			provider: 'test-provider',
			profile: null,
			operation_type: 'agent_chat_stream',
			prompt_tokens: 10,
			completion_tokens: 2,
			total_tokens: 12,
			total_cost_usd: 0.001,
			request_started_at: '2026-08-09T00:00:00.000Z',
			request_completed_at: '2026-08-09T00:00:01.000Z'
		};

		expect(buildWorkerTurnAttributionFromUsage([legacyUsage]).outcomeClass).toBe(
			'unattributed'
		);
		expect(
			buildWorkerTurnAttributionFromUsage([
				{ ...legacyUsage, operation_type: 'agentic_chat_worker_stream', provider: null }
			]).outcomeClass
		).toBe('unattributed');
	});
});
