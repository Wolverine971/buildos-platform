// packages/agentic-chat-runtime/src/parity-scenarios.ts
import {
	diffAgenticChatParityRunsV1,
	type AgenticChatParityDiffV1,
	type AgenticChatParityDifferenceKindV1,
	type AgenticChatParityDifferenceV1,
	type AgenticChatParityRunV1
} from './parity';
import { AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1 } from './partial-cancellation-parity-fixture';
import { AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1 } from './mutating-tool-parity-fixture';
import { AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1 } from './provider-error-parity-fixture';
import { AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1 } from './read-only-tool-parity-fixture';
import { AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1 } from './text-only-success-parity-fixture';
import { AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1 } from './supervisor-question-parity-fixture';
import { AGENTIC_CHAT_TIMEOUT_GOLDEN_V1 } from './timeout-parity-fixture';

/**
 * The eight differential scenario classes the migration plan requires before
 * Phase 4 can exit (docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md:882).
 */
export const AGENTIC_CHAT_PARITY_SCENARIO_CLASSES_V1 = [
	'success',
	'clarification',
	'read_only_tools',
	'mutating_tools',
	'supervisor_checkpoint',
	'cancellation',
	'timeout',
	'provider_error'
] as const;

export type AgenticChatParityScenarioClassV1 =
	(typeof AGENTIC_CHAT_PARITY_SCENARIO_CLASSES_V1)[number];

export type AgenticChatKnownParityDivergenceV1 = {
	path: string;
	kind: AgenticChatParityDifferenceKindV1;
	reason: string;
};

export type AgenticChatImplementedParityScenarioV1 = {
	scenarioClass: AgenticChatParityScenarioClassV1;
	status: 'implemented';
	golden: AgenticChatParityRunV1;
	/**
	 * JSON-pointer prefixes whose differences are a ratified contract split,
	 * not a parity gap. This includes the worker's async timing ownership and,
	 * for a timeout before any provider response, its exact unknown-token and
	 * no-first-response-snapshot semantics.
	 */
	workerDeliberateDivergencePrefixes: readonly string[];
	/**
	 * The exact open parity gaps the worker adapter still has against the
	 * legacy golden. This inventory is the in-code parity ledger: closing a
	 * gap must shrink this list in the same change, and a new difference
	 * outside this list fails the worker suite. Never widen this list to make
	 * a run pass without a ratified contract decision.
	 */
	workerOpenDivergences: readonly AgenticChatKnownParityDivergenceV1[];
};

export type AgenticChatBlockedParityScenarioV1 = {
	scenarioClass: AgenticChatParityScenarioClassV1;
	status: 'blocked';
	/** The tasker/51 work package that must land before the golden can exist. */
	blockedOn: string;
};

export type AgenticChatParityScenarioV1 =
	| AgenticChatImplementedParityScenarioV1
	| AgenticChatBlockedParityScenarioV1;

const WORKER_DONE_EVENT_GAP_REASON =
	'Worker done payload carries executor terminal fields (failure_code, status) the legacy done event does not emit';

function timingDivergencePrefix(golden: AgenticChatParityRunV1): string {
	const indices = golden.events.flatMap((event, index) =>
		event.type === 'timing' ? [index] : []
	);
	if (indices.length !== 1) {
		throw new Error('Agentic Chat parity golden must contain exactly one timing event');
	}
	return `/events/${indices[0]}/payload/timing/`;
}

function doneEventGapInventory(
	golden: AgenticChatParityRunV1
): readonly AgenticChatKnownParityDivergenceV1[] {
	const indices = golden.events.flatMap((event, index) => (event.type === 'done' ? [index] : []));
	if (indices.length !== 1) {
		throw new Error('Agentic Chat parity golden must contain exactly one done event');
	}
	return [
		{
			path: `/events/${indices[0]}/payload/failure_code`,
			kind: 'unexpected_in_actual',
			reason: WORKER_DONE_EVENT_GAP_REASON
		},
		{
			path: `/events/${indices[0]}/payload/status`,
			kind: 'unexpected_in_actual',
			reason: WORKER_DONE_EVENT_GAP_REASON
		}
	];
}

function mutationEffectDivergencePrefixes(golden: AgenticChatParityRunV1): readonly string[] {
	const resultIndices = golden.events.flatMap((event, index) =>
		event.type === 'tool_result' ? [index] : []
	);
	if (resultIndices.length !== 1 || golden.toolExecutions.length !== 1) {
		throw new Error('Agentic Chat mutation golden must contain exactly one tool receipt');
	}
	const resultIndex = resultIndices[0]!;
	return [
		`/events/${resultIndex}/payload/result/effect_id`,
		`/events/${resultIndex}/payload/result/replayed`,
		'/toolExecutions/0/effect_id'
	];
}

