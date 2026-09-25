// scripts/agentic/prod-battery-policy.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	CLEAN_TREE_SHA256,
	DEFAULT_PROD_WEB_URL,
	DEFAULT_PROD_WORKER_URL,
	assertDeploymentUnchanged,
	assertProdBatteryTarget,
	deployedProvenance,
	evaluateCaseSubset,
	failedTurnStreamRunIds,
	parseCaseSelection,
	parseVercelProductionDeployment
} from './prod-battery-policy';

const SHA = '76302509db7ce48463eebb2aa4f3038f73b9f7ce';
const OTHER = 'e4c82b3560000000000000000000000000000000';
const PROD = 'https://iwifjtlebphefldmwbkh.supabase.co';
const target = {
	confirmed: true,
	testUserEmail: 'agentic-e2e-harness@example.com',
	supabaseUrl: PROD,
	webUrl: DEFAULT_PROD_WEB_URL,
	workerUrl: DEFAULT_PROD_WORKER_URL
};

test('accepts only a confirmed run as the harness account against the app database', () => {
	assert.doesNotThrow(() => assertProdBatteryTarget(target));
	assert.throws(() => assertProdBatteryTarget({ ...target, confirmed: false }), /--confirm-prod/);
	assert.throws(
		() => assertProdBatteryTarget({ ...target, testUserEmail: 'djwayne35@gmail.com' }),
		/dedicated harness account/
	);
	assert.throws(
		() => assertProdBatteryTarget({ ...target, testUserEmail: 'agentic-e2e-x@gmail.com' }),
		/dedicated harness account/
	);
	assert.throws(
		() => assertProdBatteryTarget({ ...target, supabaseUrl: undefined }),
		/Supabase URL must be an https origin/
	);
	assert.throws(
		() => assertProdBatteryTarget({ ...target, webUrl: 'http://127.0.0.1:5173' }),
		/https origin/
	);
});

test('reads the deployed web commit from a ready production git deployment only', () => {
	const ready = {
		id: 'dpl_1',
		url: 'build-x.vercel.app',
		readyState: 'READY',
		target: 'production',
		meta: { githubCommitSha: SHA }
	};
	assert.deepEqual(parseVercelProductionDeployment(ready), {
		sha: SHA,
		deploymentId: 'dpl_1',
		url: 'build-x.vercel.app'
	});
	assert.throws(() => parseVercelProductionDeployment({ ...ready, readyState: 'BUILDING' }));
	assert.throws(() => parseVercelProductionDeployment({ ...ready, target: 'preview' }));
	assert.throws(() => parseVercelProductionDeployment({ ...ready, meta: {} }));
	assert.throws(
		() => parseVercelProductionDeployment({ error: { message: 'forbidden' } }),
		/forbidden/
	);
});

test('requires one clean commit on web and worker', () => {
	const web = { sha: SHA, deploymentId: 'dpl_1', url: null };
	const health = { provenance: { version: 1, gitSha: SHA, dirtyTreeSha256: CLEAN_TREE_SHA256 } };
	const { expected } = deployedProvenance(health, web);
	assert.deepEqual(expected, { version: 1, gitSha: SHA, dirtyTreeSha256: CLEAN_TREE_SHA256 });
	assert.throws(
		() =>
			deployedProvenance(
				{ provenance: { ...health.provenance, dirtyTreeSha256: 'a'.repeat(64) } },
				web
			),
		/clean commit/
	);
	assert.throws(() => deployedProvenance(health, { ...web, sha: OTHER }), /different commits/);
	assert.throws(() => deployedProvenance({}, web), /no source provenance/);
});

test('fails a run whose deployment changed underneath it', () => {
	const before = { version: 1 as const, gitSha: SHA, dirtyTreeSha256: CLEAN_TREE_SHA256 };
	assert.doesNotThrow(() => assertDeploymentUnchanged(before, { ...before }, 'Worker'));
	assert.throws(
		() => assertDeploymentUnchanged(before, { ...before, gitSha: OTHER }, 'Worker'),
		/two deployments/
	);
});

test('selects Cedar House cases by number and refuses unknown ones', () => {
	assert.equal(parseCaseSelection(['--confirm-prod']), null);
	assert.deepEqual(parseCaseSelection(['--cases=14,2,1,2']), [1, 2, 14]);
	assert.throws(() => parseCaseSelection(['--cases=12']), /Cedar House cases/);
	assert.throws(() => parseCaseSelection(['--cases=']), /Cedar House cases/);
});

test('scores a subset with the full rules but only for the selected cases', () => {
	const turn = (scenarioId: string, repetition: number, durationMs = 10_000) => ({
		scenarioId,
		repetition,
		turnIndex: 1,
		resultClass: 'end_to_end_pass',
		durationMs,
		toolCallCount: 3
	});
	const scorecard = (score: number, slowCase2 = false) => ({
		kind: 'agentic_chat_battery_scorecard',
		battery: 'cedar-house',
		provenance: { verified: true },
		cases: [
			{ case: 1, scenarioId: 'a', score: 4, expectedTurnCount: 1, outcome: 'pass' },
			{ case: 2, scenarioId: 'b', score, expectedTurnCount: 1, outcome: 'x' }
		],
		turns: [1, 2, 3].flatMap((r) => [turn('a', r), turn('b', r, slowCase2 ? 61_000 : 10_000)])
	});
	assert.deepEqual(evaluateCaseSubset(scorecard(4), [1, 2], 3), []);
	assert.ok(evaluateCaseSubset(scorecard(3), [1, 2], 3).some((f) => f.startsWith('Case 2: 3/4')));
	assert.ok(
		evaluateCaseSubset(scorecard(4, true), [1, 2], 3).some((f) =>
			/latency must be under 60s/.test(f)
		)
	);
	assert.ok(evaluateCaseSubset(scorecard(4), [1, 2, 14], 3)[0]!.startsWith('Selected cases'));
});

test('keeps evidence for every turn that did not pass, once each', () => {
	assert.deepEqual(
		failedTurnStreamRunIds({
			turns: [
				{ streamRunId: 'a', resultClass: 'end_to_end_pass' },
				{ streamRunId: 'b', resultClass: 'behavior_failure' },
				{ streamRunId: 'b', resultClass: 'behavior_failure' },
				{ streamRunId: 'c' },
				{ resultClass: 'behavior_failure' }
			]
		}),
		['b', 'c']
	);
	assert.deepEqual(failedTurnStreamRunIds(null), []);
	assert.deepEqual(failedTurnStreamRunIds({ turns: 'x' }), []);
});
