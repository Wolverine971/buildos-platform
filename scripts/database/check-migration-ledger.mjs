#!/usr/bin/env node
// scripts/database/check-migration-ledger.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, '../..');
const migrationsDirectory = join(repoRoot, 'supabase/migrations');
const baselinePath = join(repoRoot, 'supabase/migration-ledger-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const migrationFiles = readdirSync(migrationsDirectory)
	.filter((filename) => filename.endsWith('.sql'))
	.sort();
const migrationSet = new Set(migrationFiles);
const failures = [];

const parseVersion = (filename) => filename.split('_', 1)[0];
const versionFiles = new Map();
for (const filename of migrationFiles) {
	const version = parseVersion(filename);
	const files = versionFiles.get(version) ?? [];
	files.push(filename);
	versionFiles.set(version, files);
}

const allowedNonCanonical = new Set(baseline.nonCanonicalFilenames ?? []);
for (const filename of migrationFiles) {
	const canonical = /^\d{14}_[a-z0-9][a-z0-9_]*\.sql$/.test(filename);
	if (!canonical && !allowedNonCanonical.has(filename)) {
		failures.push(`noncanonical migration filename: ${filename}`);
	}
}
for (const filename of allowedNonCanonical) {
	if (!migrationSet.has(filename)) {
		failures.push(`stale noncanonical baseline entry: ${filename}`);
	}
}

const allowedDuplicates = baseline.duplicateVersions ?? {};
for (const [version, files] of versionFiles) {
	if (files.length < 2) continue;
	const expected = [...(allowedDuplicates[version] ?? [])].sort();
	const actual = [...files].sort();
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		failures.push(
			`duplicate migration version ${version}: ${actual.join(', ')} (not an exact historical baseline match)`
		);
	}
}
for (const version of Object.keys(allowedDuplicates)) {
	if ((versionFiles.get(version) ?? []).length < 2) {
		failures.push(`stale duplicate-version baseline entry: ${version}`);
	}
}

const baseRef = process.env.MIGRATION_BASE_REF?.trim();
if (baseRef && !/^0+$/.test(baseRef)) {
	try {
		const diff = execFileSync(
			'git',
			['diff', '--name-status', `${baseRef}...HEAD`, '--', 'supabase/migrations'],
			{ cwd: repoRoot, encoding: 'utf8' }
		);
		for (const line of diff.trim().split('\n').filter(Boolean)) {
			const [status, ...paths] = line.split('\t');
			if (status === 'A') continue;
			failures.push(
				`applied migration history is immutable (${status}): ${paths.join(' -> ')}`
			);
		}
	} catch (error) {
		failures.push(`unable to compare migrations with ${baseRef}: ${error.message}`);
	}
}

if (failures.length > 0) {
	console.error('Migration ledger check failed:');
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(
	`Migration ledger valid: ${migrationFiles.length} files, ` +
		`${allowedNonCanonical.size} historical filename exceptions, ` +
		`${Object.keys(allowedDuplicates).length} historical duplicate versions.`
);
if (!baseRef) {
	console.log('Migration immutability comparison skipped (MIGRATION_BASE_REF is not set).');
}