function timeoutDivergencePrefixes(golden: AgenticChatParityRunV1): readonly string[] {
	const lifecycleEvents = golden.metadata.lifecycle_events;
	if (!Array.isArray(lifecycleEvents)) {
		throw new Error('Agentic Chat timeout golden must contain lifecycle events');
	}
	const snapshotIndex = lifecycleEvents.findIndex(
		(event) =>
			Boolean(event) &&
			typeof event === 'object' &&
			!Array.isArray(event) &&
			(event as Record<string, unknown>).event_type === 'prompt_snapshot_created'
	);
	if (snapshotIndex < 0) {
		throw new Error('Agentic Chat timeout golden must contain prompt snapshot lifecycle');
	}
	return [
		timingDivergencePrefix(golden),
		'/outcome/total_tokens',
		`/metadata/lifecycle_events/${snapshotIndex}`,
		'/metadata/prompt_snapshot_count'
	];
}

export const AGENTIC_CHAT_PARITY_SCENARIOS_V1: readonly AgenticChatParityScenarioV1[] = [
	{
		scenarioClass: 'success',
		status: 'implemented',
		golden: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: [
			timingDivergencePrefix(AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1)
		],
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1)
	},
	{
		scenarioClass: 'clarification',
		status: 'implemented',
		golden: AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: [
			timingDivergencePrefix(AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1)
		],
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1)
	},
	{
		scenarioClass: 'read_only_tools',
		status: 'implemented',
		golden: AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: [
			timingDivergencePrefix(AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1)
		],
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1)
	},
	{
		scenarioClass: 'mutating_tools',
		status: 'implemented',
		golden: AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: [
			timingDivergencePrefix(AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1),
			...mutationEffectDivergencePrefixes(AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1)
		],
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1)
	},
	{
		scenarioClass: 'supervisor_checkpoint',
		status: 'implemented',
		golden: AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: [
			timingDivergencePrefix(AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1)
		],
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1)
	},
	{
		scenarioClass: 'cancellation',
		status: 'implemented',
		golden: AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: [
			timingDivergencePrefix(AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1)
		],
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1)
	},
	{
		scenarioClass: 'timeout',
		status: 'implemented',
		golden: AGENTIC_CHAT_TIMEOUT_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: timeoutDivergencePrefixes(
			AGENTIC_CHAT_TIMEOUT_GOLDEN_V1
		),
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_TIMEOUT_GOLDEN_V1)
	},
	{
		// Previously asserted only structurally; this exact inventory tightens
		// that contract to the same done-event gap the other scenarios carry.
		scenarioClass: 'provider_error',
		status: 'implemented',
		golden: AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1,
		workerDeliberateDivergencePrefixes: [
			timingDivergencePrefix(AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1)
		],
		workerOpenDivergences: doneEventGapInventory(AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1)
	}
];

export function getAgenticChatParityScenarioV1(
	scenarioClass: AgenticChatParityScenarioClassV1
): AgenticChatParityScenarioV1 {
	const scenario = AGENTIC_CHAT_PARITY_SCENARIOS_V1.find(
		(entry) => entry.scenarioClass === scenarioClass
	);
	if (!scenario) {
		throw new Error(`Agentic Chat parity scenario is not registered: ${scenarioClass}`);
	}
	return scenario;
}

function getImplementedScenario(
	scenarioClass: AgenticChatParityScenarioClassV1
): AgenticChatImplementedParityScenarioV1 {
	const scenario = getAgenticChatParityScenarioV1(scenarioClass);
	if (scenario.status !== 'implemented') {
		throw new Error(
			`Agentic Chat parity scenario is blocked, not implemented: ${scenarioClass} (${scenario.blockedOn})`
		);
	}
	return scenario;
}

export function listImplementedAgenticChatParityScenariosV1(): readonly AgenticChatImplementedParityScenarioV1[] {
	return AGENTIC_CHAT_PARITY_SCENARIOS_V1.filter(
		(scenario): scenario is AgenticChatImplementedParityScenarioV1 =>
			scenario.status === 'implemented'
	);
}

export function listBlockedAgenticChatParityScenariosV1(): readonly AgenticChatBlockedParityScenarioV1[] {
	return AGENTIC_CHAT_PARITY_SCENARIOS_V1.filter(
		(scenario): scenario is AgenticChatBlockedParityScenarioV1 => scenario.status === 'blocked'
	);
}

export type AgenticChatParityPartitionV1 = {
	deliberate: readonly AgenticChatParityDifferenceV1[];
	contested: readonly AgenticChatParityDifferenceV1[];
};

function matchesJsonPointerPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

