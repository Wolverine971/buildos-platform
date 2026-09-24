// docs/research/jev-tool-selection-2026-09-18/margins.ts
// Weakest probability any required tool (best member of an any-of group) received.
//   cd apps/worker && ./node_modules/.bin/tsx ../../docs/research/jev-tool-selection-2026-09-18/margins.ts results-toolbox.json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CASES } from './cases';
import { HELDOUT_CASES } from './heldout-cases';
import { PLANNING_CASES } from './planning-cases';

const byId = new Map([...CASES, ...HELDOUT_CASES, ...PLANNING_CASES].map((c) => [c.id, c]));
const results = JSON.parse(
	readFileSync(resolve(__dirname, process.argv[2] ?? 'results-toolbox.json'), 'utf8')
);
const rows: [number, string][] = [];
for (const run of results.runs) {
	const testCase = byId.get(run.case);
	if (!testCase) continue;
	for (const req of testCase.must) {
		const names = typeof req === 'string' ? [req] : [...req];
		const best = Math.max(...names.map((n) => run.probabilities[n] ?? 0));
		rows.push([best, `${run.case} r${run.repeat} ${names.join('|')}`]);
	}
}
rows.sort((a, b) => a[0] - b[0]);
for (const [p, label] of rows.slice(0, 6)) console.log(`${p.toFixed(2)}  ${label}`);
