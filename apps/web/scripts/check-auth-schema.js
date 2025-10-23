// apps/web/scripts/check-auth-schema.js

/**
 * Diagnostic script to check Supabase auth schema for missing provider column
 *
 * Usage: node apps/web/scripts/check-auth-schema.js
 *
 * Requires: PRIVATE_SUPABASE_SERVICE_KEY and PUBLIC_SUPABASE_URL environment variables
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '../../../.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('❌ Missing required environment variables:');
	if (!supabaseUrl) console.error('  - PUBLIC_SUPABASE_URL');
	if (!supabaseServiceKey) console.error('  - PRIVATE_SUPABASE_SERVICE_KEY');
	console.error('\nPlease check your .env file');
	process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		persistSession: false,
		autoRefreshToken: false
	}
});

async function checkAuthSchema() {
	console.log('🔍 Checking Supabase auth schema...\n');

	try {
		// 1. Check if auth schema exists
		console.log('1️⃣ Checking if auth schema exists...');
		const { data: schemaData, error: schemaError } = await supabase
			.rpc('auth_schema_check', {
				check_type: 'schema_exists'
			})
			.single();

		if (schemaError) {
			// If RPC doesn't exist, try direct SQL
			console.log('   Using direct SQL query...');

			// Check auth.identities columns
			const checkQuery = `
				SELECT
					column_name,
					data_type
				FROM information_schema.columns
				WHERE table_schema = 'auth'
				AND table_name = 'identities'
				ORDER BY ordinal_position;
			`;

			// Note: Direct SQL queries require database access
			console.log('   ⚠️  Direct SQL queries require database console access.');
			console.log('   Please run the diagnostic SQL manually in Supabase dashboard:');
			console.log('   Path: /apps/web/supabase/diagnostics/check_auth_schema.sql\n');
		} else {
			console.log('   ✅ Auth schema exists\n');
		}

		// 2. Try a simple check using service role
		console.log('2️⃣ Testing auth functionality...');

		// Check if we can query auth.users (requires service role)
		const { count, error: usersError } = await supabase
			.from('users') // This queries public.users, not auth.users
			.select('*', { count: 'exact', head: true });

		if (!usersError) {
			console.log(`   ✅ Can query users table (${count || 0} users exist)\n`);
		} else {
			console.log('   ⚠️  Error querying users:', usersError.message, '\n');
		}

		// 3. Provide instructions
		console.log('📋 NEXT STEPS:');
		console.log('=====================================\n');
		console.log('1. Go to your Supabase Dashboard:');
		console.log('   https://app.supabase.com/project/[your-project-id]/sql/new\n');

		console.log('2. Run the diagnostic SQL query:');
		console.log(
			'   Copy and paste from: /apps/web/supabase/diagnostics/check_auth_schema.sql\n'
		);

		console.log('3. Check the results for this message:');
		console.log('   "❌ auth.identities.provider column is MISSING - THIS IS THE PROBLEM!"\n');

		console.log('4. If the provider column is missing, run the fix:');
		console.log(
			'   Copy and paste from: /apps/web/supabase/migrations/20251022_fix_auth_identities_provider.sql\n'
		);

		console.log('5. Test registration again after applying the fix.\n');

		console.log('=====================================');
		console.log('📚 Files created:');
		console.log('   • Diagnostic: /apps/web/supabase/diagnostics/check_auth_schema.sql');
		console.log(
			'   • Fix migration: /apps/web/supabase/migrations/20251022_fix_auth_identities_provider.sql'
		);
		console.log('   • Enhanced logging: /apps/web/src/routes/api/auth/register/+server.ts');
		console.log('   • Documentation: /docs/BUGFIX_CHANGELOG.md');
		console.log('=====================================\n');
	} catch (error) {
		console.error('❌ Error checking auth schema:', error);
		process.exit(1);
	}
}

// Run the check
checkAuthSchema();
