// scripts/database/sql-contracts.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function inventorySqlContracts(repoRoot) {
	const testsDirectory = join(repoRoot, 'supabase/tests');
	const baseline = JSON.parse(
		readFileSync(join(testsDirectory, 'sql-contract-baseline.json'), 'utf8')
	);
	const files = readdirSync(testsDirectory)
		.filter((filename) => filename.endsWith('.sql'))
		.sort();
	const sourceText = collectTestSource(repoRoot);
	const legacySet = new Set(baseline.legacySchemaDependent ?? []);
	const inventory = [];

	for (const filename of files) {
		const content = readFileSync(join(testsDirectory, filename), 'utf8');
		let mode;
		if (filename.endsWith('.production_verify.sql')) mode = 'production-verification';
		else if (filename.endsWith('.preflight.sql')) mode = 'manual-preflight';
		else if (!filename.endsWith('.test.sql')) mode = 'support-fixture';
		else if (
			/^\\ir\s+fixtures\//m.test(content) &&
			/PSQL-ONLY\s*\/\s*DISPOSABLE DATABASE ONLY/i.test(content)
		) {
			mode = 'self-contained-disposable';
		} else if (sourceText.includes(filename)) mode = 'vitest-disposable';
		else if (legacySet.has(filename)) mode = 'legacy-schema-dependent';
		else mode = 'unclassified';
		inventory.push({ filename, mode });
	}

	return { inventory, legacySet };
}

function collectTestSource(repoRoot) {
	const roots = [join(repoRoot, 'apps/web/src'), join(repoRoot, 'apps/worker/tests')];
	const chunks = [];
	for (const root of roots) walk(root, chunks);
	return chunks.join('\n');
}

function walk(directory, chunks) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) walk(path, chunks);
		else if (/\.(?:test|spec)\.ts$/.test(entry.name)) chunks.push(readFileSync(path, 'utf8'));
	}
}
