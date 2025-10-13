// apps/worker/scripts/analyze-stale-data.ts
import { supabase } from "../src/lib/supabase";

async function analyzeStaleData() {
  console.log(
    "🔍 Analyzing stale and failed data across all job-related tables\n",
  );

  const results: any = {
    queue_jobs: {},
    daily_briefs: {},
    project_daily_briefs: {},
    scheduled_sms_messages: {},
    sms_messages: {},
    cron_logs: {},
  };

  // ===== 1. QUEUE JOBS =====
  console.log("📊 Queue Jobs:");
  const { data: queueStats } = await supabase
    .from("queue_jobs")
    .select("status, job_type");

  if (queueStats) {
    const statusMap: Record<string, Record<string, number>> = {};
    queueStats.forEach((job: any) => {
      if (!statusMap[job.status]) statusMap[job.status] = {};
      if (!statusMap[job.status][job.job_type])
        statusMap[job.status][job.job_type] = 0;
      statusMap[job.status][job.job_type]++;
    });
    results.queue_jobs = statusMap;

    Object.entries(statusMap).forEach(([status, types]) => {
      const total = Object.values(types).reduce((sum, count) => sum + count, 0);
      console.log(`  ${status} (${total} total):`);
      Object.entries(types).forEach(([type, count]) => {
        console.log(`    - ${type}: ${count}`);
      });
    });
  }

  // Old failed jobs (>30 days)
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count: oldFailedCount } = await supabase
    .from("queue_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .lt("created_at", thirtyDaysAgo);

  console.log(`\n  OLD FAILED (>30d): ${oldFailedCount || 0} jobs\n`);

  // ===== 2. DAILY BRIEFS =====
  console.log("📅 Daily Briefs:");
  const { data: briefStats } = await supabase
    .from("daily_briefs")
    .select("generation_status");

  if (briefStats) {
    const statusCounts: Record<string, number> = {};
    briefStats.forEach((brief: any) => {
      statusCounts[brief.generation_status] =
        (statusCounts[brief.generation_status] || 0) + 1;
    });
    results.daily_briefs = statusCounts;

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  // Old failed/pending briefs (>30 days)
  const { count: oldBriefCount } = await supabase
    .from("daily_briefs")
    .select("*", { count: "exact", head: true })
    .in("generation_status", ["pending", "failed"])
    .lt("created_at", thirtyDaysAgo);

  console.log(`\n  OLD FAILED/PENDING (>30d): ${oldBriefCount || 0} briefs\n`);

  // ===== 3. PROJECT DAILY BRIEFS =====
  console.log("📋 Project Daily Briefs:");
  const { data: projectBriefStats } = await supabase
    .from("project_daily_briefs")
    .select("generation_status");

  if (projectBriefStats) {
    const statusCounts: Record<string, number> = {};
    projectBriefStats.forEach((brief: any) => {
      statusCounts[brief.generation_status] =
        (statusCounts[brief.generation_status] || 0) + 1;
    });
    results.project_daily_briefs = statusCounts;

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  // Old failed project briefs
  const { count: oldProjectBriefCount } = await supabase
    .from("project_daily_briefs")
    .select("*", { count: "exact", head: true })
    .in("generation_status", ["pending", "failed"])
    .lt("created_at", thirtyDaysAgo);

  console.log(
    `\n  OLD FAILED/PENDING (>30d): ${oldProjectBriefCount || 0} project briefs\n`,
  );

  // ===== 4. SCHEDULED SMS MESSAGES =====
  console.log("📱 Scheduled SMS Messages:");
  const { data: scheduledSmsStats } = await supabase
    .from("scheduled_sms_messages")
    .select("status");

  if (scheduledSmsStats) {
    const statusCounts: Record<string, number> = {};
    scheduledSmsStats.forEach((msg: any) => {
      statusCounts[msg.status] = (statusCounts[msg.status] || 0) + 1;
    });
    results.scheduled_sms_messages = statusCounts;

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  // Old pending/failed scheduled SMS
  const { count: oldScheduledSmsCount } = await supabase
    .from("scheduled_sms_messages")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "failed"])
    .lt("created_at", thirtyDaysAgo);

  console.log(
    `\n  OLD PENDING/FAILED (>30d): ${oldScheduledSmsCount || 0} scheduled SMS\n`,
  );

  // ===== 5. SMS MESSAGES =====
  console.log("💬 SMS Messages:");
  const { data: smsStats } = await supabase
    .from("sms_messages")
    .select("status");

  if (smsStats) {
    const statusCounts: Record<string, number> = {};
    smsStats.forEach((msg: any) => {
      statusCounts[msg.status] = (statusCounts[msg.status] || 0) + 1;
    });
    results.sms_messages = statusCounts;

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  // Old pending/failed SMS
  const { count: oldSmsCount } = await supabase
    .from("sms_messages")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "failed"])
    .lt("created_at", thirtyDaysAgo);

  console.log(
    `\n  OLD PENDING/FAILED (>30d): ${oldSmsCount || 0} SMS messages\n`,
  );

  // ===== 6. CRON LOGS =====
  console.log("⏰ Cron Logs:");
  const { data: cronStats } = await supabase.from("cron_logs").select("status");

  if (cronStats) {
    const statusCounts: Record<string, number> = {};
    cronStats.forEach((log: any) => {
      statusCounts[log.status] = (statusCounts[log.status] || 0) + 1;
    });
    results.cron_logs = statusCounts;

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  // Total cron logs
  const { count: totalCronLogs } = await supabase
    .from("cron_logs")
    .select("*", { count: "exact", head: true });

  console.log(`\n  TOTAL: ${totalCronLogs || 0} cron logs`);

  // Old cron logs (>90 days - these accumulate forever)
  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count: oldCronCount } = await supabase
    .from("cron_logs")
    .select("*", { count: "exact", head: true })
    .lt("created_at", ninetyDaysAgo);

  console.log(`  OLD (>90d): ${oldCronCount || 0} cron logs\n`);

  // ===== SUMMARY =====
  console.log("=".repeat(60));
  console.log("📊 CLEANUP SUMMARY:");
  console.log("=".repeat(60));
  console.log("\nRecommended cleanup targets:");
  console.log(`  • Queue Jobs (failed >30d): ~${oldFailedCount || 0}`);
  console.log(`  • Daily Briefs (failed/pending >30d): ~${oldBriefCount || 0}`);
  console.log(
    `  • Project Briefs (failed/pending >30d): ~${oldProjectBriefCount || 0}`,
  );
  console.log(
    `  • Scheduled SMS (pending/failed >30d): ~${oldScheduledSmsCount || 0}`,
  );
  console.log(`  • SMS Messages (pending/failed >30d): ~${oldSmsCount || 0}`);
  console.log(`  • Cron Logs (all >90d): ~${oldCronCount || 0}`);
  console.log(
    "\nNote: Keep completed/successful records for historical data\n",
  );

  process.exit(0);
}

analyzeStaleData().catch(console.error);
