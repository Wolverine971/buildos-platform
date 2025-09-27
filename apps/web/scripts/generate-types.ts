// scripts/generate-types.ts
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Load environment variables
config();

const projectId = process.env.PUBLIC_SUPABASE_PROJECT_ID;

if (!projectId) {
	console.error('❌ PUBLIC_SUPABASE_PROJECT_ID not found in environment variables');
	console.error('Make sure you have a .env file with PUBLIC_SUPABASE_PROJECT_ID=your-project-id');
	process.exit(1);
}

const outputPath = 'src/lib/database.types.ts';

try {
	// Ensure the directory exists
	const outputDir = dirname(outputPath);
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	console.log('🔄 Generating Supabase types...');
	console.log(`📁 Output: ${outputPath}`);
	console.log(`🎯 Project ID: ${projectId}`);

	const command = `npx supabase gen types typescript --project-id ${projectId} --schema public`;

	// Execute the command and capture output
	const output = execSync(command, { encoding: 'utf8' });

	// Write to file
	const fs = await import('fs/promises');
	await fs.writeFile(outputPath, output);

	console.log('✅ Types generated successfully!');
} catch (error: any) {
	console.error('❌ Failed to generate types:');
	if (error.message.includes('project-id')) {
		console.error('Make sure your Supabase project ID is correct and you have access to it.');
	}
	console.error(error.message);
	process.exit(1);
}
