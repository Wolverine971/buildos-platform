// scripts/generate-types.ts
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';

// Load environment variables
config();

const allowStaleTypes =
	process.argv.includes('--allow-stale') || process.env.BUILDOS_ALLOW_STALE_TYPES === '1';

const projectId = process.env.PUBLIC_SUPABASE_PROJECT_ID;

if (!projectId) {
	if (allowStaleTypes && existsSync('./packages/shared-types/src/database.types.ts')) {
		console.warn(
			'⚠️  PUBLIC_SUPABASE_PROJECT_ID not found; keeping existing database.types.ts (stale types allowed).'
		);
		process.exit(0);
	}

	console.error('❌ PUBLIC_SUPABASE_PROJECT_ID not found in environment variables');
	console.error('Make sure you have a .env file with PUBLIC_SUPABASE_PROJECT_ID=your-project-id');
	process.exit(1);
}

// Output to both locations for compatibility
const sharedTypesOutputPath = './packages/shared-types/src/database.types.ts';

(async () => {
	try {
		// Ensure the directories exist
		const sharedTypesOutputDir = dirname(sharedTypesOutputPath);

		if (!existsSync(sharedTypesOutputDir)) {
			mkdirSync(sharedTypesOutputDir, { recursive: true });
		}

		console.log('🔄 Generating Supabase types...');
		console.log(`📁 Output: ${sharedTypesOutputPath}`);
		console.log(`🎯 Project ID: ${projectId}`);

		let command = `npx --yes supabase gen types typescript --project-id ${projectId} --schema public`;
		try {
			execSync('supabase --version', { stdio: 'ignore' });
			command = `supabase gen types typescript --project-id ${projectId} --schema public`;
		} catch {
			// Fall back to npx
		}

		// Execute the command and capture output
		const output = execSync(command, { encoding: 'utf8' });

		// Write to shared-types package
		await writeFile(sharedTypesOutputPath, output);

		console.log('✅ Types generated successfully to:');
		console.log(`   - ${sharedTypesOutputPath}`);
	} catch (error: any) {
		const stdout = error?.stdout?.toString?.() ?? '';
		const stderr = error?.stderr?.toString?.() ?? '';
		const message = error?.message ?? 'Unknown error';
		const details = [stderr, stdout, message].filter(Boolean).join('\n');

		if (allowStaleTypes && existsSync(sharedTypesOutputPath)) {
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