export function partitionAgenticChatParityDifferencesV1(
	differences: readonly AgenticChatParityDifferenceV1[],
	deliberatePrefixes: readonly string[]
): AgenticChatParityPartitionV1 {
	const deliberate: AgenticChatParityDifferenceV1[] = [];
	const contested: AgenticChatParityDifferenceV1[] = [];
	for (const difference of differences) {
		if (
			deliberatePrefixes.some((prefix) => matchesJsonPointerPrefix(difference.path, prefix))
		) {
			deliberate.push(difference);
		} else {
			contested.push(difference);
		}
	}
	return { deliberate, contested };
}

export type AgenticChatWorkerParityEvaluationV1 = {
	scenarioClass: AgenticChatParityScenarioClassV1;
	diff: AgenticChatParityDiffV1;
	deliberate: readonly AgenticChatParityDifferenceV1[];
	contested: readonly AgenticChatParityDifferenceV1[];
	expectedOpenDivergences: readonly AgenticChatKnownParityDivergenceV1[];
	/**
	 * True when the untruncated contested inventory equals the registered open
	 * divergences exactly (path and kind, in diff order).
	 */
	matchesContract: boolean;
};

export function evaluateAgenticChatWorkerParityRunV1(
	scenarioClass: AgenticChatParityScenarioClassV1,
	actual: AgenticChatParityRunV1
): AgenticChatWorkerParityEvaluationV1 {
	const scenario = getImplementedScenario(scenarioClass);
	const diff = diffAgenticChatParityRunsV1(scenario.golden, actual);
	const { deliberate, contested } = partitionAgenticChatParityDifferencesV1(
		diff.differences,
		scenario.workerDeliberateDivergencePrefixes
	);
	const contestedInventory = contested.map(({ path, kind }) => ({ path, kind }));
	const expectedInventory = scenario.workerOpenDivergences.map(({ path, kind }) => ({
		path,
		kind
	}));
	const matchesContract =
		!diff.truncated && JSON.stringify(contestedInventory) === JSON.stringify(expectedInventory);
	return {
		scenarioClass,
		diff,
		deliberate,
		contested,
		expectedOpenDivergences: scenario.workerOpenDivergences,
		matchesContract
	};
}

export type AgenticChatLegacyParityEvaluationV1 = {
	scenarioClass: AgenticChatParityScenarioClassV1;
	diff: AgenticChatParityDiffV1;
	/** The legacy adapter authored the goldens; its contract is exact equality. */
	matchesContract: boolean;
};

export function evaluateAgenticChatLegacyParityRunV1(
	scenarioClass: AgenticChatParityScenarioClassV1,
	actual: AgenticChatParityRunV1
): AgenticChatLegacyParityEvaluationV1 {
	const scenario = getImplementedScenario(scenarioClass);
	const diff = diffAgenticChatParityRunsV1(scenario.golden, actual);
	return { scenarioClass, diff, matchesContract: diff.matches };
}

export type AgenticChatParityCoverageTrackerV1<Evaluation> = {
	evaluate(
		scenarioClass: AgenticChatParityScenarioClassV1,
		actual: AgenticChatParityRunV1
	): Evaluation;
	exercised(): readonly AgenticChatParityScenarioClassV1[];
	/** Implemented scenario classes this suite has not evaluated yet. */
	missing(): readonly AgenticChatParityScenarioClassV1[];
};

function createCoverageTracker<Evaluation>(
	evaluateRun: (
		scenarioClass: AgenticChatParityScenarioClassV1,
		actual: AgenticChatParityRunV1
	) => Evaluation
): AgenticChatParityCoverageTrackerV1<Evaluation> {
	const exercised = new Set<AgenticChatParityScenarioClassV1>();
	return {
		evaluate(scenarioClass, actual) {
			const evaluation = evaluateRun(scenarioClass, actual);
			exercised.add(scenarioClass);
			return evaluation;
		},
		exercised() {
			return [...exercised];
		},
		missing() {
			return listImplementedAgenticChatParityScenariosV1()
				.map((scenario) => scenario.scenarioClass)
				.filter((scenarioClass) => !exercised.has(scenarioClass));
		}
	};
}

/**
 * One tracker per adapter test suite. Every implemented registry scenario must
 * flow through `evaluate` before the suite's final coverage assertion checks
 * `missing()`; registering a new scenario therefore fails both adapter suites
 * until each one exercises it.
 */
export function createAgenticChatWorkerParityCoverageTrackerV1(): AgenticChatParityCoverageTrackerV1<AgenticChatWorkerParityEvaluationV1> {
	return createCoverageTracker(evaluateAgenticChatWorkerParityRunV1);
}

export function createAgenticChatLegacyParityCoverageTrackerV1(): AgenticChatParityCoverageTrackerV1<AgenticChatLegacyParityEvaluationV1> {
	return createCoverageTracker(evaluateAgenticChatLegacyParityRunV1);
}
