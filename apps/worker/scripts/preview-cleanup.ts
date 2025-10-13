// apps/worker/scripts/preview-cleanup.ts
import { supabase } from "../src/lib/supabase";

/**
 * Preview what would be deleted in the cleanup migration
 * This is a dry-run to verify we're not deleting anything important
 */
async function previewCleanup() {
  console.log("🔍 CLEANUP PREVIEW - What will be deleted:\n");
  console.log("Criteria:");
  console.log("  • Failed queue jobs older than 30 days");
  console.log("  • Failed/pending daily briefs older than 30 days");
  console.log("  • Stuck 'processing' daily briefs older than 7 days");
  console.log("  • Failed/pending project briefs older than 30 days\n");
  console.log("=".repeat(70) + "\n");

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // ===== 1. QUEUE JOBS =====
  console.log("1️⃣  QUEUE JOBS (failed >30d):");
  const { data: oldFailedJobs, error: jobError } = await supabase
    .from("queue_jobs")
    .select(
      "id, queue_job_id, job_type, status, created_at, scheduled_for, attempts, error_message",
    )
    .eq("status", "failed")
    .lt("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  if (jobError) {
    console.error("   ❌ Error:", jobError);
  } else if (oldFailedJobs && oldFailedJobs.length > 0) {
    console.log(`   Found ${oldFailedJobs.length} jobs to delete:\n`);

    // Group by job type
    const byType: Record<string, any[]> = {};
    oldFailedJobs.forEach((job: any) => {
      if (!byType[job.job_type]) byType[job.job_type] = [];
      byType[job.job_type].push(job);
    });

    Object.entries(byType).forEach(([type, jobs]) => {
      console.log(`   ${type} (${jobs.length} jobs):`);
      jobs.slice(0, 3).forEach((job: any) => {
        const age = Math.floor(
          (Date.now() - new Date(job.created_at).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        console.log(
          `     - ${job.queue_job_id} (${age}d old, attempts: ${job.attempts})`,
        );
        if (job.error_message) {
          const errorPreview = job.error_message.substring(0, 80);
          console.log(
            `       Error: ${errorPreview}${job.error_message.length > 80 ? "..." : ""}`,
          );
        }
      });
      if (jobs.length > 3) {
        console.log(`     ... and ${jobs.length - 3} more`);
      }
    });
    console.log();
  } else {
    console.log("   ✅ No failed jobs >30d found\n");
  }

  // ===== 2. DAILY BRIEFS =====
  console.log("2️⃣  DAILY BRIEFS (failed/pending >30d, processing >7d):");

  // Failed or pending >30d
  const { data: oldFailedBriefs, error: briefError } = await supabase
    .from("daily_briefs")
    .select(
      "id, user_id, brief_date, generation_status, created_at, generation_error",
    )
    .in("generation_status", ["failed", "pending"])
    .lt("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  // Stuck processing >7d
  const { data: stuckBriefs, error: stuckError } = await supabase
    .from("daily_briefs")
    .select(
      "id, user_id, brief_date, generation_status, created_at, generation_started_at",
    )
    .eq("generation_status", "processing")
    .lt("created_at", sevenDaysAgo)
    .order("created_at", { ascending: true });

  const allBriefsToDelete = [
    ...(oldFailedBriefs || []),
    ...(stuckBriefs || []),
  ];

  if (briefError || stuckError) {
    console.error("   ❌ Error:", briefError || stuckError);
  } else if (allBriefsToDelete.length > 0) {
    console.log(`   Found ${allBriefsToDelete.length} briefs to delete:\n`);

    allBriefsToDelete.slice(0, 10).forEach((brief: any) => {
      const age = Math.floor(
        (Date.now() - new Date(brief.created_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      console.log(
        `     - Brief ${brief.id.substring(0, 8)}... (${brief.brief_date})`,
      );
      console.log(`       Status: ${brief.generation_status}, Age: ${age}d`);
      if (brief.generation_error) {
        const errorPreview = brief.generation_error.substring(0, 60);
        console.log(
          `       Error: ${errorPreview}${brief.generation_error.length > 60 ? "..." : ""}`,
        );
      }
    });
    if (allBriefsToDelete.length > 10) {
      console.log(`     ... and ${allBriefsToDelete.length - 10} more`);
    }
    console.log();
  } else {
    console.log("   ✅ No old failed/pending/stuck briefs found\n");
  }

  // ===== 3. PROJECT DAILY BRIEFS =====
  console.log("3️⃣  PROJECT DAILY BRIEFS (failed/pending >30d):");
  const { data: oldProjectBriefs, error: projectBriefError } = await supabase
    .from("project_daily_briefs")
    .select(
      "id, project_id, brief_date, generation_status, created_at, generation_error",
    )
    .in("generation_status", ["failed", "pending"])
    .lt("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  if (projectBriefError) {
    console.error("   ❌ Error:", projectBriefError);
  } else if (oldProjectBriefs && oldProjectBriefs.length > 0) {
    console.log(
      `   Found ${oldProjectBriefs.length} project briefs to delete:\n`,
    );

    oldProjectBriefs.forEach((brief: any) => {
      const age = Math.floor(
        (Date.now() - new Date(brief.created_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      console.log(
        `     - Project brief ${brief.id.substring(0, 8)}... (${brief.brief_date})`,
      );
      console.log(`       Status: ${brief.generation_status}, Age: ${age}d`);
      if (brief.generation_error) {
        const errorPreview = brief.generation_error.substring(0, 60);
        console.log(
          `       Error: ${errorPreview}${brief.generation_error.length > 60 ? "..." : ""}`,
        );
      }
    });
    console.log();
  } else {
    console.log("   ✅ No old failed/pending project briefs found\n");
  }

  // ===== SUMMARY =====
  console.log("=".repeat(70));
  console.log("📊 DELETION SUMMARY:");
  console.log("=".repeat(70));
  const totalToDelete =
    (oldFailedJobs?.length || 0) +
    allBriefsToDelete.length +
    (oldProjectBriefs?.length || 0);

  console.log(`\nTotal records to delete: ${totalToDelete}`);
  console.log(`  • Queue jobs: ${oldFailedJobs?.length || 0}`);
  console.log(`  • Daily briefs: ${allBriefsToDelete.length}`);
  console.log(`  • Project briefs: ${oldProjectBriefs?.length || 0}`);
  console.log("\n⚠️  SAFETY CHECKS:");
  console.log("  ✅ Only deleting failed/pending/stuck records");
  console.log(
    "  ✅ Only deleting records >30 days old (>7d for stuck 'processing')",
  );
  console.log("  ✅ Keeping all completed/successful records");
  console.log("  ✅ Not touching cron_logs (useful for debugging)");
  console.log("  ✅ Not touching active SMS messages\n");

  process.exit(0);
}

previewCleanup().catch(console.error);
