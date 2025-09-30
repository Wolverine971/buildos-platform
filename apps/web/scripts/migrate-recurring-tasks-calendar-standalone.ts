// apps/web/scripts/migrate-recurring-tasks-calendar-standalone.ts
/**
 * Standalone migration script to update Google Calendar events for recurring tasks
 * that now inherit their end date from the project
 *
 * Run with: npx tsx scripts/migrate-recurring-tasks-calendar-standalone.ts
 *
 * Required environment variables:
 * - PUBLIC_SUPABASE_URL
 * - PRIVATE_SUPABASE_SERVICE_KEY
 * - PUBLIC_GOOGLE_CLIENT_ID
 * - PRIVATE_GOOGLE_CLIENT_SECRET
 */

import { createCustomClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
	'PUBLIC_SUPABASE_URL',
	'PRIVATE_SUPABASE_SERVICE_KEY',
	'PUBLIC_GOOGLE_CLIENT_ID',
	'PRIVATE_GOOGLE_CLIENT_SECRET'
];

for (const envVar of requiredEnvVars) {
	if (!process.env[envVar]) {
		console.error(`❌ Missing required environment variable: ${envVar}`);
		console.error('\nPlease set these in your .env file:');
		requiredEnvVars.forEach((v) => console.error(`  ${v}=your_value`));
		process.exit(1);
	}
}

// Initialize Supabase client with service role key for admin operations
const supabase = createCustomClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.PRIVATE_SUPABASE_SERVICE_KEY!
);

interface MigrationTask {
	id: string;
	user_id: string;
	title: string;
	recurrence_pattern: string;
	recurrence_ends: string;
	calendar_event_id?: string;
}

interface MigrationStats {
	total: number;
	completed: number;
	failed: number;
	skipped: number;
	pending: number;
}

class RecurringTaskCalendarMigration {
	private batchSize = 10;
	private delayMs = 1000;
	private maxRetries = 3;
	private stats: MigrationStats = {
		total: 0,
		completed: 0,
		failed: 0,
		skipped: 0,
		pending: 0
	};

	async run() {
		console.log('🚀 Starting recurring task calendar migration...');
		console.log('============================================\n');

		try {
			// Get all pending migrations
			const tasks = await this.getPendingMigrations();
			this.stats.total = tasks.length;

			if (tasks.length === 0) {
				console.log('✅ No tasks to migrate. All done!');
				return;
			}

			console.log(`📋 Found ${tasks.length} tasks to migrate\n`);

			// Process in batches to respect API rate limits
			const totalBatches = Math.ceil(tasks.length / this.batchSize);

			for (let i = 0; i < tasks.length; i += this.batchSize) {
				const batchNumber = Math.floor(i / this.batchSize) + 1;
				const batch = tasks.slice(i, i + this.batchSize);

				console.log(
					`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} tasks)`
				);
				console.log('─'.repeat(50));

				await this.processBatch(batch);

				// Show progress
				this.showProgress();

				// Rate limiting between batches
				if (i + this.batchSize < tasks.length) {
					console.log(`\n⏳ Waiting ${this.delayMs}ms before next batch...`);
					await this.delay(this.delayMs);
				}
			}

			// Generate final report
			console.log('\n' + '='.repeat(50));
			await this.generateReport();
			console.log('='.repeat(50));

			console.log('\n✨ Migration completed successfully!');
		} catch (error) {
			console.error('\n❌ Migration failed:', error);
			throw error;
		}
	}

	private async getPendingMigrations(): Promise<MigrationTask[]> {
		const { data, error } = await supabase
			.from('recurring_task_migration_log')
			.select(
				`
                task_id,
                new_recurrence_ends,
                tasks!inner(
                    id,
                    user_id,
                    title,
                    recurrence_pattern,
                    task_calendar_events(
                        calendar_event_id
                    )
                )
            `
			)
			.eq('status', 'pending')
			.eq('migration_type', 'project_end_sync');

		if (error) {
			console.error('Error fetching pending migrations:', error);
			throw error;
		}

		// Transform the data to our expected format
		return (data || []).map((item: any) => {
			// Handle task_calendar_events nested within tasks
			let calendarEventId: string | undefined;
			if (item.tasks?.task_calendar_events) {
				if (Array.isArray(item.tasks.task_calendar_events)) {
					calendarEventId = item.tasks.task_calendar_events[0]?.calendar_event_id;
				} else {
					calendarEventId = item.tasks.task_calendar_events.calendar_event_id;
				}
			}

			return {
				id: item.tasks.id,
				user_id: item.tasks.user_id,
				title: item.tasks.title,
				recurrence_pattern: item.tasks.recurrence_pattern,
				recurrence_ends: item.new_recurrence_ends,
				calendar_event_id: calendarEventId
			};
		});
	}

