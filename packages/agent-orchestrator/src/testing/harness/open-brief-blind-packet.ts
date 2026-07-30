// packages/agent-orchestrator/src/testing/harness/open-brief-blind-packet.ts
import { createHash } from 'node:crypto';

import { z } from 'zod';

import { createCounterbalanceRotation } from './blind-judge';

export const OPEN_BRIEF_BLIND_POLICY_VERSION = 'open-brief-cohort1-blind-v1' as const;
export const OPEN_BRIEF_LANES = ['control', 'workflow', 'single_strong_agent'] as const;
export const OPEN_BRIEF_BLIND_SLOTS = ['A', 'B', 'C'] as const;

export type OpenBriefLane = (typeof OPEN_BRIEF_LANES)[number];
export type OpenBriefBlindSlot = (typeof OPEN_BRIEF_BLIND_SLOTS)[number];

export const OPEN_BRIEF_BLIND_MAPPING_ALGORITHM =
	'counterbalanced three-lane rotation: sort cell ids; derive a corpus rotation from the first byte of sha256(policy_version + newline + corpus_version) mod 3; for run r of cell i rotate the frozen lane order by (corpus_rotation + i + r - 1) mod 3. Across exactly three runs per cell, every lane occupies A, B, and C once; adjacent cells start on different rotations.';

export const OPEN_BRIEF_BLIND_SCORING_RULE =
	'score each output independently: would_you_execute 1-4; knew_whether_executable yes/no; what_is_missing free text. For each pairwise lane contrast, higher execute score wins; equal execute scores are broken only when exactly one output knew whether it was executable; otherwise tie.';

export const OPEN_BRIEF_BLIND_MECHANIC_SHA256 = createHash('sha256')
	.update(
		JSON.stringify({
			policy_version: OPEN_BRIEF_BLIND_POLICY_VERSION,
			lanes: OPEN_BRIEF_LANES,
			slots: OPEN_BRIEF_BLIND_SLOTS,
			mapping_algorithm: OPEN_BRIEF_BLIND_MAPPING_ALGORITHM,
			scoring_rule: OPEN_BRIEF_BLIND_SCORING_RULE
		})
	)
	.digest('hex');

export interface OpenBriefBlindMapping {
	itemId: string;
	cellId: string;
	runIndex: number;
	digest: string;
	laneBySlot: Record<OpenBriefBlindSlot, OpenBriefLane>;
}

export interface OpenBriefLaneOutput {
	cellId: string;
	runIndex: number;
	lane: OpenBriefLane;
	scored?: boolean;
	infrastructureInvalidReason?: string | null;
	l0Passed: boolean;
	chatText: string;
	documents: Array<{ title: string; content: string }>;
}

export interface OpenBriefBlindCell {
	cellId: string;
	briefId: string;
	snapshotId: string;
	requestText: string;
	acceptanceCriteria: string[];
}

export interface OpenBriefBlindResponse {
	slot: OpenBriefBlindSlot;
	chat_text: string;
	documents: Array<{ title: string; content: string }>;
}

export interface OpenBriefBlindItem {
	item_id: string;
	cell_id: string;
	run_index: number;
	brief_id: string;
	snapshot_id: string;
	request_text: string;
	acceptance_criteria: string[];
	responses: OpenBriefBlindResponse[];
}

export interface OpenBriefBlindPacket {
	schema_version: 1;
	policy_version: typeof OPEN_BRIEF_BLIND_POLICY_VERSION;
	mechanic_sha256: string;
	corpus_version: string;
	items: OpenBriefBlindItem[];
}

export interface OpenBriefBlindMappingPacket {
	schema_version: 1;
	policy_version: typeof OPEN_BRIEF_BLIND_POLICY_VERSION;
	mechanic_sha256: string;
	corpus_version: string;
	mappings: OpenBriefBlindMapping[];
	exclusions: Array<{ itemId: string; reasons: string[] }>;
}

export const OpenBriefDjOutputScoreSchema = z
	.object({
		would_you_execute: z.number().int().min(1).max(4),
		knew_whether_executable: z.boolean(),
		what_is_missing: z.string().max(4_000)
	})
	.strict();

