#!/usr/bin/env node
// scripts/security/export-phase1-retired-data.mjs
// Export the one non-empty Phase 1 removal candidate before its guarded drop.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

function loadEnvFile(path) {
	if (!existsSync(path)) return;
	for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const separator = line.indexOf('=');
		if (separator === -1) continue;
		const key = line.slice(0, separator).trim();
		if (process.env[key]) continue;
		let value = line.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

for (const envPath of ['.env.local', 'apps/web/.env', '.env']) loadEnvFile(resolve(envPath));

const args = process.argv.slice(2);
function argument(name) {
	const index = args.indexOf(name);
	if (index !== -1) return args[index + 1] ?? null;
	const assignment = args.find((value) => value.startsWith(`${name}=`));
	return assignment ? assignment.slice(name.length + 1) : null;
}

function expandHome(path) {
	if (path === '~') return homedir();
	if (path.startsWith('~/')) return resolve(homedir(), path.slice(2));
	return path;
}

const requestedOutput = argument('--output');
const suggestedOutput = resolve(homedir(), 'Documents', 'BuildOS Database Archives', 'phase1');
if (!requestedOutput) {
	console.error('error: --output is required');
	console.error(`example: --output "${suggestedOutput}"`);
	process.exit(2);
}

const expandedOutput = expandHome(requestedOutput);
if (!isAbsolute(expandedOutput)) {
	console.error('error: --output must be an absolute directory outside the repository');
	console.error(`example: --output "${suggestedOutput}"`);
	process.exit(2);
}

if (expandedOutput === '/absolute/secure/archive/directory') {
	console.error(
		'error: /absolute/secure/archive/directory is a placeholder, not a writable archive path'
	);
	console.error(`use: --output "${suggestedOutput}"`);
	process.exit(2);
}

const outputDirectory = resolve(expandedOutput);
const repositoryRoot = resolve('.');
const relativeToRepository = relative(repositoryRoot, outputDirectory);
if (!relativeToRepository.startsWith('..') && relativeToRepository !== '') {
	console.error('error: archive output may not be written inside the repository');
	process.exit(2);
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const serviceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
if (!supabaseUrl || !serviceKey) {
	console.error('error: PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY are required');
	process.exit(2);
}

function safeResponseDetail(raw) {
	return raw.trim().slice(0, 4000).replaceAll(serviceKey, '[redacted service key]');
}

async function responseDetail(response) {
	try {
		return safeResponseDetail(await response.text());
	} catch {
		return '';
	}
}

const tableName = 'user_notification_preferences_backup';
const pageSize = 1000;
const rows = [];

for (let offset = 0; ; offset += pageSize) {
	let response;
	try {
		response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=*`, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${serviceKey}`,
				Range: `${offset}-${offset + pageSize - 1}`,
				Prefer: 'count=exact',
				apikey: serviceKey
			}
		});
	} catch (error) {
		console.error(`error: could not connect to Supabase: ${error.message}`);
		process.exit(1);
	}
	if (!response.ok) {
		console.error(
			`error: export request failed with HTTP ${response.status} ${response.statusText}`.trim()
		);
		const detail = await responseDetail(response);
		if (detail) console.error(`Supabase: ${detail}`);
		if (response.status === 404) {
			console.error(
				'hint: confirm user_notification_preferences_backup still exists and migration 50000 has not already completed'
			);
		}
		process.exit(1);
	}

	const page = await response.json();
	if (!Array.isArray(page)) {
		console.error('error: export response was not an array');
		process.exit(1);
	}
	rows.push(...page);
	if (page.length < pageSize) break;
}

function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonicalize(value[key])])
		);
	}
	return value;
}

const lines = rows.map((row) => JSON.stringify(canonicalize(row))).sort();
const payload = `${lines.join('\n')}${lines.length ? '\n' : ''}`;
const sha256 = createHash('sha256').update(payload).digest('hex');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const dataPath = resolve(outputDirectory, `${tableName}-${timestamp}.jsonl`);
const manifestPath = resolve(outputDirectory, `${tableName}-${timestamp}.manifest.json`);

try {
	mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
	writeFileSync(dataPath, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
	writeFileSync(
		manifestPath,
		`${JSON.stringify(
			{
				export_format: 'canonical-jsonl-v1',
				exported_at: new Date().toISOString(),
				row_count: rows.length,
				sha256,
				table: tableName
			},
			null,
			2
		)}\n`,
		{ encoding: 'utf8', mode: 0o600, flag: 'wx' }
	);
} catch (error) {
	console.error(`error: could not write archive files: ${error.message}`);
	console.error(`hint: choose a writable absolute path, for example "${suggestedOutput}"`);
	process.exit(1);
}

let receiptResponse;
try {
	receiptResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/record_phase1_archive_receipt`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${serviceKey}`,
			'content-type': 'application/json',
			apikey: serviceKey
		},
		body: JSON.stringify({
			p_row_count: rows.length,
			p_sha256: sha256,
			p_table_name: tableName
		})
	});
} catch (error) {
	console.error(
		`error: archive files were written, but Supabase could not be reached: ${error.message}`
	);
	console.error(`data: ${dataPath}`);
	console.error(`manifest: ${manifestPath}`);
	process.exit(1);
}

if (!receiptResponse.ok) {
	console.error(
		`error: archive files were written, but recording the database receipt failed with HTTP ${receiptResponse.status} ${receiptResponse.statusText}`.trim()
	);
	const detail = await responseDetail(receiptResponse);
	if (detail) console.error(`Supabase: ${detail}`);
	if (receiptResponse.status === 404) {
		console.error(
			'hint: apply migration 20260730040000 first; if it is already applied, reload the PostgREST schema cache and retry'
		);
	} else if (receiptResponse.status === 401 || receiptResponse.status === 403) {
		console.error(
			'hint: verify PRIVATE_SUPABASE_SERVICE_KEY is the service_role key for this project'
		);
	}
	console.error(`data: ${dataPath}`);
	console.error(`manifest: ${manifestPath}`);
	process.exit(1);
}

console.log(`exported ${rows.length} row(s)`);
console.log(`sha256 ${sha256}`);
console.log(`data ${dataPath}`);
console.log(`manifest ${manifestPath}`);
console.log('database receipt recorded');
