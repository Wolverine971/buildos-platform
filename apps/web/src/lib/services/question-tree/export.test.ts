import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
	buildQuestionTreeExportFiles,
	buildQuestionTreeExportName,
	buildQuestionTreeExportZip
} from './export';
import type { QuestionTreeRunDetail } from './types';

function fixture(): QuestionTreeRunDetail {
	return {
		run: {
			id: '12345678-1234-1234-1234-123456789abc',
			created_by: 'admin-1',
			root_node_id: 'node-root',
			root_question: 'Will this research approach work?',
			status: 'completed',
			phase: 'done',
			model_policy: 'paid_floor_strict',
			explorer_model_requested: 'test/explorer',
			synthesis_model_requested: 'test/synthesizer',
			prompt_version: 'question-tree-v1',
			node_limit: 100,
			nodes_created: 1,
			nodes_completed: 1,
			nodes_failed: 0,
			deepest_depth: 1,
			frontier_count: 0,
			advance_sequence: 2,
			provider_requests: 3,
			max_provider_requests: 125,
			config: { concurrency: 4 },
			usage: {
				prompt_tokens: 100,
				completion_tokens: 50,
				total_tokens: 150,
				cost_usd: 0.0012,
				latency_ms: 3000
			},
			synthesis: {
				finalAnswer: 'The approach works when the assumptions are monitored.',
				finalThesis: 'The approach is viable with safeguards.',
				probablyRight: ['The core mechanism is sound.'],
				probablyWrong: ['Adoption will be automatic.'],
				stillUnsure: ['The long-term maintenance cost.'],
				keyEvidence: [{ finding: 'A pilot succeeded.', nodeNumbers: [1] }],
				importantDisagreements: [{ issue: 'Experts disagree on scale.', nodeNumbers: [1] }],
				recommendedNextResearch: ['Run a larger pilot.'],
				limitations: ['No external web research was used.']
			},
			pause_reason: null,
			started_at: '2026-08-02T10:00:00.000Z',
			completed_at: '2026-08-02T10:05:00.000Z',
			created_at: '2026-08-02T09:59:00.000Z',
			updated_at: '2026-08-02T10:05:00.000Z'
		},
		nodes: [
			{
				id: 'node-root',
				run_id: '12345678-1234-1234-1234-123456789abc',
				parent_node_id: null,
				node_kind: 'root',
				node_number: 0,
				depth: 0,
				sibling_index: null,
				status: 'completed',
				question: 'Will this research approach work?',
				answer: 'The root contains the final answer.',
				thesis: 'The approach is viable.',
				epistemic_assessment: [
					{
						statement: 'The mechanism is sound.',
						status: 'probably_right',
						basis: 'The pilot evidence.'
					}
				],
				confidence: 0.82,
				stop_reason: 'Synthesis complete',
				model_requested: 'test/explorer',
				model_used: 'test/explorer',
				provider_request_id: 'provider-request-1',
				attempt_count: 1,
				prompt_tokens: 100,
				completion_tokens: 50,
				reasoning_tokens: 10,
				cost_usd: 0.001,
				latency_ms: 1000,
				error_code: null,
				error_message: null,
				started_at: '2026-08-02T10:00:00.000Z',
				completed_at: '2026-08-02T10:01:00.000Z',
				created_at: '2026-08-02T09:59:00.000Z',
				updated_at: '2026-08-02T10:01:00.000Z'
			}
		],
		proposals: [
			{
				id: 'proposal-1',
				run_id: '12345678-1234-1234-1234-123456789abc',
				source_node_id: 'node-root',
				rank: 0,
				question: 'What would falsify the core mechanism?',
				purpose: 'falsify',
				target_claim: 'The core mechanism is sound.',
				why_it_matters: 'It tests the central assumption.',
				expected_information_gain: 'high',
				model_priority: 0.9,
				scheduler_score: 0.8,
				status: 'not_selected',
				child_node_id: null,
				duplicate_of_node_id: null,
				validation_error: null,
				created_at: '2026-08-02T10:00:30.000Z',
				updated_at: '2026-08-02T10:00:30.000Z'
			}
		],
		events: [
			{
				id: 'event-2',
				run_id: '12345678-1234-1234-1234-123456789abc',
				node_id: null,
				seq: 2,
				event_type: 'run.completed',
				payload: { status: 'completed' },
				created_at: '2026-08-02T10:05:00.000Z'
			},
			{
				id: 'event-1',
				run_id: '12345678-1234-1234-1234-123456789abc',
				node_id: 'node-root',
				seq: 1,
				event_type: 'node.completed',
				payload: { confidence: 0.82 },
				created_at: '2026-08-02T10:01:00.000Z'
			}
		]
	};
}

describe('Question Tree export', () => {
	it('builds readable synthesis, tree, proposal, event, and raw-data files', () => {
		const detail = fixture();
		const files = buildQuestionTreeExportFiles(detail, {
			exportedAt: new Date('2026-08-02T12:00:00.000Z')
		});

		expect(Object.keys(files)).toEqual(
			expect.arrayContaining([
				'README.md',
				'synthesis.md',
				'research-tree.md',
				'proposals.md',
				'events.md',
				'raw/complete-export.json',
				'raw/run.json',
				'raw/nodes.json',
				'raw/proposals.json',
				'raw/events.json',
				'raw/synthesis.json'
			])
		);
		expect(files['synthesis.md']).toContain('### Probably right');
		expect(files['synthesis.md']).toContain('Adoption will be automatic.');
		expect(files['synthesis.md']).toContain('The long-term maintenance cost.');
		expect(files['synthesis.md']).toContain('A pilot succeeded.');
		expect(files['research-tree.md']).toContain('The root contains the final answer.');
		expect(files['research-tree.md']).toContain('The pilot evidence.');
		expect(files['proposals.md']).toContain('Not Selected');
		expect(files['events.md']!.indexOf('## 1. node.completed')).toBeLessThan(
			files['events.md']!.indexOf('## 2. run.completed')
		);

		const raw = JSON.parse(files['raw/complete-export.json']!);
		expect(raw.schema_version).toBe('question-tree-export-v1');
		expect(raw.nodes).toHaveLength(1);
		expect(raw.proposals).toHaveLength(1);
		expect(raw.events).toHaveLength(2);
		expect(raw.run.synthesis.probablyRight).toEqual(['The core mechanism is sound.']);
	});

	it('creates a valid zip under a descriptive folder name', () => {
		const detail = fixture();
		const folder = buildQuestionTreeExportName(detail);
		const archive = buildQuestionTreeExportZip(detail, {
			exportedAt: new Date('2026-08-02T12:00:00.000Z')
		});
		const entries = unzipSync(archive);

		expect(folder).toBe('question-tree-will-this-research-approach-work-2026-08-02-12345678');
		expect(Object.keys(entries)).toContain(`${folder}/README.md`);
		expect(strFromU8(entries[`${folder}/synthesis.md`]!)).toContain(
			'The approach is viable with safeguards.'
		);
		expect(JSON.parse(strFromU8(entries[`${folder}/raw/events.json`]!))).toHaveLength(2);
	});

	it('explains when a run has no final synthesis yet', () => {
		const detail = fixture();
		detail.run.synthesis = null;

		expect(buildQuestionTreeExportFiles(detail)['synthesis.md']).toContain(
			'A final synthesis has not been recorded for this run.'
		);
	});
});
