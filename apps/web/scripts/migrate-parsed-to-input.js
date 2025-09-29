// scripts/migrate-parsed-to-input.js
// Run this after the database migration to populate input columns from existing parsed data

import { createCustomClient } from '@buildos/supabase-client';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.PUBLIC_SUPABASE_ANON_KEY; // Use service role for migration

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing required environment variables');
	process.exit(1);
}

const supabase = createCustomClient(supabaseUrl, supabaseServiceKey);

// Field mappings for each category
const CATEGORY_FIELD_MAPPING = {
	who: ['background', 'identity', 'values', 'personality'],
	building: ['active_projects', 'goals_overview'],
	believe: ['philosophies', 'worldview', 'principles'],
	work: ['habits', 'workflows', 'tools', 'schedule_preferences', 'work_style'],
	help: ['blockers', 'collaboration_needs', 'skill_gaps'],
	goals: ['aspirations', 'priorities']
};

function aggregateFields(context, category) {
	const fields = CATEGORY_FIELD_MAPPING[category];
	const values = fields
		.map((field) => context[field])
		.filter((value) => value && typeof value === 'string' && value.trim().length > 0)
		.map((value) => value.trim());

	return values.length > 0 ? values.join('\n\n') : null;
}

async function migrateData() {
	try {
		console.log('Starting migration of parsed data to input columns...');

		// Get all user contexts
		const { data: contexts, error } = await supabase.from('user_context').select('*');

		if (error) {
			throw error;
		}

		console.log(`Found ${contexts.length} user contexts to migrate`);

		let successCount = 0;
		let skipCount = 0;

		for (const context of contexts) {
			try {
				// Aggregate fields for each category
				const inputWho = aggregateFields(context, 'who');
				const inputBuilding = aggregateFields(context, 'building');
				const inputBelieve = aggregateFields(context, 'believe');
				const inputWork = aggregateFields(context, 'work');
				const inputHelp = aggregateFields(context, 'help');
				const inputGoals = aggregateFields(context, 'goals');

				// Check if there's any data to migrate
				if (
					!inputWho &&
					!inputBuilding &&
					!inputBelieve &&
					!inputWork &&
					!inputHelp &&
					!inputGoals
				) {
					console.log(`Skipping user ${context.user_id} - no parsed data found`);
					skipCount++;
					continue;
				}

				// Update the record
				const { error: updateError } = await supabase
					.from('user_context')
					.update({
						input_who: inputWho,
						input_building: inputBuilding,
						input_believe: inputBelieve,
						input_work: inputWork,
						input_help: inputHelp,
						input_goals: inputGoals,
						updated_at: new Date().toISOString()
					})
					.eq('user_id', context.user_id);

				if (updateError) {
					console.error(`Error updating user ${context.user_id}:`, updateError);
					continue;
				}

				console.log(`✅ Migrated data for user ${context.user_id}`);
				console.log(`   - Who: ${inputWho ? 'Yes' : 'No'}`);
				console.log(`   - Building: ${inputBuilding ? 'Yes' : 'No'}`);
				console.log(`   - Believe: ${inputBelieve ? 'Yes' : 'No'}`);
				console.log(`   - Work: ${inputWork ? 'Yes' : 'No'}`);
				console.log(`   - Help: ${inputHelp ? 'Yes' : 'No'}`);
				console.log(`   - Goals: ${inputGoals ? 'Yes' : 'No'}`);

				successCount++;
			} catch (userError) {
				console.error(`Error processing user ${context.user_id}:`, userError);
			}
		}

		console.log('\n📊 Migration Summary:');
		console.log(`✅ Successfully migrated: ${successCount} users`);
		console.log(`⏭️  Skipped (no data): ${skipCount} users`);
		console.log(`❌ Failed: ${contexts.length - successCount - skipCount} users`);
	} catch (error) {
		console.error('Migration failed:', error);
		process.exit(1);
	}
}

// Run the migration
migrateData()
	.then(() => {
		console.log('Migration completed successfully!');
		process.exit(0);
	})
	.catch((error) => {
		console.error('Migration failed:', error);
		process.exit(1);
	});
