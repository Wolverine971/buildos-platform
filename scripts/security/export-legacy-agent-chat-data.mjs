#!/usr/bin/env node
// scripts/security/export-legacy-agent-chat-data.mjs
// Archive the pre-ontology agent-chat generation before its guarded retirement.

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

const LEGACY_TABLES = [
	'agents',
	'agent_plans',
	'agent_chat_sessions',
	'agent_chat_messages',
	'agent_executions'
];

function loadEnvFile(path) {
	if (!existsSync(path)) return;
	for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const separator = line.indexOf('=');
		if (separator < 1) continue;
		const name = line.slice(0, separator).trim();
		if (process.env[name]) continue;
		let value = line.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[name] = value;
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
const suggestedOutput = resolve(
	homedir(),
	'Documents',
	'BuildOS Database Archives',
	'legacy-agent-chat'
);
if (!requestedOutput) {
	console.error('error: --output is required');
	console.error(`example: --output "${suggestedOutput}"`);
	process.exit(2);
}

const expandedOutput = expandHome(requestedOutput);
if (!isAbsolute(expandedOutput)) {
	console.error('error: --output must be an absolute directory outside the repository');
	process.exit(2);
}

const outputRoot = resolve(expandedOutput);
const repositoryRoot = resolve('.');
const relativeToRepository = relative(repositoryRoot, outputRoot);
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

async function readTable(table, { select = '*', query = {} } = {}) {
	const rows = [];
	const pageSize = 1000;
	const params = new URLSearchParams({ select, ...query });
	for (let offset = 0; ; offset += pageSize) {
		let response;
		try {
			response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${serviceKey}`,
					Range: `${offset}-${offset + pageSize - 1}`,
					Prefer: 'count=exact',
					apikey: serviceKey
				}
			});
		} catch (error) {
			throw new Error(`could not connect while exporting ${table}: ${error.message}`);
		}
		if (!response.ok) {
			const detail = safeResponseDetail(await response.text());
			throw new Error(
				`${table} export returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`
			);
		}
		const page = await response.json();
		if (!Array.isArray(page)) throw new Error(`${table} export response was not an array`);
		rows.push(...page);
		if (page.length < pageSize) return rows;
	}
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

function serializeRows(rows) {
	const lines = rows.map((row) => JSON.stringify(canonicalize(row))).sort();
	return `${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

const exportedAt = new Date().toISOString();
const timestamp = exportedAt.replace(/[:.]/g, '-');
const packageDirectory = resolve(outputRoot, `legacy-agent-chat-${timestamp}`);

try {
	mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
	chmodSync(outputRoot, 0o700);
	mkdirSync(packageDirectory, { recursive: false, mode: 0o700 });
	chmodSync(packageDirectory, 0o700);
} catch (error) {
	console.error(`error: could not create archive package: ${error.message}`);
	console.error(`hint: choose a writable absolute directory, for example "${suggestedOutput}"`);
	process.exit(1);
}

let legacyRows;
let usageRows;
let timingRows;
try {
	[legacyRows, usageRows, timingRows] = await Promise.all([
		Promise.all(LEGACY_TABLES.map(async (table) => [table, await readTable(table)])),
		readTable('llm_usage_logs', {
			query: {
				or: '(agent_execution_id.not.is.null,agent_plan_id.not.is.null,agent_session_id.not.is.null)'
			}
		}),
		readTable('timing_metrics', {
			query: {
				or: '(session_id.not.is.null,agent_plan_id.not.is.null,planner_agent_id.not.is.null)'
			}
		})
	]);
} catch (error) {
	console.error(`error: ${error.message}`);
	console.error(`empty package directory left at ${packageDirectory}`);
	process.exit(1);
}

const datasets = [
	...legacyRows.map(([name, rows]) => ({ name, rows, source: `public.${name}` })),
	{
		name: 'llm_usage_logs_legacy_attribution',
		rows: usageRows,
		source: 'public.llm_usage_logs',
		filter: 'agent_execution_id OR agent_plan_id OR agent_session_id is not null'
	},
	{
		name: 'timing_metrics_legacy_attribution',
		rows: timingRows,
		source: 'public.timing_metrics',
		filter: 'session_id OR agent_plan_id OR planner_agent_id is not null'
	}
];

const manifestDatasets = [];
try {
	for (const dataset of datasets) {
		const payload = serializeRows(dataset.rows);
		const sha256 = createHash('sha256').update(payload).digest('hex');
		const filename = `${dataset.name}.jsonl`;
		writeFileSync(resolve(packageDirectory, filename), payload, {
			encoding: 'utf8',
			mode: 0o600,
			flag: 'wx'
		});
		manifestDatasets.push({
			file: filename,
			filter: dataset.filter ?? null,
			row_count: dataset.rows.length,
			sha256,
			source: dataset.source
		});
	}

	const packageFingerprint = createHash('sha256')
		.update(
			manifestDatasets
				.map((dataset) => `${dataset.file}:${dataset.row_count}:${dataset.sha256}`)
				.join('\n')
		)
		.digest('hex');
	const manifest = {
		export_format: 'buildos-retired-schema-archive-v1',
		exported_at: exportedAt,
		package_sha256: packageFingerprint,
		retirement: 'legacy-agent-chat-generation',
		datasets: manifestDatasets
	};
	writeFileSync(
		resolve(packageDirectory, 'manifest.json'),
		`${JSON.stringify(manifest, null, 2)}\n`,
		{ encoding: 'utf8', mode: 0o600, flag: 'wx' }
	);
} catch (error) {
	console.error(`error: could not write archive files: ${error.message}`);
	console.error(`partial package left at ${packageDirectory}; do not use it as a receipt`);
	process.exit(1);
}

console.log(`archive package ${packageDirectory}`);
for (const dataset of manifestDatasets) {
	console.log(`${dataset.file}\trows=${dataset.row_count}\tsha256=${dataset.sha256}`);
}
console.log('manifest.json written; no database state was changed');