	private async getAuthenticatedClient(userId: string): Promise<OAuth2Client | null> {
		// Get user's calendar tokens from database
		const { data: tokens, error } = await supabase
			.from('user_calendar_tokens')
			.select('access_token, refresh_token, expiry_date')
			.eq('user_id', userId)
			.single();

		if (error || !tokens) {
			return null;
		}

		// Create OAuth2 client
		const oauth2Client = new OAuth2Client(
			process.env.PUBLIC_GOOGLE_CLIENT_ID,
			process.env.PRIVATE_GOOGLE_CLIENT_SECRET,
			'postmessage' // or your redirect URI
		);

		// Set credentials
		oauth2Client.setCredentials({
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : undefined
		});

		// Auto-refresh if needed
		try {
			const { credentials } = await oauth2Client.getAccessToken();
			if (credentials?.access_token && credentials.access_token !== tokens.access_token) {
				// Token was refreshed, update in database
				await supabase
					.from('user_calendar_tokens')
					.update({
						access_token: credentials.access_token,
						expiry_date: credentials.expiry_date
							? new Date(credentials.expiry_date).toISOString()
							: null
					})
					.eq('user_id', userId);
			}
		} catch (error) {
			console.error(`Failed to refresh token for user ${userId}:`, error);
			return null;
		}

		return oauth2Client;
	}

	private async processBatch(batch: MigrationTask[]) {
		const results = await Promise.allSettled(
			batch.map((task) => this.migrateTaskWithRetry(task))
		);

		// Log results
		results.forEach((result, index) => {
			const task = batch[index];
			if (result.status === 'fulfilled') {
				console.log(`  ✅ ${task.title} (${task.id.slice(0, 8)}...)`);
			} else {
				console.log(`  ❌ ${task.title} (${task.id.slice(0, 8)}...): ${result.reason}`);
			}
		});
	}