export type OpenBriefDjOutputScore = z.infer<typeof OpenBriefDjOutputScoreSchema>;

export const OpenBriefDjItemScoreSchema = z
	.object({
		item_id: z.string().min(1),
		scores: z
			.object({
				A: OpenBriefDjOutputScoreSchema,
				B: OpenBriefDjOutputScoreSchema,
				C: OpenBriefDjOutputScoreSchema
			})
			.strict()
	})
	.strict();

export type OpenBriefDjItemScore = z.infer<typeof OpenBriefDjItemScoreSchema>;

function rotate<T>(values: readonly T[], offset: number): T[] {
	return values.map((_, index) => values[(index + offset) % values.length]!);
}

export function createOpenBriefBlindMapping(params: {
	corpusVersion: string;
	cellIds: readonly string[];
	cellId: string;
	runIndex: number;
}): OpenBriefBlindMapping {
	if (!Number.isInteger(params.runIndex) || params.runIndex < 1 || params.runIndex > 3) {
		throw new Error('Open-brief blind runIndex must be an integer from 1 through 3');
	}
	const sorted = Array.from(new Set(params.cellIds)).sort();
	const cellIndex = sorted.indexOf(params.cellId);
	if (cellIndex < 0) throw new Error(`Cell ${params.cellId} is not part of the blind packet`);
	const { digest, rotation } = createCounterbalanceRotation({
		policyVersion: OPEN_BRIEF_BLIND_POLICY_VERSION,
		corpusVersion: params.corpusVersion,
		modulo: OPEN_BRIEF_LANES.length
	});
	const laneOrder = rotate(
		OPEN_BRIEF_LANES,
		(rotation + cellIndex + params.runIndex - 1) % OPEN_BRIEF_LANES.length
	);
	return {
		itemId: `${params.cellId}-r${params.runIndex}`,
		cellId: params.cellId,
		runIndex: params.runIndex,
		digest,
		laneBySlot: {
			A: laneOrder[0]!,
			B: laneOrder[1]!,
			C: laneOrder[2]!
		}
	};
}

function outputKey(output: Pick<OpenBriefLaneOutput, 'cellId' | 'runIndex' | 'lane'>): string {
	return `${output.cellId}-r${output.runIndex}-${output.lane}`;
}

export function buildOpenBriefBlindPackets(params: {
	corpusVersion: string;
	cells: OpenBriefBlindCell[];
	outputs: OpenBriefLaneOutput[];
}): { blind: OpenBriefBlindPacket; mapping: OpenBriefBlindMappingPacket } {
	const outputs = new Map<string, OpenBriefLaneOutput>();
	for (const output of params.outputs) {
		const key = outputKey(output);
		if (outputs.has(key)) throw new Error(`Duplicate open-brief lane output: ${key}`);
		outputs.set(key, output);
	}
	const items: OpenBriefBlindItem[] = [];
	const mappings: OpenBriefBlindMapping[] = [];
	const exclusions: Array<{ itemId: string; reasons: string[] }> = [];
	const cellIds = params.cells.map((cell) => cell.cellId);

	for (const cell of params.cells) {
		for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
			const mapping = createOpenBriefBlindMapping({
				corpusVersion: params.corpusVersion,
				cellIds,
				cellId: cell.cellId,
				runIndex
			});
			const laneOutputs = OPEN_BRIEF_LANES.map((lane) =>
				outputs.get(outputKey({ cellId: cell.cellId, runIndex, lane }))
			);
			const reasons: string[] = [];
			for (const [index, output] of laneOutputs.entries()) {
				const lane = OPEN_BRIEF_LANES[index]!;
				if (!output) reasons.push(`${lane}: missing output`);
				else if (output.scored === false || output.infrastructureInvalidReason) {
					reasons.push(
						`${lane}: infrastructure-invalid (${output.infrastructureInvalidReason ?? 'unspecified'})`
					);
				} else if (!output.l0Passed) reasons.push(`${lane}: L0 process-illegal`);
			}
			if (reasons.length > 0) {
				exclusions.push({ itemId: mapping.itemId, reasons });
				continue;
			}

			mappings.push(mapping);
			items.push({
				item_id: mapping.itemId,
				cell_id: cell.cellId,
				run_index: runIndex,
				brief_id: cell.briefId,
				snapshot_id: cell.snapshotId,
				request_text: cell.requestText,
				acceptance_criteria: [...cell.acceptanceCriteria],
				responses: OPEN_BRIEF_BLIND_SLOTS.map((slot) => {
					const lane = mapping.laneBySlot[slot];
					const output = outputs.get(outputKey({ cellId: cell.cellId, runIndex, lane }))!;
					return {
						slot,
						chat_text: output.chatText.trim() || '[No chat reply was captured.]',
						documents: output.documents.map((document) => ({ ...document }))
					};
				})
			});
		}
	}

	return {
		blind: {
			schema_version: 1,
			policy_version: OPEN_BRIEF_BLIND_POLICY_VERSION,
			mechanic_sha256: OPEN_BRIEF_BLIND_MECHANIC_SHA256,
			corpus_version: params.corpusVersion,
			items
		},
		mapping: {
			schema_version: 1,
			policy_version: OPEN_BRIEF_BLIND_POLICY_VERSION,
			mechanic_sha256: OPEN_BRIEF_BLIND_MECHANIC_SHA256,
			corpus_version: params.corpusVersion,
			mappings,
			exclusions
		}
	};
}

