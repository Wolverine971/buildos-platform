// scripts/generate-types.ts
import { execFileSync } from 'child_process';
import { config } from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import {
	renderDatabaseTypesFromOpenApi,
	type SupabaseOpenApiDocument
} from './lib/supabase-openapi-types.js';

// Match local app development: .env.local wins over the shared .env file.
config({ path: '.env' });
config({ path: '.env.local', override: true });

const allowStaleTypes =
	process.argv.includes('--allow-stale') || process.env.BUILDOS_ALLOW_STALE_TYPES === '1';
const typesSource = process.env.BUILDOS_SUPABASE_TYPES_SOURCE?.trim() || 'rest';
const requestedCliVersion = process.env.BUILDOS_SUPABASE_CLI_VERSION?.trim();

if (typesSource !== 'rest' && typesSource !== 'cli') {
	console.error('❌ BUILDOS_SUPABASE_TYPES_SOURCE must be either "rest" or "cli".');
	process.exit(1);
}

if (requestedCliVersion && !/^\d+\.\d+\.\d+$/.test(requestedCliVersion)) {
	console.error(
		'❌ BUILDOS_SUPABASE_CLI_VERSION must be an exact semantic version such as 2.90.0.'
	);
	process.exit(1);
}

const projectId = process.env.PUBLIC_SUPABASE_PROJECT_ID?.trim();
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
const sharedTypesOutputPath = './packages/shared-types/src/database.types.ts';

function hasExistingTypes(): boolean {
	return existsSync(sharedTypesOutputPath);
}

function hasLocalSupabaseCli(): boolean {
	try {
		execFileSync('supabase', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function getTimeoutMs(): number {
	const rawTimeout = Number(process.env.BUILDOS_TYPES_TIMEOUT_MS ?? 30_000);
	return Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 30_000;
}

function keepStaleOrExit(message: string): never {
	if (allowStaleTypes && hasExistingTypes()) {
		console.warn(`⚠️  ${message}; keeping existing database.types.ts (stale types allowed).`);
		process.exit(0);
	}

	console.error(`❌ ${message}.`);
	process.exit(1);
}

async function generateFromRest(): Promise<void> {
	if (!supabaseUrl || !serviceKey) {
		keepStaleOrExit(
			'PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY are required for type generation'
		);
	}

	let schemaUrl: URL;
	try {
		schemaUrl = new URL('/rest/v1/', supabaseUrl);
	} catch {
		keepStaleOrExit('PUBLIC_SUPABASE_URL is not a valid URL');
	}

	const response = await fetch(schemaUrl, {
		headers: {
			Accept: 'application/openapi+json',
			Authorization: `Bearer ${serviceKey}`,
			apikey: serviceKey
		},
		signal: AbortSignal.timeout(getTimeoutMs())
	});
	if (!response.ok) {
		throw new Error(`Supabase REST schema request failed with HTTP ${response.status}.`);
	}

	const document = (await response.json()) as SupabaseOpenApiDocument;
	const existingTypes = hasExistingTypes() ? await readFile(sharedTypesOutputPath, 'utf8') : '';
	const rendered = renderDatabaseTypesFromOpenApi(document, existingTypes);
	await writeFile(sharedTypesOutputPath, rendered.content);

	console.log(
		`✅ Generated ${rendered.tableCount} tables and ${rendered.viewCount} views from the local Supabase URL/service key.`
	);
	if (rendered.addedFunctions.length > 0) {
		console.warn(
			`⚠️  Added ${rendered.addedFunctions.length} RPC type(s) with Json returns because PostgREST does not expose SQL return signatures: ${rendered.addedFunctions.join(', ')}`
		);
	}
}

async function generateFromCli(): Promise<void> {
	if (!projectId) {
		keepStaleOrExit('PUBLIC_SUPABASE_PROJECT_ID is required for CLI type generation');
	}
	if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
		keepStaleOrExit(
			'SUPABASE_ACCESS_TOKEN is required for CLI type generation so the CLI never reads the system credential store'
		);
	}

	// A pinned version bypasses the globally installed CLI. This keeps type
	// generation reproducible and provides an escape hatch for CLI regressions.
	const hasLocalCli = !requestedCliVersion && hasLocalSupabaseCli();
	if (!hasLocalCli && allowStaleTypes && hasExistingTypes()) {
		console.warn(
			'⚠️  Supabase CLI not found; keeping existing database.types.ts (stale types allowed).'
		);
		return;
	}

	const command = hasLocalCli ? 'supabase' : 'npx';
	const commandArgs = hasLocalCli
		? ['gen', 'types', 'typescript', '--project-id', projectId, '--schema', 'public']
		: [
				'--yes',
				requestedCliVersion ? `supabase@${requestedCliVersion}` : 'supabase',
				'gen',
				'types',
				'typescript',
				'--project-id',
				projectId,
				'--schema',
				'public'
			];

	const output = execFileSync(command, commandArgs, {
		encoding: 'utf8',
		timeout: getTimeoutMs()
	});
	await writeFile(sharedTypesOutputPath, output);
}

(async () => {
	try {
		// Ensure the directories exist
		const sharedTypesOutputDir = dirname(sharedTypesOutputPath);

		if (!existsSync(sharedTypesOutputDir)) {
			mkdirSync(sharedTypesOutputDir, { recursive: true });
		}

		console.log('🔄 Generating Supabase types...');
		console.log(`📁 Output: ${sharedTypesOutputPath}`);
		console.log(
			`🔐 Source: ${typesSource === 'rest' ? 'local URL + service key' : 'Supabase CLI'}`
		);

		if (typesSource === 'rest') await generateFromRest();
		else await generateFromCli();

		console.log('✅ Types generated successfully to:');
		console.log(`   - ${sharedTypesOutputPath}`);
	} catch (error: any) {
		const stdout = error?.stdout?.toString?.() ?? '';
		const stderr = error?.stderr?.toString?.() ?? '';
		const message = error?.message ?? 'Unknown error';
		const details = [stderr, stdout, message].filter(Boolean).join('\n');

		if (allowStaleTypes && hasExistingTypes()) {
			console.warn(
				'⚠️  Failed to regenerate Supabase types; keeping existing database.types.ts (stale types allowed).'
			);
			console.warn(details);
			process.exit(0);
		}

		console.error('❌ Failed to generate types.');
		if (
			/registry\\.npmjs\\.org|\\bENOTFOUND\\b|\\bETIMEDOUT\\b|\\bECONNRESET\\b|\\bEAI_AGAIN\\b/i.test(
				details
			)
		) {
			console.error(
				'Looks like a network/npm issue fetching or running the Supabase CLI. If you have `supabase` installed (e.g. via Homebrew), try re-running; otherwise install it or ensure npm registry access.'
			);
		} else if (/project-id|project id|not found|invalid/i.test(details)) {
			console.error(
				'Make sure your Supabase project ID is correct and you have access to it.'
			);
		}
		console.error(details);
		process.exit(1);
	}
})();
