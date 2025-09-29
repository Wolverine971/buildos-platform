// scripts/migrate-calendar-webhooks.ts
// Migration script to register webhooks for users with existing calendar connections
// This script is idempotent and can be run multiple times safely

import { createCustomClient } from '@buildos/supabase-client';
import { CalendarWebhookMigrationService } from './lib/calendar-webhook-migration-service';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
// Try different possible names for the service role key
const PRIVATE_SUPABASE_SERVICE_KEY =
	process.env.PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_CLIENT_ID = process.env.PRIVATE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET =
	process.env.PRIVATE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
// Allow override via command line for production URL
const APP_URL = 'https://build-os.com';
// process.argv.find((arg) => arg.startsWith('--url='))?.split('=')[1] ||
//                 process.env.PUBLIC_APP_URL ||
// 'http://localhost:5173';
const DRY_RUN = process.argv.includes('--dry-run');
const RESUME_FROM_USER = process.argv
	.find((arg) => arg.startsWith('--resume-from='))
	?.split('=')[1];

if (!SUPABASE_URL || !PRIVATE_SUPABASE_SERVICE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
	console.error('❌ Missing required environment variables');
	console.error('\nRequired environment variables:');
	console.error('  PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✅ Set' : '❌ Missing');
	console.error(
		'  PRIVATE_SUPABASE_SERVICE_KEY:',
		PRIVATE_SUPABASE_SERVICE_KEY
			? '✅ Set'
			: '❌ Missing (also tried PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_KEY)'
	);
	console.error(
		'  PRIVATE_GOOGLE_CLIENT_ID:',
		GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing (also tried GOOGLE_CLIENT_ID)'
	);
	console.error(
		'  PRIVATE_GOOGLE_CLIENT_SECRET:',
		GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing (also tried GOOGLE_CLIENT_SECRET)'
	);
	console.error('\nPlease ensure these are set in your .env file');
	console.error(
		'\nNote: The PRIVATE_SUPABASE_SERVICE_KEY is different from the PUBLIC_SUPABASE_ANON_KEY.'
	);
	console.error(
		'You can find it in your Supabase project settings under API > Service role key.'
	);
	process.exit(1);
}

const supabase = createCustomClient(SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});

