// packages/agent-orchestrator/src/testing/harness/results-manifest.test.ts
//
// Every result artifact is evidence for a pre-registered experiment, and its SHA-256 is recorded in
// results/README.md and the Phase A docs. Nothing previously detected when those bytes changed:
// `pnpm format` reformatted control-a2-v1.json and workflow-eval-invalid-zdr-v1.json from 2-space
// to tab indentation, silently voiding two canonical hashes while the audit and results/README.md
// continued to claim every hash reproduced. Both files have since been restored byte-exactly.
//
// This test is the detector. The results directory is also in .prettierignore so the formatter
// cannot reintroduce the problem. See research/09_INTERNAL_GROUND_TRUTH_MAP.md D1.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const resultsDir = fileURLToPath(new URL('./results/', import.meta.url));

/**
 * SHA-256 of each result artifact as recorded when it was produced. A mismatch means the bytes
 * changed after the fact: restore the file rather than updating this table, unless the artifact is
 * genuinely being replaced by a new run (in which case add the new hash deliberately).
 */
const RECORDED_SHA256: Record<string, string> = {
	'control-a2-v1.json': '735a445023a62c37ceec538349f5c77499da3e5dc04cb9a7d7207f5f36ee2338',
	'control-baseline-v1.json': 'fc300f90b7376980424c9b4a8a8e4dc83f9d747a773b0585a019ffff41071768',
	'route-eval-fast-review-v1.json':
		'ab886492a6a788eede2bc64c3c8692bc9fd362ef492ecab69930d217eb78d378',
	'route-eval-holdout-v1.json':
		'32c0f21fd770d4c293ddcf2679c399af8243e1210fc4b7784e7905ec24d55b87',
	'route-eval-mitigation-v2.json':
		'07b78b69c5eb285bc5ce344ca8cdc93afa0376193632ab61a8fadfee87abbdd3',
	'route-eval-v1.json': '3f75d91718406443921c6717b4a09d3d61ae20133c81ad8aead94680a3df49ed',
	'route-eval-v2.json': '381ffa915ff1de6e606f7294d4c0dc4e417a4fb9f14f036a32c026f366ce2953',
	'route-eval-v3.json': '22f58e6f234a15a382177a0f933bdd9cb2b313176ef663c0e3f9ddc9067fa59e',
	'route-eval-v4.json': '4fcf67e2d15309d14d0faf53035896543b26062a8b322083e90429d6863a9f31',
	'route-eval-v5.json': 'f36419724637bddb5a11ae3a64fc4ddbbb200b36ef716b4bafe06cb95b5a4e20',
	'route-model-pilot-deepseek-v4-flash-v1.json':
		'27a5dd05886ebd867d5e71c9f5bb962683dfcb534660aca95b6422bb36e01d9d',
	'route-model-pilot-gemini-flash-lite-v1.json':
		'cc7ac54237b66e3a23fd8b0ca62bbe3f390596d01c0354ba877212596d9b86d9',
	'route-strategy-pilot-fast-review-v1.json':
		'f6945bd7b0d594ab55f7ed484c34b692247c16188bc273dea382e89c0d2f668d',
	'workflow-eval-invalid-zdr-v1.json':
		'25576e641bf8db1e9527b65e02ec15041038155739128eee921d88bbc15d60ca'
};

function sha256(fileName: string): string {
	return createHash('sha256')
		.update(readFileSync(`${resultsDir}${fileName}`))
		.digest('hex');
}

describe('Phase A result artifact manifest', () => {
	const onDisk = readdirSync(resultsDir)
		.filter((name) => name.endsWith('.json'))
		.sort();

	it('has a recorded hash for every result artifact on disk', () => {
		expect(onDisk).toEqual(Object.keys(RECORDED_SHA256).sort());
	});

	it.each(Object.keys(RECORDED_SHA256).sort())('%s reproduces its recorded SHA-256', (name) => {
		expect(sha256(name)).toBe(RECORDED_SHA256[name]);
	});
});
