#!/usr/bin/env node
// scripts/security/verify-retired-data-archive.mjs
// Independently verify a retired-schema JSONL archive and its filesystem modes.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const requestedDirectory = process.argv[2];
if (!requestedDirectory || !isAbsolute(requestedDirectory)) {
	console.error(
		'usage: node scripts/security/verify-retired-data-archive.mjs /absolute/archive/package'
	);
	process.exit(2);
}

const packageDirectory = resolve(requestedDirectory);
const expectedDirectoryMode = 0o700;
const expectedFileMode = 0o600;
const actualDirectoryMode = statSync(packageDirectory).mode & 0o777;
if (actualDirectoryMode !== expectedDirectoryMode) {
	throw new Error(
		`archive directory mode is ${actualDirectoryMode.toString(8)}, expected ${expectedDirectoryMode.toString(8)}`
	);
}

const manifestPath = resolve(packageDirectory, 'manifest.json');
const manifestMode = statSync(manifestPath).mode & 0o777;
if (manifestMode !== expectedFileMode) {
	throw new Error(
		`manifest.json mode is ${manifestMode.toString(8)}, expected ${expectedFileMode.toString(8)}`
	);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.export_format !== 'buildos-retired-schema-archive-v1') {
	throw new Error(`unsupported archive format: ${manifest.export_format}`);
}
if (!Array.isArray(manifest.datasets)) throw new Error('manifest datasets must be an array');

const fingerprints = [];
for (const dataset of manifest.datasets) {
	const datasetPath = resolve(packageDirectory, dataset.file);
	const actualMode = statSync(datasetPath).mode & 0o777;
	if (actualMode !== expectedFileMode) {
		throw new Error(
			`${dataset.file} mode is ${actualMode.toString(8)}, expected ${expectedFileMode.toString(8)}`
		);
	}
	const payload = readFileSync(datasetPath, 'utf8');
	const actualHash = createHash('sha256').update(payload).digest('hex');
	const actualRows = payload.length === 0 ? 0 : payload.trimEnd().split('\n').length;
	if (actualHash !== dataset.sha256) {
		throw new Error(`${dataset.file} SHA-256 mismatch`);
	}
	if (actualRows !== dataset.row_count) {
		throw new Error(
			`${dataset.file} row count is ${actualRows}, expected ${dataset.row_count}`
		);
	}
	fingerprints.push(`${dataset.file}:${actualRows}:${actualHash}`);
	console.log(`${dataset.file}\trows=${actualRows}\tsha256=${actualHash}\tmode=0600`);
}

const actualPackageHash = createHash('sha256').update(fingerprints.join('\n')).digest('hex');
if (actualPackageHash !== manifest.package_sha256) {
	throw new Error('package SHA-256 mismatch');
}

console.log(`verified ${packageDirectory}`);
console.log(`package_sha256=${actualPackageHash}\tdirectory_mode=0700`);