// Create a log file for the migration
const logFileName = `migration-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const logFilePath = path.join(process.cwd(), 'logs', logFileName);

// Ensure logs directory exists
if (!fs.existsSync(path.dirname(logFilePath))) {
	fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
}

const migrationLog: any = {
	startTime: new Date().toISOString(),
	dryRun: DRY_RUN,
	webhookUrl: `${APP_URL}/webhooks/calendar-events`,
	results: [],
	summary: {}
};

async function migrateCalendarWebhooks() {
	console.log('🚀 Starting calendar webhook migration...');
	console.log(`📍 Webhook URL: ${APP_URL}/webhooks/calendar-events`);

	// Validate webhook URL
	if (!APP_URL.startsWith('https://')) {
		console.error('\n❌ ERROR: Google Calendar webhooks require HTTPS URLs');
		console.error(`   Current URL: ${APP_URL}`);
		console.error('\n   Please provide a valid HTTPS URL using one of these methods:');
		console.error('   1. Set PUBLIC_APP_URL in your .env file:');
		console.error('      PUBLIC_APP_URL=https://build-os.com');
		console.error('   2. Pass it as a command line argument:');
		console.error(
			'      pnpm tsx scripts/migrate-calendar-webhooks.ts --url=https://build-os.com'
		);
		console.error('\n   Note: localhost URLs will not work with Google Calendar webhooks');
		process.exit(1);
	}

	if (DRY_RUN) {
		console.log('⚠️  DRY RUN MODE - No changes will be made');
	}
	if (RESUME_FROM_USER) {
		console.log(`↩️  Resuming from user: ${RESUME_FROM_USER}`);
	}

	try {
		// Step 1: Find all users with calendar tokens
		const { data: usersWithTokens, error: tokenError } = await supabase
			.from('user_calendar_tokens')
			.select('user_id, google_email, created_at, updated_at')
			.not('access_token', 'is', null)
			.not('refresh_token', 'is', null)
			.order('user_id');

		if (tokenError) {
			console.error('❌ Error fetching users with calendar tokens:', tokenError);
			migrationLog.error = tokenError;
			return;
		}

		if (!usersWithTokens || usersWithTokens.length === 0) {
			console.log('ℹ️  No users with calendar tokens found');
			migrationLog.summary.noTokensFound = true;
			return;
		}

		console.log(`✅ Found ${usersWithTokens.length} users with calendar connections`);

		// Step 2: Check which users already have webhooks (including expired ones)
		const { data: existingWebhooks, error: webhookError } = await supabase
			.from('calendar_webhook_channels')
			.select('user_id, channel_id, expiration, created_at, sync_token');

		if (webhookError) {
			console.error('❌ Error fetching existing webhooks:', webhookError);
			migrationLog.error = webhookError;
			return;
		}

		// Categorize webhooks by status
		const now = Date.now();
		const webhooksByUser = new Map();
		const expiredWebhooks = [];
		const validWebhooks = [];
		const staleWebhooks = []; // Webhooks without sync tokens

		existingWebhooks?.forEach((webhook) => {
			webhooksByUser.set(webhook.user_id, webhook);

			const expiration = parseInt(webhook.expiration);
			const daysUntilExpiry = (expiration - now) / (1000 * 60 * 60 * 24);

			if (daysUntilExpiry < 0) {
				expiredWebhooks.push({ ...webhook, daysExpired: Math.abs(daysUntilExpiry) });
			} else if (daysUntilExpiry < 7) {
				validWebhooks.push({ ...webhook, daysUntilExpiry });
			} else {
				validWebhooks.push({ ...webhook, daysUntilExpiry });
			}

			// Check for stale webhooks (no sync token means initial sync might have failed)
			if (!webhook.sync_token) {
				staleWebhooks.push(webhook);
			}
		});

		console.log(`📊 Webhook Status:`);
		console.log(`   - Valid webhooks: ${validWebhooks.length}`);
		console.log(`   - Expired webhooks: ${expiredWebhooks.length}`);
		console.log(`   - Stale webhooks (no sync token): ${staleWebhooks.length}`);

		// Step 3: Filter users who need webhook registration or renewal
		let usersNeedingWebhooks = usersWithTokens.filter((user) => {
			const existingWebhook = webhooksByUser.get(user.user_id);

			// Skip if resuming from a specific user
			if (RESUME_FROM_USER && user.user_id < RESUME_FROM_USER) {
				return false;
			}

			// Need webhook if:
			// 1. No webhook exists
			// 2. Webhook is expired
			// 3. Webhook has no sync token (stale)
			if (!existingWebhook) return true;

			const expiration = parseInt(existingWebhook.expiration);
			const isExpired = expiration < now;
			const isStale = !existingWebhook.sync_token;

			return isExpired || isStale;
		});

		// Edge case: Check for users whose tokens were updated recently but webhook wasn't registered
		const recentlyUpdatedUsers = usersWithTokens.filter((user) => {
			const webhook = webhooksByUser.get(user.user_id);
			if (!webhook) return false;

			const tokenUpdate = new Date(user.updated_at).getTime();
			const webhookCreated = new Date(webhook.created_at).getTime();

			// If tokens were updated after webhook was created, might need re-registration
			return tokenUpdate > webhookCreated + 24 * 60 * 60 * 1000; // 24 hours buffer
		});

		if (recentlyUpdatedUsers.length > 0) {
			console.log(
				`⚠️  Found ${recentlyUpdatedUsers.length} users with tokens updated after webhook creation`
			);
			migrationLog.warnings = migrationLog.warnings || [];
			migrationLog.warnings.push({
				type: 'tokens_updated_after_webhook',
				users: recentlyUpdatedUsers.map((u) => u.user_id)
			});
		}

		if (usersNeedingWebhooks.length === 0) {
			console.log('✅ All users already have valid webhooks registered');
			migrationLog.summary.allUsersHaveWebhooks = true;
			return;
		}

		console.log(`🔧 ${usersNeedingWebhooks.length} users need webhook registration/renewal`);

		// Step 4: Register webhooks for each user
		const webhookService = new CalendarWebhookMigrationService(
			supabase,
			GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET
		);
		const webhookUrl = `${APP_URL}/webhooks/calendar-events`;

		let successCount = 0;
		let failureCount = 0;
		let skippedCount = 0;
		const failedUsers = [];
		const errors = new Map();

		for (const user of usersNeedingWebhooks) {
			const userLog: any = {
				user_id: user.user_id,
				google_email: user.google_email,
				timestamp: new Date().toISOString()
			};

			console.log(
				`\n📤 Processing user ${user.user_id} (${user.google_email || 'no email'})`
			);

			if (DRY_RUN) {
				console.log(`   [DRY RUN] Would register webhook for user ${user.user_id}`);
				userLog.dryRun = true;
				skippedCount++;
				migrationLog.results.push(userLog);
				continue;
			}

			// Check for existing webhook one more time to prevent race conditions
			const { data: currentWebhook } = await supabase
				.from('calendar_webhook_channels')
				.select('id, expiration')
				.eq('user_id', user.user_id)
				.eq('calendar_id', 'primary')
				.single();

			if (currentWebhook) {
				const expiration = parseInt(currentWebhook.expiration);
				if (expiration > Date.now()) {
					console.log(`   ⏭️  Skipping - webhook already exists and is valid`);
					userLog.skipped = true;
					userLog.reason = 'webhook_already_exists';
					skippedCount++;
					migrationLog.results.push(userLog);
					continue;
				}
			}

			// Attempt registration with retry logic
			let attempts = 0;
			const maxAttempts = 3;
			let lastError = null;

			while (attempts < maxAttempts) {
				attempts++;

				try {
					// Add exponential backoff for retries
					if (attempts > 1) {
						const backoffDelay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
						console.log(
							`   ⏳ Retry attempt ${attempts}/${maxAttempts} after ${backoffDelay}ms`
						);
						await new Promise((resolve) => setTimeout(resolve, backoffDelay));
					}

					const result = await webhookService.registerWebhook(
						user.user_id,
						webhookUrl,
						'primary'
					);

					if (result.success) {
						console.log(
							`   ✅ Webhook registered successfully for user ${user.user_id}`
						);
						userLog.success = true;
						userLog.attempts = attempts;
						successCount++;
						migrationLog.results.push(userLog);
						break;
					} else {
						lastError = result.error;

						// Check if error is retryable
						const isRetryable =
							result.error?.includes('rate') ||
							result.error?.includes('timeout') ||
							result.error?.includes('503') ||
							result.error?.includes('429');

						if (!isRetryable || attempts >= maxAttempts) {
							console.error(`   ❌ Failed to register webhook: ${result.error}`);
							userLog.success = false;
							userLog.error = result.error;
							userLog.attempts = attempts;
							failureCount++;
							failedUsers.push(user.user_id);

							// Track error types
							const errorType = result.error?.split(':')[0] || 'unknown';
							errors.set(errorType, (errors.get(errorType) || 0) + 1);

							migrationLog.results.push(userLog);
							break;
						}
					}
				} catch (error: any) {
					lastError = error;

					// Check if error is retryable
					const isRetryable =
						error.message?.includes('rate') ||
						error.message?.includes('timeout') ||
						error.code === 'ECONNRESET' ||
						error.code === 'ETIMEDOUT';

					if (!isRetryable || attempts >= maxAttempts) {
						console.error(`   ❌ Error registering webhook:`, error.message || error);
						userLog.success = false;
						userLog.error = error.message || 'Unknown error';
						userLog.attempts = attempts;
						failureCount++;
						failedUsers.push(user.user_id);

						// Track error types
						const errorType = error.code || error.name || 'unknown';
						errors.set(errorType, (errors.get(errorType) || 0) + 1);

						migrationLog.results.push(userLog);
						break;
					}
				}
			}

			// Rate limiting between users (adaptive based on success/failure)
			const delay = lastError ? 2000 : 1000;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		// Step 5: Enhanced Summary
		console.log('\n========================================');
		console.log('📊 Migration Summary:');
		console.log(`   Total users with calendar tokens: ${usersWithTokens.length}`);
		console.log(
			`   Users already had valid webhooks: ${webhooksByUser.size - usersNeedingWebhooks.length}`
		);
		console.log(`   Users processed: ${successCount + failureCount + skippedCount}`);
		console.log(`   ✅ Webhooks registered successfully: ${successCount}`);
		console.log(`   ⏭️  Skipped (already exists): ${skippedCount}`);
		console.log(`   ❌ Webhook registration failures: ${failureCount}`);

		if (DRY_RUN) {
			console.log(`\n   🔍 DRY RUN - No actual changes were made`);
		}

		// Show error breakdown
		if (errors.size > 0) {
			console.log('\n📉 Error Breakdown:');
			errors.forEach((count, type) => {
				console.log(`   - ${type}: ${count}`);
			});
		}

		// Show failed users for manual intervention
		if (failedUsers.length > 0) {
			console.log('\n⚠️  Failed Users (may need manual intervention):');
			failedUsers.forEach((userId) => {
				console.log(`   - ${userId}`);
			});
			console.log(`\n   💡 To retry failed users, run:`);
			console.log(
				`      pnpm tsx scripts/migrate-calendar-webhooks.ts --resume-from=${failedUsers[0]}`
			);
		}

		// Show warnings about expiring webhooks
		if (expiredWebhooks.length > 0) {
			console.log(
				`\n⚠️  ${expiredWebhooks.length} expired webhooks were found and processed`
			);
		}

		if (staleWebhooks.length > 0) {
			console.log(`\n⚠️  ${staleWebhooks.length} stale webhooks (no sync token) were found`);
		}

		const expiringWebhooks = validWebhooks.filter((w) => w.daysUntilExpiry < 7);
		if (expiringWebhooks.length > 0) {
			console.log(`\n⏰ ${expiringWebhooks.length} webhooks expiring within 7 days`);
			console.log('   Consider running the webhook renewal cron job');
		}

		console.log('========================================');

		// Prepare final log
		migrationLog.endTime = new Date().toISOString();
		migrationLog.summary = {
			totalUsersWithTokens: usersWithTokens.length,
			usersAlreadyHadWebhooks: webhooksByUser.size - usersNeedingWebhooks.length,
			usersProcessed: successCount + failureCount + skippedCount,
			successCount,
			failureCount,
			skippedCount,
			expiredWebhooks: expiredWebhooks.length,
			staleWebhooks: staleWebhooks.length,
			expiringWebhooks: expiringWebhooks.length,
			failedUsers,
			errorTypes: Object.fromEntries(errors)
		};
	} catch (error: any) {
		console.error('❌ Migration failed:', error);
		migrationLog.fatalError = error.message || error;
		migrationLog.endTime = new Date().toISOString();
	} finally {
		// Save migration log
		try {
			fs.writeFileSync(logFilePath, JSON.stringify(migrationLog, null, 2));
			console.log(`\n📝 Migration log saved to: ${logFilePath}`);
		} catch (logError) {
			console.error('Failed to save migration log:', logError);
		}
	}
}

// Run the migration
migrateCalendarWebhooks()
	.then(() => {
		console.log('\n✅ Migration completed successfully');
		process.exit(0);
	})
	.catch((error) => {
		console.error('❌ Migration error:', error);
		process.exit(1);
	});
