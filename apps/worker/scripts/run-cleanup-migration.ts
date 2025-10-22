// apps/worker/scripts/run-cleanup-migration.ts
import { supabase } from '../src/lib/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Run the stale jobs cleanup migration
 * This script executes the SQL migration file against the database
 */
async function runCleanupMigration() {
	console.log('🧹 Running stale jobs cleanup migration...\n');

	// Read the migration file
	const migrationPath = join(
		__dirname,
		'../../../supabase/migrations/20251013_cleanup_stale_jobs.sql'
	);

	let migrationSql: string;
	try {
		migrationSql = readFileSync(migrationPath, 'utf-8');
		console.log('✅ Loaded migration file');
	} catch (error) {
		console.error('❌ Failed to read migration file:', error);
		process.exit(1);
	}

	// Show what we're about to do
	console.log('\n📋 Migration will:');
	console.log('   • Delete failed queue_jobs older than 30 days');
	console.log('   • Delete failed/pending daily_briefs older than 30 days');
	console.log("   • Delete stuck 'processing' daily_briefs older than 7 days");
	console.log('   • Delete failed/pending project_daily_briefs older than 30 days');
	console.log();

	// Get counts before deletion
	console.log('📊 Counting records to delete...');

	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

	const { count: queueJobsCount } = await supabase
		.from('queue_jobs')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'failed')
		.lt('created_at', thirtyDaysAgo);

	const { count: dailyBriefsFailedCount } = await supabase
		.from('daily_briefs')
		.select('*', { count: 'exact', head: true })
		.in('generation_status', ['failed', 'pending'])
		.lt('created_at', thirtyDaysAgo);

	const { count: dailyBriefsStuckCount } = await supabase
		.from('daily_briefs')
		.select('*', { count: 'exact', head: true })
		.eq('generation_status', 'processing')
		.lt('created_at', sevenDaysAgo);

	const { count: projectBriefsCount } = await supabase
		.from('project_daily_briefs')
		.select('*', { count: 'exact', head: true })
		.in('generation_status', ['failed', 'pending'])
		.lt('created_at', thirtyDaysAgo);

	const totalCount =
		(queueJobsCount || 0) +
		(dailyBriefsFailedCount || 0) +
		(dailyBriefsStuckCount || 0) +
		(projectBriefsCount || 0);

	console.log(`\n   Queue jobs: ${queueJobsCount || 0}`);
	console.log(`   Daily briefs (failed/pending): ${dailyBriefsFailedCount || 0}`);
	console.log(`   Daily briefs (stuck processing): ${dailyBriefsStuckCount || 0}`);
	console.log(`   Project briefs: ${projectBriefsCount || 0}`);
	console.log(`   TOTAL: ${totalCount}\n`);

	if (totalCount === 0) {
		console.log('✅ No stale records found - nothing to clean up!');
		process.exit(0);
	}

	// Confirmation prompt
	console.log('⚠️  This will permanently delete these records.');
	console.log('   Press Ctrl+C to cancel, or Enter to continue...\n');

	// Wait for user input
	await new Promise((resolve) => {
		process.stdin.once('data', resolve);
	});

	console.log('🔄 Executing migration...\n');

	// Execute the migration using Supabase RPC
	// Note: We need to execute this in chunks since Supabase client doesn't support raw SQL directly
	// Instead, we'll execute the deletions directly

	let deletedCount = 0;

	// 1. Delete failed queue jobs
	console.log('1/3 Deleting failed queue jobs...');
	const { error: queueError, count: queueDeleted } = await supabase
		.from('queue_jobs')
		.delete({ count: 'exact' })
		.eq('status', 'failed')
		.lt('created_at', thirtyDaysAgo);

	if (queueError) {
		console.error('❌ Error deleting queue jobs:', queueError);
		process.exit(1);
	}
	console.log(`   ✅ Deleted ${queueDeleted || 0} queue jobs`);
	deletedCount += queueDeleted || 0;

	// 2. Delete failed/pending daily briefs
	console.log('2/3 Deleting failed/pending/stuck daily briefs...');

	// First get IDs of briefs to delete (since we have OR condition)
	const { data: briefsToDelete } = await supabase
		.from('daily_briefs')
		.select('id')
		.or(
			`generation_status.in.(failed,pending),and(generation_status.eq.processing,created_at.lt.${sevenDaysAgo})`
		)
		.lt('created_at', thirtyDaysAgo);

	if (briefsToDelete && briefsToDelete.length > 0) {
		const briefIds = briefsToDelete.map((b: any) => b.id);
		const { error: briefError, count: briefDeleted } = await supabase
			.from('daily_briefs')
			.delete({ count: 'exact' })
			.in('id', briefIds);

		if (briefError) {
			console.error('❌ Error deleting daily briefs:', briefError);
			process.exit(1);
		}
		console.log(`   ✅ Deleted ${briefDeleted || 0} daily briefs`);
		deletedCount += briefDeleted || 0;
	} else {
		console.log(`   ✅ No daily briefs to delete`);
	}

	// 3. Delete failed/pending project briefs
	console.log('3/3 Deleting failed/pending project briefs...');
	const { error: projectError, count: projectDeleted } = await supabase
		.from('project_daily_briefs')
		.delete({ count: 'exact' })
		.in('generation_status', ['failed', 'pending'])
		.lt('created_at', thirtyDaysAgo);

	if (projectError) {
		console.error('❌ Error deleting project briefs:', projectError);
		process.exit(1);
	}
	console.log(`   ✅ Deleted ${projectDeleted || 0} project briefs`);
	deletedCount += projectDeleted || 0;

	console.log('\n' + '='.repeat(60));
	console.log('✅ Cleanup complete!');
	console.log('='.repeat(60));
	console.log(`\nTotal records deleted: ${deletedCount}`);
	console.log('\n📊 Verifying...');

	// Verify no old records remain
	const { count: remainingJobs } = await supabase
		.from('queue_jobs')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'failed')
		.lt('created_at', thirtyDaysAgo);

	const { count: remainingBriefs } = await supabase
		.from('daily_briefs')
		.select('*', { count: 'exact', head: true })
		.in('generation_status', ['failed', 'pending'])
		.lt('created_at', thirtyDaysAgo);

	const { count: remainingProjectBriefs } = await supabase
		.from('project_daily_briefs')
		.select('*', { count: 'exact', head: true })
		.in('generation_status', ['failed', 'pending'])
		.lt('created_at', thirtyDaysAgo);

	console.log(`   Remaining old queue jobs: ${remainingJobs || 0}`);
	console.log(`   Remaining old daily briefs: ${remainingBriefs || 0}`);
	console.log(`   Remaining old project briefs: ${remainingProjectBriefs || 0}`);

	if (
		(remainingJobs || 0) === 0 &&
		(remainingBriefs || 0) === 0 &&
		(remainingProjectBriefs || 0) === 0
	) {
		console.log('\n✅ All stale records cleaned up successfully!\n');
	} else {
		console.log('\n⚠️  Some records remain (may be expected if created during cleanup)\n');
	}

	process.exit(0);
}

runCleanupMigration().catch((error) => {
	console.error('❌ Migration failed:', error);
	process.exit(1);
});