	private async migrateTaskWithRetry(task: MigrationTask): Promise<void> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
			try {
				await this.migrateTask(task);
				return;
			} catch (error) {
				lastError = error as Error;

				if (attempt < this.maxRetries) {
					await this.delay(this.delayMs * attempt);
				}
			}
		}

		throw lastError;
	}

	private async migrateTask(task: MigrationTask): Promise<void> {
		try {
			// Skip if no calendar event exists
			if (!task.calendar_event_id) {
				await this.updateMigrationLog(task.id, 'skipped', 'No calendar event');
				this.stats.skipped++;
				return;
			}

			// Get authenticated Google Calendar client
			const auth = await this.getAuthenticatedClient(task.user_id);
			if (!auth) {
				await this.updateMigrationLog(task.id, 'skipped', 'No calendar connection');
				this.stats.skipped++;
				return;
			}

			// Create calendar API client
			const calendar = google.calendar({ version: 'v3', auth });

			try {
				// Get existing event to preserve other properties
				const existingEvent = await calendar.events.get({
					calendarId: 'primary',
					eventId: task.calendar_event_id
				});

				// Build new RRULE with end date
				const rrule = this.buildRRule(task.recurrence_pattern, task.recurrence_ends);

				// Skip if RRULE generation failed (e.g., past date)
				if (!rrule) {
					await this.updateMigrationLog(
						task.id,
						'skipped',
						'Invalid end date for recurrence'
					);
					this.stats.skipped++;
					return;
				}

				// Update the event with new recurrence rule
				await calendar.events.patch({
					calendarId: 'primary',
					eventId: task.calendar_event_id,
					requestBody: {
						recurrence: [rrule]
					}
				});

				// Update migration log
				await this.updateMigrationLog(task.id, 'completed');
				this.stats.completed++;
			} catch (calendarError: any) {
				// Handle specific Google Calendar errors
				if (calendarError.code === 404) {
					await this.updateMigrationLog(
						task.id,
						'skipped',
						'Event not found in calendar'
					);
					this.stats.skipped++;
				} else if (calendarError.code === 403) {
					// Quota exceeded or permission denied
					const errorMsg = `Google Calendar API error (403): ${calendarError.message || 'Permission denied or quota exceeded'}`;
					console.error(`Task ${task.id}:`, errorMsg);
					throw new Error(errorMsg);
				} else if (calendarError.code === 429) {
					// Rate limit exceeded
					const errorMsg = `Google Calendar API rate limit exceeded (429)`;
					console.error(`Task ${task.id}:`, errorMsg);
					throw new Error(errorMsg);
				} else if (calendarError.code === 401) {
					// Authentication expired
					const errorMsg = `Google Calendar authentication expired (401)`;
					console.error(`Task ${task.id}:`, errorMsg);
					await this.updateMigrationLog(task.id, 'failed', errorMsg);
					this.stats.failed++;
					return; // Don't throw, continue with other tasks
				} else {
					// Other errors
					const errorMsg = `Google Calendar API error (${calendarError.code}): ${calendarError.message || 'Unknown error'}`;
					console.error(`Task ${task.id}:`, errorMsg);
					throw new Error(errorMsg);
				}
			}
		} catch (error) {
			// Log error and update migration status
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`Failed to migrate task ${task.id} (${task.title}):`, errorMessage);
			await this.updateMigrationLog(task.id, 'failed', errorMessage);
			this.stats.failed++;
			throw error;
		}
	}

	private buildRRule(pattern: string, endDate: string): string {
		const endDateObj = new Date(endDate);

		// Validate that end date is in the future
		if (endDateObj <= new Date()) {
			console.warn(`End date ${endDate} is in the past, skipping RRULE generation`);
			return ''; // Return empty to skip update
		}

		// Format date for RRULE UNTIL parameter (YYYYMMDDTHHMMSSZ)
		// Example: 2025-01-31T23:59:59.999Z -> 20250131T235959Z
		const until = endDateObj
			.toISOString()
			.replace(/-/g, '') // Remove hyphens: 20250131T23:59:59.999Z
			.replace(/:/g, '') // Remove colons: 20250131T235959.999Z
			.replace(/\.\d{3}/, ''); // Remove milliseconds: 20250131T235959Z

		const patterns: Record<string, string> = {
			daily: `RRULE:FREQ=DAILY;UNTIL=${until}`,
			weekdays: `RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;UNTIL=${until}`,
			weekly: `RRULE:FREQ=WEEKLY;UNTIL=${until}`,
			biweekly: `RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=${until}`,
			monthly: `RRULE:FREQ=MONTHLY;UNTIL=${until}`,
			quarterly: `RRULE:FREQ=MONTHLY;INTERVAL=3;UNTIL=${until}`,
			yearly: `RRULE:FREQ=YEARLY;UNTIL=${until}`
		};

		return patterns[pattern] || patterns['weekly'];
	}

	private async updateMigrationLog(
		taskId: string,
		status: string,
		errorMessage?: string
	): Promise<void> {
		const { error } = await supabase
			.from('recurring_task_migration_log')
			.update({
				status,
				error_message: errorMessage,
				updated_at: new Date().toISOString()
			})
			.eq('task_id', taskId)
			.eq('migration_type', 'project_end_sync');

		if (error) {
			console.error(`Failed to update migration log for task ${taskId}:`, error);
		}
	}

	private showProgress() {
		const processed = this.stats.completed + this.stats.failed + this.stats.skipped;
		const percentage = Math.round((processed / this.stats.total) * 100);
		const progressBar = this.createProgressBar(percentage);

		console.log(`\n${progressBar} ${percentage}%`);
		console.log(
			`✅ Completed: ${this.stats.completed} | ⏭️ Skipped: ${this.stats.skipped} | ❌ Failed: ${this.stats.failed}`
		);
	}

	private createProgressBar(percentage: number): string {
		const filled = Math.floor(percentage / 2);
		const empty = 50 - filled;
		return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
	}

	private async generateReport(): Promise<void> {
		// Get final stats from database
		const { data } = await supabase
			.from('recurring_task_migration_log')
			.select('status')
			.eq('migration_type', 'project_end_sync');

		const summary = {
			total: data?.length || 0,
			completed: data?.filter((d) => d.status === 'completed').length || 0,
			failed: data?.filter((d) => d.status === 'failed').length || 0,
			skipped: data?.filter((d) => d.status === 'skipped').length || 0,
			pending: data?.filter((d) => d.status === 'pending').length || 0
		};

		console.log('\n📊 MIGRATION REPORT');
		console.log('─'.repeat(50));
		console.log(`📝 Total tasks:      ${summary.total}`);
		console.log(`✅ Completed:        ${summary.completed}`);
		console.log(`⏭️  Skipped:          ${summary.skipped}`);
		console.log(`❌ Failed:           ${summary.failed}`);
		console.log(`⏳ Still pending:    ${summary.pending}`);

		// Calculate success rate
		const processedTotal = summary.completed + summary.skipped + summary.failed;
		if (processedTotal > 0) {
			const successRate = Math.round(
				((summary.completed + summary.skipped) / processedTotal) * 100
			);
			console.log(`\n📈 Success rate:     ${successRate}%`);
		}

		// Show failed tasks for manual review if any
		if (summary.failed > 0) {
			console.log('\n⚠️ Failed tasks require manual review:');
			const { data: failedTasks } = await supabase
				.from('recurring_task_migration_log')
				.select('task_id, error_message')
				.eq('status', 'failed')
				.eq('migration_type', 'project_end_sync')
				.limit(5);

			failedTasks?.forEach((task) => {
				console.log(`  - ${task.task_id.slice(0, 8)}...: ${task.error_message}`);
			});

			if (summary.failed > 5) {
				console.log(`  ... and ${summary.failed - 5} more`);
			}
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// Run migration if called directly
// Check if this file is being run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
	const migration = new RecurringTaskCalendarMigration();

	migration
		.run()
		.then(() => {
			console.log('\n👋 Goodbye!');
			process.exit(0);
		})
		.catch((error) => {
			console.error('\n💥 Migration failed with error:', error);
			process.exit(1);
		});
}
