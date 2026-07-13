// apps/web/src/lib/tests/agentic-e2e/harness/attribution.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';

export type HarnessOutcomeClass =
	| 'native'
	| 'self_repaired'
	| 'supervisor_rescued'
	| 'unattributed';

export interface HarnessLlmPassAttribution {
	pass: number;
	passRole: string | null;
	requestedProfile: string | null;
	requestedModels: string[];
	model: string | null;
	provider: string | null;
	finishedReason: string | null;
	streamRetryCount: number;
}

export interface HarnessInterventions {
	projectCreateStopRepair: boolean;
	gatewayMutationStopRepair: boolean;
	skillGateStopRepair: boolean;
	gatewaySchemaRepair: boolean;
	gatewayCreateFieldRepair: boolean;
	validationRepairRounds: number;
	readLoopRepairRank: number;
	forcedSynthesisPasses: number;
	writeIntentCarveOut: boolean;
	lengthContinuations: number;
	documentOrganizationRecovery: boolean;
	finalizationGuard: boolean;
	supervisorRecoveryDecisions: number;
	streamRetries: number;
	evalScaffoldVariant: string | null;
	evalPinnedModels: string[];
}

export interface HarnessTurnAttribution {
	passes: HarnessLlmPassAttribution[];
	interventions: HarnessInterventions | null;
	outcomeClass: HarnessOutcomeClass;
}

type AttributionEventRow = {
	event_type: string;
	payload: unknown;
	sequence_index: number;
};

const SELF_REPAIR_KEYS: Array<keyof HarnessInterventions> = [
	'projectCreateStopRepair',
	'gatewayMutationStopRepair',
	'skillGateStopRepair',
	'gatewaySchemaRepair',
	'gatewayCreateFieldRepair',
	'validationRepairRounds',
	'readLoopRepairRank',
	'lengthContinuations',
	'streamRetries'
];

export function classifyHarnessOutcome(
	passes: HarnessLlmPassAttribution[],
	interventions: HarnessInterventions | null
): HarnessOutcomeClass {
	if (
		passes.length === 0 ||
		!interventions ||
		passes.some((pass) => !pass.model || !pass.provider || !pass.passRole)
	) {
		return 'unattributed';
	}
	if (
		interventions.forcedSynthesisPasses > 0 ||
		interventions.writeIntentCarveOut ||
		interventions.documentOrganizationRecovery ||
		interventions.finalizationGuard ||
		interventions.supervisorRecoveryDecisions > 0
	) {
		return 'supervisor_rescued';
	}
	if (SELF_REPAIR_KEYS.some((key) => isInterventionActive(interventions[key]))) {
		return 'self_repaired';
	}
	return 'native';
}

export async function readTurnAttribution(
	admin: TypedSupabaseClient,
	streamRunId: string,
	options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<HarnessTurnAttribution> {
	const strict = process.env.AGENTIC_ASSERT_TELEMETRY === 'true';
	const deadline = Date.now() + (options.timeoutMs ?? (strict ? 15000 : 1500));
	const intervalMs = options.intervalMs ?? 300;
	let attribution: HarnessTurnAttribution = {
		passes: [],
		interventions: null,
		outcomeClass: 'unattributed'
	};

	do {
		const { data, error } = await admin
			.from('chat_turn_events')
			.select('event_type, payload, sequence_index')
			.eq('stream_run_id', streamRunId)
			.in('event_type', ['llm_pass_completed', 'orchestration_interventions'])
			.order('sequence_index', { ascending: true });
		if (error) {
			throw new Error(`[agentic-e2e] failed to read model attribution: ${error.message}`);
		}

		attribution = buildTurnAttributionFromEvents((data as AttributionEventRow[] | null) ?? []);
		if (attribution.outcomeClass !== 'unattributed') return attribution;
		if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, intervalMs));
	} while (Date.now() < deadline);

	return attribution;
}

export function buildTurnAttributionFromEvents(
	rows: AttributionEventRow[]
): HarnessTurnAttribution {
	const passes = rows
		.filter((row) => row.event_type === 'llm_pass_completed')
		.map((row) => parsePass(row.payload));
	const interventionRow = [...rows]
		.reverse()
		.find((row) => row.event_type === 'orchestration_interventions');
	const interventions = interventionRow ? parseInterventions(interventionRow.payload) : null;
	return { passes, interventions, outcomeClass: classifyHarnessOutcome(passes, interventions) };
}

function parsePass(payload: unknown): HarnessLlmPassAttribution {
	const value = asRecord(payload);
	return {
		pass: asNumber(value.pass),
		passRole: asString(value.pass_role),
		requestedProfile: asString(value.requested_profile),
		requestedModels: asStringArray(value.requested_models),
		model: asString(value.model),
		provider: asString(value.provider),
		finishedReason: asString(value.finished_reason),
		streamRetryCount: asNumber(value.stream_retry_count)
	};
}

function parseInterventions(payload: unknown): HarnessInterventions {
	const value = asRecord(payload);
	return {
		projectCreateStopRepair: value.projectCreateStopRepair === true,
		gatewayMutationStopRepair: value.gatewayMutationStopRepair === true,
		skillGateStopRepair: value.skillGateStopRepair === true,
		gatewaySchemaRepair: value.gatewaySchemaRepair === true,
		gatewayCreateFieldRepair: value.gatewayCreateFieldRepair === true,
		validationRepairRounds: asNumber(value.validationRepairRounds),
		readLoopRepairRank: asNumber(value.readLoopRepairRank),
		forcedSynthesisPasses: asNumber(value.forcedSynthesisPasses),
		writeIntentCarveOut: value.writeIntentCarveOut === true,
		lengthContinuations: asNumber(value.lengthContinuations),
		documentOrganizationRecovery: value.documentOrganizationRecovery === true,
		finalizationGuard: value.finalizationGuard === true,
		supervisorRecoveryDecisions: asNumber(value.supervisorRecoveryDecisions),
		streamRetries: asNumber(value.streamRetries),
		evalScaffoldVariant: asString(value.eval_scaffold_variant),
		evalPinnedModels: asStringArray(value.eval_pinned_models)
	};
}

function isInterventionActive(value: HarnessInterventions[keyof HarnessInterventions]): boolean {
	return value === true || (typeof value === 'number' && value > 0);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
		: [];
}
