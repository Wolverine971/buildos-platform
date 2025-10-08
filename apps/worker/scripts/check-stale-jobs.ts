// Temporary script to check for stale queue jobs
import { supabase } from "../src/lib/supabase";

async function checkStaleJobs() {
  console.log(
    "🔍 Checking for stale queue jobs (scheduled >24 hours ago)...\n",
  );

  // Query for stale jobs
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: staleJobs, error } = await supabase
    .from("queue_jobs")
    .select(
      "id, queue_job_id, job_type, status, scheduled_for, created_at, attempts, error_message",
    )
    .in("status", ["pending", "processing", "retrying"])
    .lt("scheduled_for", twentyFourHoursAgo)
    .order("scheduled_for", { ascending: true });

  if (error) {
    console.error("❌ Error querying database:", error);
    return;
  }

  console.log(`Found ${staleJobs?.length || 0} stale jobs (>24h old)\n`);

  if (staleJobs && staleJobs.length > 0) {
    // Group by job_type and status
    const groupedJobs: Record<string, Record<string, number>> = {};

    staleJobs.forEach((job: any) => {
      if (!groupedJobs[job.job_type]) {
        groupedJobs[job.job_type] = {};
      }
      if (!groupedJobs[job.job_type][job.status]) {
        groupedJobs[job.job_type][job.status] = 0;
      }
      groupedJobs[job.job_type][job.status]++;
    });

    console.log("📊 Stale jobs by type and status:");
    Object.entries(groupedJobs).forEach(([jobType, statuses]) => {
      console.log(`\n  ${jobType}:`);
      Object.entries(statuses).forEach(([status, count]) => {
        console.log(`    ${status}: ${count}`);
      });
    });

    // Show oldest jobs
    console.log("\n📅 Oldest 10 stale jobs:");
    staleJobs.slice(0, 10).forEach((job: any) => {
      const age = Math.floor(
        (Date.now() - new Date(job.scheduled_for).getTime()) / (1000 * 60 * 60),
      );
      console.log(
        `  - ${job.job_type} [${job.status}] - ${age}h old (scheduled: ${job.scheduled_for})`,
      );
    });
  }

  // Check all pending/processing jobs (regardless of age)
  console.log("\n🔄 All active jobs (pending/processing/retrying):");
  const { data: activeJobs } = await supabase
    .from("queue_jobs")
    .select(
      "id, queue_job_id, job_type, status, scheduled_for, created_at, attempts",
    )
    .in("status", ["pending", "processing", "retrying"])
    .in("job_type", ["generate_daily_brief", "generate_brief_email"])
    .order("scheduled_for", { ascending: true });

  if (activeJobs && activeJobs.length > 0) {
    activeJobs.forEach((job: any) => {
      const scheduledAge = Math.floor(
        (Date.now() - new Date(job.scheduled_for).getTime()) / (1000 * 60 * 60),
      );
      const createdAge = Math.floor(
        (Date.now() - new Date(job.created_at).getTime()) / (1000 * 60 * 60),
      );
      console.log(`  - ${job.job_type} [${job.status}]`);
      console.log(
        `    Scheduled for: ${job.scheduled_for} (${scheduledAge}h ago)`,
      );
      console.log(`    Created at: ${job.created_at} (${createdAge}h ago)`);
      console.log(`    Attempts: ${job.attempts || 0}`);
    });
  } else {
    console.log("  No active jobs");
  }

  // Also check current queue stats
  console.log("\n📊 Current queue stats (all brief jobs):");
  const { data: allStats } = await supabase
    .from("queue_jobs")
    .select("job_type, status")
    .in("job_type", ["generate_daily_brief", "generate_brief_email"]);

  if (allStats) {
    const statsMap: Record<string, Record<string, number>> = {};
    allStats.forEach((job: any) => {
      if (!statsMap[job.job_type]) {
        statsMap[job.job_type] = {};
      }
      if (!statsMap[job.job_type][job.status]) {
        statsMap[job.job_type][job.status] = 0;
      }
      statsMap[job.job_type][job.status]++;
    });

    Object.entries(statsMap).forEach(([jobType, statuses]) => {
      console.log(`\n  ${jobType}:`);
      Object.entries(statuses).forEach(([status, count]) => {
        console.log(`    ${status}: ${count}`);
      });
    });
  }

  // Check for old failed jobs that might retry
  console.log("\n⚠️  Old failed jobs (>7 days) that might be concerning:");
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: oldFailedJobs } = await supabase
    .from("queue_jobs")
    .select(
      "id, job_type, status, scheduled_for, attempts, max_attempts, error_message",
    )
    .eq("status", "failed")
    .in("job_type", ["generate_daily_brief", "generate_brief_email"])
    .lt("scheduled_for", sevenDaysAgo)
    .order("scheduled_for", { ascending: true })
    .limit(10);

  if (oldFailedJobs && oldFailedJobs.length > 0) {
    console.log(`  Found ${oldFailedJobs.length} old failed jobs:`);
    oldFailedJobs.forEach((job: any) => {
      const age = Math.floor(
        (Date.now() - new Date(job.scheduled_for).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      console.log(
        `    - ${job.job_type}: ${age} days old, attempts: ${job.attempts}/${job.max_attempts}`,
      );
    });
  } else {
    console.log("  No old failed jobs found");
  }

  process.exit(0);
}

checkStaleJobs().catch(console.error);
