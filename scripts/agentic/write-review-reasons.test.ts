// scripts/agentic/write-review-reasons.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeReviews, renderReviewReport } from './write-review-reasons';

const pass = (id: string, minute: number, metadata = {}) => ({
	id,
	user_id: 'real-user',
	turn_run_id: 'turn-1',
	status: 'success',
	request_started_at: `2026-10-18T12:0${minute}:00Z`,
	metadata: { logicalProviderRound: minute + 1, passRole: 'mutation_review', ...metadata }
});
const users = [
	{ id: 'real-user', email: 'person@example.com' },
	{ id: 'harness', email: 'agentic-e2e-fixture@example.com' }
];

test('retains unknown historical routes instead of inferring them from successful writes', () => {
	const rows = analyzeReviews({
		usage: [pass('p1', 0)],
		users,
		observations: [],
		events: [],
		tools: [
			{
				turn_run_id: 'turn-1',
				tool_name: 'approve_mutation_batch_review',
				success: true,
				created_at: '2026-10-18T12:00:03Z'
			},
			{
				turn_run_id: 'turn-1',
				tool_name: 'create_onto_task',
				success: true,
				created_at: '2026-10-18T12:00:04Z'
			}
		]
	});
	assert.equal(rows[0].reason, 'unknown');
	assert.equal(rows[0].outcome, 'approved');
	assert.equal(rows[0].evidence, 'original_proposal_not_persisted');
});

test('joins each verdict to its own pass, keeping a bounce separate from its approval', () => {
	const rows = analyzeReviews({
		usage: [pass('p1', 0), pass('p2', 1)],
		users,
		events: [],
		observations: [],
		tools: [
			{
				turn_run_id: 'turn-1',
				tool_name: 'request_proposal_revision',
				success: true,
				created_at: '2026-10-18T12:00:04Z'
			},
			{
				turn_run_id: 'turn-1',
				tool_name: 'approve_mutation_batch_review',
				success: true,
				created_at: '2026-10-18T12:01:04Z'
			}
		]
	});
	assert.deepEqual(
		rows.map((r) => r.outcome),
		['revise', 'approved']
	);
});

test('prefers validated decision telemetry and does not count invalid approvals as approved', () => {
	const rows = analyzeReviews({
		usage: [pass('p1', 0, { writeRouteReason: 'mixed_tool_batch' })],
		users,
		events: [],
		tools: [],
		observations: [
			{
				turn_run_id: 'turn-1',
				observed_at: '2026-10-18T12:00:03Z',
				payload: {
					logical_provider_round: 1,
					review_outcome: 'invalid',
					review_decision_tool: 'approve_mutation_batch_review'
				}
			}
		]
	});
	assert.equal(rows[0].reason, 'mixed_tool_batch');
	assert.equal(rows[0].outcome, 'invalid');
});

test('deleted harness links and ambiguous decisions stay unknown; cohorts remain separate', () => {
	const rows = analyzeReviews({
		usage: [{ ...pass('p1', 0), user_id: 'harness', turn_run_id: null }, pass('p2', 1)],
		users,
		events: [],
		tools: [],
		observations: [
			{
				turn_run_id: 'turn-1',
				observed_at: '2026-10-18T12:01:03Z',
				payload: { logical_provider_round: 2, review_outcome: 'approved' }
			},
			{
				turn_run_id: 'turn-1',
				observed_at: '2026-10-18T12:01:04Z',
				payload: { logical_provider_round: 2, review_outcome: 'revision_requested' }
			}
		]
	});
	assert.deepEqual(
		rows.map((r) => r.cohort),
		['harness', 'real']
	);
	assert.deepEqual(
		rows.map((r) => r.outcome),
		['unknown', 'unknown']
	);
	assert.equal(rows[0].evidence, 'deleted_turn_link');
});

test('report never prints arbitrary metadata or treats retries as independent eligibility samples', () => {
	const usage = Array.from({ length: 10 }, (_, i) =>
		pass(`p${i}`, 0, {
			writeRouteReason: 'mutation_count_exceeded',
			writeRouteBatchSha256: 'same-batch',
			secret: 'private text'
		})
	);
	const report = renderReviewReport(
		analyzeReviews({ usage, users, tools: [], observations: [], events: [] })
	);
	assert.ok(report.includes('| real | mutation_count_exceeded | 10 | 1 |'));
	assert.ok(!report.includes('private text'));
	assert.ok(!report.includes('person@example.com'));
});

test('does not assign a delayed first-review decision to its format-repair pass', () => {
	const rows = analyzeReviews({
		usage: [
			{
				...pass('first', 0, { providerAttempt: 1 }),
				request_completed_at: '2026-10-18T12:00:03Z'
			},
			{
				...pass('repair', 0, { providerAttempt: 3 }),
				request_started_at: '2026-10-18T12:00:05Z',
				request_completed_at: '2026-10-18T12:00:08Z'
			}
		],
		users,
		events: [],
		tools: [
			{
				turn_run_id: 'turn-1',
				tool_name: 'approve_mutation_batch_review',
				success: true,
				created_at: '2026-10-18T12:00:09Z'
			}
		],
		observations: [
			{
				turn_run_id: 'turn-1',
				observed_at: '2026-10-18T12:00:06Z',
				payload: { logical_provider_round: 1, review_attempt: 1, review_outcome: 'invalid' }
			}
		]
	});
	// Observation persistence is detached; arrival time is not decision identity.
	// Without a shared attempt identifier, neither physical pass has a proven verdict.
	assert.deepEqual(
		rows.map((row) => row.outcome),
		['unknown', 'unknown']
	);
});
