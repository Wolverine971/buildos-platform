// apps/web/scripts/migrate-api-responses.js
// scripts/migrate-api-responses.js

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Patterns to replace in API endpoints
const replacements = [
	// Import statements
	{
		pattern: /import\s*{\s*json\s*}\s*from\s*['"]@sveltejs\/kit['"]\s*;/g,
		replacement: ''
	},
	{
		pattern: /import\s+type\s*{\s*RequestHandler\s*}\s*from\s*['"]\.\$types['"]\s*;/g,
		replacement:
			"import type { RequestHandler } from './$types';\nimport { ApiResponse } from '$lib/utils/api-response';"
	},
	// Error responses
	{
		pattern:
			/return\s+json\(\s*{\s*error:\s*['"]Unauthorized['"]\s*}\s*,\s*{\s*status:\s*401\s*}\s*\)/g,
		replacement: 'return ApiResponse.unauthorized()'
	},
	{
		pattern:
			/return\s+json\(\s*{\s*error:\s*['"]Forbidden['"]\s*}\s*,\s*{\s*status:\s*403\s*}\s*\)/g,
		replacement: 'return ApiResponse.forbidden()'
	},
	{
		pattern:
			/return\s+json\(\s*{\s*error:\s*['"](.+?)not found['"]\s*}\s*,\s*{\s*status:\s*404\s*}\s*\)/gi,
		replacement: 'return ApiResponse.notFound("$1")'
	},
	{
		pattern:
			/return\s+json\(\s*{\s*error:\s*error\.message\s*}\s*,\s*{\s*status:\s*500\s*}\s*\)/g,
		replacement: 'return ApiResponse.databaseError(error)'
	},
	{
		pattern:
			/return\s+json\(\s*{\s*error:\s*['"]Internal server error['"]\s*}\s*,\s*{\s*status:\s*500\s*}\s*\)/g,
		replacement: 'return ApiResponse.internalError(error)'
	},
	// Success responses
	{
		pattern: /return\s+json\(\s*{\s*([^}]+)\s*}\s*\)/g,
		replacement: (match, content) => {
			// Skip if it's an error response
			if (content.includes('error:')) return match;
			return `return ApiResponse.success({ ${content} })`;
		}
	}
];

async function migrateFile(filePath) {
	try {
		let content = fs.readFileSync(filePath, 'utf8');
		let modified = false;

		// Skip if already using ApiResponse
		if (content.includes('ApiResponse')) {
			console.log(`✓ Already migrated: ${filePath}`);
			return;
		}

		// Skip if not using json from sveltejs/kit
		if (!content.includes("from '@sveltejs/kit'")) {
			console.log(`⚠️  Skipping (no json import): ${filePath}`);
			return;
		}

		// Apply replacements
		for (const { pattern, replacement } of replacements) {
			const newContent = content.replace(pattern, replacement);
			if (newContent !== content) {
				content = newContent;
				modified = true;
			}
		}

		if (modified) {
			// Clean up duplicate imports
			content = content.replace(
				/import\s*{\s*ApiResponse\s*}\s*from\s*['"]\$lib\/utils\/api-response['"]\s*;\n/g,
				''
			);
			content = content.replace(
				/(import type { RequestHandler } from '.\/\$types';)\n/g,
				"$1\nimport { ApiResponse } from '$lib/utils/api-response';\n"
			);

			fs.writeFileSync(filePath, content);
			console.log(`✅ Migrated: ${filePath}`);
		} else {
			console.log(`⚠️  No changes needed: ${filePath}`);
		}
	} catch (error) {
		console.error(`❌ Error processing ${filePath}:`, error.message);
	}
}

async function main() {
	console.log('Starting API response migration...\n');

	// Find all API endpoint files
	const files = glob.sync('src/routes/api/**/*.ts', {
		ignore: ['**/*.test.ts', '**/*.spec.ts']
	});

	console.log(`Found ${files.length} API files to process\n`);

	for (const file of files) {
		await migrateFile(file);
	}

	console.log('\n✨ Migration complete!');
	console.log('\nNext steps:');
	console.log('1. Review the changes');
	console.log('2. Run type checking: pnpm run check');
	console.log('3. Test the API endpoints');
	console.log('4. Update frontend code to handle new response format');
}

main().catch(console.error);
