#!/usr/bin/env node
// scripts/database/check-sql-contract-inventory.mjs

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventorySqlContracts } from './sql-contracts.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { inventory, legacySet } = inventorySqlContracts(repoRoot);
const failures = [];
const inventoryNames = new Set(inventory.map(({ filename }) => filename));

for (const { filename, mode } of inventory) {
	if (mode === 'unclassified') failures.push(`unclassified SQL contract: ${filename}`);
	if (mode !== 'legacy-schema-dependent' && legacySet.has(filename)) {
		failures.push(`stale legacy SQL baseline entry now covered by ${mode}: ${filename}`);
	}
}
for (const filename of legacySet) {
	if (!inventoryNames.has(filename))
		failures.push(`missing legacy SQL baseline file: ${filename}`);
}

if (failures.length > 0) {
	console.error('SQL contract inventory check failed:');
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

const counts = Object.create(null);
for (const { mode } of inventory) counts[mode] = (counts[mode] ?? 0) + 1;
console.log(`SQL contract inventory valid (${inventory.length} files):`);
for (const [mode, count] of Object.entries(counts).sort()) console.log(`- ${mode}: ${count}`);
