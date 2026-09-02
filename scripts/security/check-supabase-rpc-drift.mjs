#!/usr/bin/env node
// scripts/security/check-supabase-rpc-drift.mjs
// Compare live PostgREST RPC names with the generated Database Functions keys.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
function argument(name, fallback) {
	const index = args.indexOf(name);
	return index === -1 ? fallback : args[index + 1];
}

function generatedFunctionNames(source) {
	const publicSchemaMarker = '  public: {\n';
	const startMarker = '    Functions: {\n';
	const endMarker = '    }\n    Enums: {';
	const publicSchemaStart = source.indexOf(publicSchemaMarker);
	const start = source.indexOf(startMarker, publicSchemaStart + publicSchemaMarker.length);
	const end = source.indexOf(endMarker, start + startMarker.length);
	if (publicSchemaStart === -1 || start === -1 || end === -1)
		throw new Error('public Functions section not found in generated types');

	const section = source.slice(start + startMarker.length, end);
	return new Set(
		[...section.matchAll(/^      (?:(?:"([^"]+)")|([A-Za-z_$][A-Za-z0-9_$]*)):/gm)].map(
			(match) => match[1] ?? match[2]
		)
	);
}

const typesPath = resolve(argument('--types', 'packages/shared-types/src/database.types.ts'));
const localNames = generatedFunctionNames(readFileSync(typesPath, 'utf8'));

let document;
const openApiPath = argument('--openapi', null);
if (openApiPath) {
	document = JSON.parse(readFileSync(resolve(openApiPath), 'utf8'));
} else {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
	const serviceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY;
	if (!supabaseUrl || !serviceKey) {
		console.error('error: PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY are required');
		process.exit(2);
	}

	const response = await fetch(`${supabaseUrl}/rest/v1/`, {
		headers: {
			Accept: 'application/openapi+json',
			Authorization: `Bearer ${serviceKey}`,
			apikey: serviceKey
		}
	});
	if (!response.ok) {
		console.error(`error: Supabase OpenAPI request failed with HTTP ${response.status}`);
		process.exit(2);
	}
	document = await response.json();
}

const liveNames = new Set(
	Object.keys(document.paths ?? {})
		.filter((path) => path.startsWith('/rpc/'))
		.map((path) => path.slice('/rpc/'.length))
);

const missingLocally = [...liveNames].filter((name) => !localNames.has(name)).sort();
const missingLive = [...localNames].filter((name) => !liveNames.has(name)).sort();

if (missingLocally.length || missingLive.length) {
	console.error('RPC schema drift detected.');
	if (missingLocally.length) console.error(`live only: ${missingLocally.join(', ')}`);
	if (missingLive.length) console.error(`generated only: ${missingLive.join(', ')}`);
	process.exit(1);
}

console.log(`RPC schema is aligned (${liveNames.size} function name(s)).`);
