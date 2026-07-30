// packages/agent-orchestrator/src/testing/harness/open-brief-blind-packet.test.ts
import { describe, expect, it } from 'vitest';

import {
	buildOpenBriefBlindPackets,
	buildOpenBriefDjScoringMarkdown,
	compareOpenBriefDjScores,
	createOpenBriefBlindMapping,
	laneScoresForItem,
	OPEN_BRIEF_BLIND_SLOTS,
	OPEN_BRIEF_LANES,
	type OpenBriefBlindCell,
	type OpenBriefLaneOutput
} from './open-brief-blind-packet';

const cells: OpenBriefBlindCell[] = ['marketing-beta', 'plan-alpha'].map((cellId) => ({
	cellId,
	briefId: cellId.split('-')[0]!,
	snapshotId: cellId.split('-')[1]!,
	requestText: `Request ${cellId}`,
	acceptanceCriteria: [
		'Create a durable document.',
		'Give BLUF takeaways.',
		'Assess feasibility.'
	]
}));

function outputs(): OpenBriefLaneOutput[] {
	return cells.flatMap((cell) =>
		[1, 2, 3].flatMap((runIndex) =>
			OPEN_BRIEF_LANES.map((lane) => ({
				cellId: cell.cellId,
				runIndex,
				lane,
				l0Passed: true,
				chatText: `Anonymous response ${cell.cellId} ${runIndex}`,
				documents: [
					{ title: 'Plan document', content: `Artifact ${cell.cellId} ${runIndex}` }
				]
			}))
		)
	);
}

describe('open-brief three-lane blind packet', () => {
	it('puts every lane in A, B, and C exactly once per cell', () => {
		for (const cell of cells) {
			const mappings = [1, 2, 3].map((runIndex) =>
				createOpenBriefBlindMapping({
					corpusVersion: 'open-brief-v1',
					cellIds: cells.map((entry) => entry.cellId),
					cellId: cell.cellId,
					runIndex
				})
			);
			for (const lane of OPEN_BRIEF_LANES) {
				const occupied = mappings.flatMap((mapping) =>
					OPEN_BRIEF_BLIND_SLOTS.filter((slot) => mapping.laneBySlot[slot] === lane)
				);
				expect(new Set(occupied)).toEqual(new Set(OPEN_BRIEF_BLIND_SLOTS));
			}
		}
	});

	it('keeps lane identities and machine failures out of the DJ packet', () => {
		const result = buildOpenBriefBlindPackets({
			corpusVersion: 'open-brief-v1',
			cells,
			outputs: outputs()
		});
		expect(result.blind.items).toHaveLength(6);
		expect(result.mapping.mappings).toHaveLength(6);
		expect(JSON.stringify(result.blind)).not.toContain('single_strong_agent');
		expect(JSON.stringify(result.blind)).not.toContain('l0Passed');
		expect(JSON.stringify(result.blind)).not.toContain('infrastructureInvalidReason');
	});

	it('excludes an entire triplet when any lane is infrastructure-invalid or process-illegal', () => {
		const laneOutputs = outputs();
		laneOutputs.find(
			(output) =>
				output.cellId === 'marketing-beta' &&
				output.runIndex === 1 &&
				output.lane === 'control'
		)!.l0Passed = false;
		laneOutputs.find(
			(output) =>
				output.cellId === 'plan-alpha' &&
				output.runIndex === 2 &&
				output.lane === 'workflow'
		)!.infrastructureInvalidReason = 'stream failed';
		const result = buildOpenBriefBlindPackets({
			corpusVersion: 'open-brief-v1',
			cells,
			outputs: laneOutputs
		});
		expect(result.blind.items).toHaveLength(4);
		expect(result.mapping.exclusions).toHaveLength(2);
		expect(result.mapping.exclusions[0]!.reasons[0]).toContain('L0 process-illegal');
	});

	it('renders both DJ questions for all three anonymous outputs', () => {
		const { blind } = buildOpenBriefBlindPackets({
			corpusVersion: 'open-brief-v1',
			cells: cells.slice(0, 1),
			outputs: outputs().filter((output) => output.cellId === cells[0]!.cellId)
		});
		const markdown = buildOpenBriefDjScoringMarkdown(blind);
		expect(markdown.match(/^Would you execute this\?/gm)).toHaveLength(9);
		expect(markdown.match(/^Did it know whether it could be executed\?/gm)).toHaveLength(9);
		expect(markdown).not.toContain('single_strong_agent');
	});

	it('reveals scores only through the sealed mapping and applies the pre-registered tie-break', () => {
		const mapping = createOpenBriefBlindMapping({
			corpusVersion: 'open-brief-v1',
			cellIds: ['marketing-beta'],
			cellId: 'marketing-beta',
			runIndex: 1
		});
		const laneScores = laneScoresForItem({
			mapping,
			score: {
				item_id: mapping.itemId,
				scores: {
					A: { would_you_execute: 3, knew_whether_executable: true, what_is_missing: '' },
					B: {
						would_you_execute: 3,
						knew_whether_executable: false,
						what_is_missing: ''
					},
					C: { would_you_execute: 4, knew_whether_executable: false, what_is_missing: '' }
				}
			}
		});
		expect(Object.keys(laneScores).sort()).toEqual([...OPEN_BRIEF_LANES].sort());
		expect(
			compareOpenBriefDjScores(
				{ would_you_execute: 3, knew_whether_executable: true, what_is_missing: '' },
				{ would_you_execute: 3, knew_whether_executable: false, what_is_missing: '' }
			)
		).toBe('left');
		expect(
			compareOpenBriefDjScores(
				{ would_you_execute: 3, knew_whether_executable: true, what_is_missing: '' },
				{ would_you_execute: 4, knew_whether_executable: false, what_is_missing: '' }
			)
		).toBe('right');
	});
});