function renderResponse(response: OpenBriefBlindResponse): string {
	const documents = response.documents
		.map(
			(document, index) =>
				`#### Document ${index + 1}: ${document.title}\n\n${document.content}`
		)
		.join('\n\n');
	return `### Response ${response.slot}\n\n#### Chat reply\n\n${response.chat_text}\n\n${documents}\n\n#### DJ score for ${response.slot}\n\nWould you execute this? \`1\` / \`2\` / \`3\` / \`4\`\n\nDid it know whether it could be executed? \`yes\` / \`no\`\n\nWhat's missing (optional):`;
}

export function buildOpenBriefDjScoringMarkdown(packet: OpenBriefBlindPacket): string {
	const items = packet.items.map(
		(item, index) =>
			`## Item ${index + 1}: ${item.item_id}\n\n### Request\n\n${item.request_text}\n\n### Acceptance criteria\n\n${item.acceptance_criteria.map((criterion) => `- ${criterion}`).join('\n')}\n\n${item.responses.map(renderResponse).join('\n\n---\n\n')}`
	);
	return `# Open-brief cohort 1 — DJ blind scoring packet\n\nMechanic: \`${packet.policy_version}\`  \nSHA-256: \`${packet.mechanic_sha256}\`\n\nScore every response independently. Keep the lane mapping sealed until every item is complete.\n\n- **Would you execute this?** 1 = no; 2 = after heavy edits; 3 = after light edits; 4 = as-is.\n- **Did it know whether it could be executed?** Answer yes only when the artifact assessed context sufficiency, difficulty, and what it still needed.\n\n${items.join('\n\n---\n\n')}\n`;
}

export function laneScoresForItem(params: {
	mapping: OpenBriefBlindMapping;
	score: OpenBriefDjItemScore;
}): Record<OpenBriefLane, OpenBriefDjOutputScore> {
	const score = OpenBriefDjItemScoreSchema.parse(params.score);
	if (score.item_id !== params.mapping.itemId) {
		throw new Error(`Score ${score.item_id} does not match mapping ${params.mapping.itemId}`);
	}
	return Object.fromEntries(
		OPEN_BRIEF_BLIND_SLOTS.map((slot) => [params.mapping.laneBySlot[slot], score.scores[slot]])
	) as Record<OpenBriefLane, OpenBriefDjOutputScore>;
}

export function compareOpenBriefDjScores(
	left: OpenBriefDjOutputScore,
	right: OpenBriefDjOutputScore
): 'left' | 'right' | 'tie' {
	if (left.would_you_execute !== right.would_you_execute) {
		return left.would_you_execute > right.would_you_execute ? 'left' : 'right';
	}
	if (left.knew_whether_executable !== right.knew_whether_executable) {
		return left.knew_whether_executable ? 'left' : 'right';
	}
	return 'tie';
}
