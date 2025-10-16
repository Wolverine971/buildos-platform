// apps/worker/scripts/check-queued-jobs.ts
import { supabase } from "../src/lib/supabase";

async function checkQueuedJobs() {
  console.log("🔍 Checking all queued and scheduled jobs...\n");

  // Get all pending/processing jobs
  const { data: jobs, error } = await supabase
    .from("queue_jobs")
    .select(
      "id, queue_job_id, user_id, job_type, status, scheduled_for, created_at, metadata",
    )
    .in("status", ["pending", "processing"])
    .order("scheduled_for", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${jobs?.length || 0} queued/active jobs\n`);

  if (!jobs || jobs.length === 0) {
    console.log("No jobs currently queued.\n");

    // Check for jobs scheduled in the future
    const { data: futureJobs } = await supabase
      .from("queue_jobs")
      .select(
        "id, queue_job_id, user_id, job_type, status, scheduled_for, created_at, metadata",
      )
      .eq("status", "pending")
      .gte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(20);

    if (futureJobs && futureJobs.length > 0) {
      console.log(
        `📅 Found ${futureJobs.length} jobs scheduled for the future:\n`,
      );

      // Get user info for future jobs
      const userIds = [...new Set(futureJobs.map((j) => j.user_id))];
      const { data: users } = await supabase
        .from("users")
        .select("id, email, name, last_visit, timezone")
        .in("id", userIds);

      const userMap = new Map(users?.map((u) => [u.id, u]) || []);

      for (const job of futureJobs) {
        const user = userMap.get(job.user_id);
        const scheduledDate = new Date(job.scheduled_for);
        const now = new Date();
        const hoursUntil = (
          (scheduledDate.getTime() - now.getTime()) /
          (1000 * 60 * 60)
        ).toFixed(1);

        console.log(`  ${job.job_type} [${job.status}]`);
        console.log(`    User: ${user?.email || job.user_id}`);
        console.log(`    Name: ${user?.name || "N/A"}`);
        console.log(`    Timezone: ${user?.timezone || "N/A"}`);
        console.log(`    Last Visit: ${user?.last_visit || "Never"}`);
        console.log(`    Scheduled: ${job.scheduled_for} (in ${hoursUntil}h)`);
        console.log(`    Job ID: ${job.queue_job_id}`);

        const metadata = job.metadata as any;
        if (metadata?.briefDate) {
          console.log(`    Brief Date: ${metadata.briefDate}`);
        }
        if (metadata?.isReengagement) {
          console.log(
            `    Re-engagement: Yes (inactive for ${metadata.daysSinceLastLogin} days)`,
          );
        }
        console.log("");
      }

      // Group by job type
      const byType: Record<string, number> = {};
      futureJobs.forEach((j) => {
        byType[j.job_type] = (byType[j.job_type] || 0) + 1;
      });

      console.log("\n📊 Future jobs by type:");
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    } else {
      console.log("No future jobs scheduled either.\n");
    }

    return;
  }

  // Get user emails for the jobs
  const userIds = [...new Set(jobs.map((j) => j.user_id))];
  const { data: users } = await supabase
    .from("users")
    .select("id, email, name, last_visit, timezone")
    .in("id", userIds);

  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  console.log("📋 Currently Active Jobs:\n");

  for (const job of jobs) {
    const user = userMap.get(job.user_id);
    const scheduledDate = new Date(job.scheduled_for);
    const now = new Date();
    const isPast = scheduledDate < now;
    const hoursOffset = (
      (scheduledDate.getTime() - now.getTime()) /
      (1000 * 60 * 60)
    ).toFixed(1);

    console.log(`  ${job.job_type} [${job.status}]`);
    console.log(`    User: ${user?.email || job.user_id}`);
    console.log(`    Name: ${user?.name || "N/A"}`);
    console.log(`    Timezone: ${user?.timezone || "N/A"}`);
    console.log(`    Last Visit: ${user?.last_visit || "Never"}`);
    console.log(
      `    Scheduled: ${job.scheduled_for} (${isPast ? "PAST DUE" : `in ${hoursOffset}h`})`,
    );
    console.log(`    Created: ${job.created_at}`);
    console.log(`    Job ID: ${job.queue_job_id}`);

    const metadata = job.metadata as any;
    if (metadata?.briefDate) {
      console.log(`    Brief Date: ${metadata.briefDate}`);
    }
    if (metadata?.isReengagement) {
      console.log(
        `    Re-engagement: Yes (inactive for ${metadata.daysSinceLastLogin} days)`,
      );
    }
    console.log("");
  }

  // Group by job type
  const byType: Record<string, number> = {};
  jobs.forEach((j) => {
    byType[j.job_type] = (byType[j.job_type] || 0) + 1;
  });

  console.log("📊 Active jobs by type:");
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  process.exit(0);
}

checkQueuedJobs().catch((err) => {
  console.error(err);
  process.exit(1);
});
