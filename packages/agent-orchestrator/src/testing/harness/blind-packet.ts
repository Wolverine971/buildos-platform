import {
	BLIND_JUDGE_MECHANIC_SHA256,
	BLIND_JUDGE_POLICY_VERSION,
	createBlindMapping,
	createBlindPair,
	type BlindMapping,
	type BlindPair
} from './blind-judge';

export interface ComparableOutputRun {
	scenarioId: string;
	runIndex: number;
	scored?: boolean;
	assistantText: string;
	allRequiredChecksPassed: boolean;
}

export interface BlindPacketScenario {
	scenarioId: string;
	requestText: string;
	acceptanceCriteria: string[];
}

export interface BlindPacketMappingEntry extends BlindMapping {
	workflowRequiredChecksPassed: boolean;
	controlRequiredChecksPassed: boolean;
}

export interface BlindComparisonPacket {
	schema_version: 1;
	policy_version: typeof BLIND_JUDGE_POLICY_VERSION;
	mechanic_sha256: string;
	corpus_version: string;
	pairs: BlindPair[];
}

export interface BlindMappingPacket {
	schema_version: 1;
	policy_version: typeof BLIND_JUDGE_POLICY_VERSION;
	mechanic_sha256: string;
	corpus_version: string;
	mappings: BlindPacketMappingEntry[];
}

function scoredByPair(
	lane: string,
	runs: ComparableOutputRun[]
): Map<string, ComparableOutputRun> {
	const result = new Map<string, ComparableOutputRun>();
	for (const run of runs.filter((candidate) => candidate.scored !== false)) {
		const key = `${run.scenarioId}-r${run.runIndex}`;
		if (result.has(key)) throw new Error(`${lane} has duplicate scored output for ${key}`);
		result.set(key, run);
	}
	return result;
}

export function buildBlindComparisonPackets(params: {
	corpusVersion: string;
	scenarios: BlindPacketScenario[];
	workflowRuns: ComparableOutputRun[];
	controlRuns: ComparableOutputRun[];
}): { comparison: BlindComparisonPacket; mapping: BlindMappingPacket } {
	if (params.scenarios.length !== 3) {
		throw new Error('A2 blind comparison requires exactly three scenarios');
	}
	const workflow = scoredByPair('workflow', params.workflowRuns);
	const control = scoredByPair('control', params.controlRuns);
	const pairs: BlindPair[] = [];
	const mappings: BlindPacketMappingEntry[] = [];

	for (const scenario of params.scenarios) {
		for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
			const pairId = `${scenario.scenarioId}-r${runIndex}`;
			const workflowRun = workflow.get(pairId);
			const controlRun = control.get(pairId);
			if (!workflowRun || !controlRun) {
				throw new Error(`Missing scored workflow/control output for ${pairId}`);
			}
			const mapping = createBlindMapping({
				corpusVersion: params.corpusVersion,
				scenarioId: scenario.scenarioId,
				runIndex
			});
			pairs.push(
				createBlindPair({
					mapping,
					requestText: scenario.requestText,
					acceptanceCriteria: scenario.acceptanceCriteria,
					workflowResponse:
						workflowRun.assistantText.trim() || '[No user-visible response was captured.]',
					controlResponse:
						controlRun.assistantText.trim() || '[No user-visible response was captured.]'
				})
			);
			mappings.push({
				...mapping,
				workflowRequiredChecksPassed: workflowRun.allRequiredChecksPassed,
				controlRequiredChecksPassed: controlRun.allRequiredChecksPassed
			});
		}
	}

	if (pairs.length !== 9 || mappings.length !== 9) {
		throw new Error('A2 blind packet must contain exactly nine pairs');
	}
	return {
		comparison: {
			schema_version: 1,
			policy_version: BLIND_JUDGE_POLICY_VERSION,
			mechanic_sha256: BLIND_JUDGE_MECHANIC_SHA256,
			corpus_version: params.corpusVersion,
			pairs
		},
		mapping: {
			schema_version: 1,
			policy_version: BLIND_JUDGE_POLICY_VERSION,
			mechanic_sha256: BLIND_JUDGE_MECHANIC_SHA256,
			corpus_version: params.corpusVersion,
			mappings
		}
	};
}

export function buildDjScoringMarkdown(packet: BlindComparisonPacket): string {
	const sections = packet.pairs.map(
		(pair, index) => `## Pair ${index + 1}: ${pair.pair_id}

### Request

${pair.request_text}

### Acceptance criteria

${pair.acceptance_criteria.map((criterion) => `- ${criterion}`).join('\n')}

### Response A

${pair.response_a}

### Response B

${pair.response_b}

### DJ score

Winner: \`A\` / \`B\` / \`tie\`

Notes (optional):
`);

	return `# Phase A A2 — DJ blind scoring packet

Mechanic: \`${packet.policy_version}\`  
SHA-256: \`${packet.mechanic_sha256}\`

Score each pair independently as A, B, or tie. Use only the request, acceptance criteria, and
response content. Do not infer which architecture produced a response. Complete all nine before
viewing any automated-panel result.

${sections.join('\n\n---\n\n')}
`;
}
