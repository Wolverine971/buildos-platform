#!/usr/bin/env node
// scripts/testing/check-test-types.mjs

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(scriptDirectory, 'test-type-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

const workspaceFlag = process.argv.indexOf('--workspace');
const workspace = workspaceFlag >= 0 ? process.argv[workspaceFlag + 1] : null;
const config = workspace ? baseline.workspaces?.[workspace] : null;

if (!workspace || !config) {
	console.error(
		`Usage: node scripts/testing/check-test-types.mjs --workspace <${Object.keys(
			baseline.workspaces ?? {}
		).join('|')}>`
	);
	process.exit(2);
}

// Some workspaces intentionally install both stable TypeScript and the native
// preview. Their packages expose the same `tsc` bin name, so the generated
// `.bin/tsc` shim depends on install order. Resolve the configured compiler
// package directly to keep the debt baseline reproducible after every install.
const compilerPackage = config.compiler ?? 'typescript';
const executable = resolve(
	process.cwd(),
	'node_modules',
	...compilerPackage.split('/'),
	'bin',
	'tsc'
);
const result = spawnSync(
	process.execPath,
	[executable, '-p', config.tsconfig, '--noEmit', '--pretty', 'false'],
	{
		cwd: process.cwd(),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	}
);

if (result.error) {
	console.error(`Unable to run the ${workspace} test typecheck:`, result.error.message);
	process.exit(2);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const errorCount = output.match(/error TS\d+:/g)?.length ?? 0;

if (result.status !== 0 && errorCount === 0) {
	console.error(output.trim());
	console.error(
		`${workspace} test typecheck exited ${result.status} without parseable diagnostics.`
	);
	process.exit(result.status ?? 2);
}

if (errorCount > config.maxErrors) {
	console.error(output.trim());
	console.error(
		`${workspace} test type debt increased: ${errorCount} errors (baseline ${config.maxErrors}).`
	);
	process.exit(1);
}

const improvement = config.maxErrors - errorCount;
console.log(
	`${workspace} test type debt: ${errorCount}/${config.maxErrors} errors` +
		(improvement > 0
			? ` (${improvement} below baseline; lower the baseline)`
			: ' (at baseline)')
);
