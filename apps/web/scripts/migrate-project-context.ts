// scripts/migrate-project-context.ts

// deprecated - no longer using project_context table

import { createCustomClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import * as dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = '';
const supabaseServiceKey = '';

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing required environment variables');
	process.exit(1);
}

const supabase = createCustomClient(supabaseUrl, supabaseServiceKey);

async function migrateProjectContext() {
	console.log('Starting project context migration...');

	try {
		// Get ALL project_context records, not just one
		const { data: contexts, error } = await supabase.from('project_context').select('*');

		if (error) {
			console.error('Error fetching contexts:', error);
			return;
		}

		if (!contexts || contexts.length === 0) {
			console.log('No project contexts to migrate');
			return;
		}

		console.log(`Found ${contexts.length} contexts to migrate`);

		// Complete field mappings
		const fieldMappings: Record<string, { description: string; category: string }> = {
			vision: { description: 'Project vision and purpose', category: 'mission' },
			goals: { description: 'Specific project objectives', category: 'mission' },
			phases: { description: 'Project phases and timeline', category: 'execution' },
			target_users: { description: 'Audience and user personas', category: 'mission' },
			growth_strategy: { description: 'Scaling and growth approach', category: 'execution' },
			brand_voice: { description: 'Communication style and tone', category: 'coordination' },
			social_media_accounts: {
				description: 'Associated social channels',
				category: 'coordination'
			},
			feelings_to_invoke: {
				description: 'Emotional responses to create',
				category: 'mission'
			},
			thoughts_to_think: { description: 'Mindset and mental models', category: 'mission' },
			actions_to_do: { description: 'Key behaviors and activities', category: 'execution' },
			inspiration: { description: 'Reference projects and examples', category: 'situation' },
			differentiators: { description: 'Unique value propositions', category: 'mission' },
			current_problems: {
				description: 'Active challenges and blockers',
				category: 'situation'
			},
			assets: { description: 'Available resources and materials', category: 'operations' },
			tech_stack: { description: 'Technology and tools used', category: 'operations' },
			keywords: { description: 'SEO and discovery terms', category: 'coordination' },
			llm_prompt_examples: {
				description: 'AI interaction templates',
				category: 'operations'
			},
			recent_updates: {
				description: 'Latest developments and changes',
				category: 'situation'
			},
			team_notes: { description: 'Collaboration and team context', category: 'coordination' }
		};

		let successCount = 0;
		let errorCount = 0;

		// Process each context
		for (const context of contexts) {
			try {
				const dynamicContext: Record<string, any> = {};
				const contextSchema: Record<string, any> = {};

				// Check if already migrated
				if (context.context && Object.keys(context.context).length > 0) {
					console.log(`Context ${context.id} already migrated, skipping...`);
					continue;
				}

				// Map all existing fields to dynamic context
				let hasData = false;
				for (const [field, metadata] of Object.entries(fieldMappings)) {
					if (context[field] && context[field].trim() !== '') {
						dynamicContext[field] = context[field];
						contextSchema[field] = metadata;
						hasData = true;
					}
				}

				if (!hasData) {
					console.log(`Context ${context.id} has no data, skipping...`);
					continue;
				}

				// Generate executive summary
				const vision = context.vision || '';
				const goals = context.goals || '';
				const problems = context.current_problems || '';

				let executiveSummary = '';
				if (vision || goals) {
					executiveSummary = `${vision} ${goals ? `Goals: ${goals}` : ''}`.trim();
				} else if (problems) {
					executiveSummary = `Working to address: ${problems}`;
				} else {
					executiveSummary = 'Project context established';
				}

				// Truncate to reasonable length
				if (executiveSummary.length > 200) {
					executiveSummary = executiveSummary.substring(0, 197) + '...';
				}

				// Update the record
				const { data: contextData, error: updateError } = await supabase
					.from('project_contextt')
					.insert({
						user_id: '', // Replace with actual user ID
						project_id: context.project_id,
						context: dynamicContext,
						context_schema: contextSchema,
						executive_summary: executiveSummary,
						context_version: 1,
						updated_at: new Date().toISOString()
					});

				if (updateError) {
					console.error(`Error updating context ${context.id}:`, updateError);
					errorCount++;
				} else {
					console.log(`Successfully migrated context ${context.id}`);
					successCount++;
				}
			} catch (err) {
				console.error(`Error processing context ${context.id}:`, err);
				errorCount++;
			}
		}

		console.log('\nMigration complete!');
		console.log(`Success: ${successCount}`);
		console.log(`Errors: ${errorCount}`);
		console.log(`Skipped: ${contexts.length - successCount - errorCount}`);
	} catch (error) {
		console.error('Migration failed:', error);
	}
}

// Run the migration
migrateProjectContext()
	.then(() => {
		console.log('Migration script finished');
		process.exit(0);
	})
	.catch((error) => {
		console.error('Migration script failed:', error);
		process.exit(1);
	});
