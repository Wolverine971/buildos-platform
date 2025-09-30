// apps/worker/src/index.ts
import cors from "cors";
import { format, utcToZonedTime } from "date-fns-tz";
import dotenv from "dotenv";
import express from "express";

import { supabase } from "./lib/supabase";
import { registerEmailTrackingRoute } from "./routes/email-tracking";
import { startScheduler } from "./scheduler";
import { queue, startWorker } from "./worker";

dotenv.config();

// Log email configuration at startup
console.log("🚀 Application starting...");
console.log("📧 Email Configuration:");
console.log(
  `   → USE_WEBHOOK_EMAIL: "${process.env.USE_WEBHOOK_EMAIL}" (type: ${typeof process.env.USE_WEBHOOK_EMAIL})`,
);
console.log(
  `   → Is webhook enabled: ${process.env.USE_WEBHOOK_EMAIL === "true" ? "YES" : "NO"}`,
);
console.log(
  `   → Webhook URL configured: ${process.env.BUILDOS_WEBHOOK_URL ? "YES" : "NO"}`,
);
console.log(`   → SMTP configured: ${process.env.SMTP_HOST ? "YES" : "NO"}`);

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Define allowed origins
const isDevelopment =
  process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
const allowedOrigins = [
  ...(isDevelopment
    ? [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
        "https://localhost:5173",
      ]
    : []),
  "https://build-os.com",
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

registerEmailTrackingRoute(app);

// Health check endpoint
app.get("/health", async (_req, res) => {
  try {
    // Try to get stats with a timeout
    const statsPromise = queue.getStats();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Stats timeout")), 5000),
    );

    const stats = await Promise.race([statsPromise, timeoutPromise]).catch(
      () => null,
    );

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "daily-brief-worker",
      queue: "supabase",
      stats: stats || { error: "Stats unavailable" },
    });
  } catch (error) {
    // Still return healthy even if stats fail
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "daily-brief-worker",
      queue: "supabase",
      stats: { error: "Stats unavailable" },
    });
  }
});

// Queue brief endpoint
app.post("/queue/brief", async (req, res) => {
  try {
    const {
      userId,
      scheduledFor,
      briefDate: requestedBriefDate,
      timezone: requestedTimezone,
      forceImmediate,
      forceRegenerate,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Validate user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Handle force regenerate
    if (forceRegenerate) {
      const targetBriefDate =
        requestedBriefDate ||
        format(
          utcToZonedTime(new Date(), requestedTimezone || "UTC"),
          "yyyy-MM-dd",
        );

      // Atomically cancel existing jobs for this date
      const { count } = await queue.cancelBriefJobsForDate(
        userId,
        targetBriefDate,
      );
      if (count > 0) {
        console.log(
          `🚫 Force regenerate: Cancelled ${count} existing brief job(s) for ${targetBriefDate}`,
        );
      }
    }

    // Get user's timezone preference
    const { data: preferences } = await supabase
      .from("user_brief_preferences")
      .select("timezone")
      .eq("user_id", userId)
      .single();

    const timezone = requestedTimezone || preferences?.timezone || "UTC";

    // Determine when to schedule the job
    let scheduleTime: Date;
    if (forceImmediate || forceRegenerate) {
      scheduleTime = new Date(); // Now
    } else if (scheduledFor) {
      scheduleTime = new Date(scheduledFor);
    } else {
      scheduleTime = new Date(); // Default to now
    }

    // Calculate brief date
    const zonedDate = utcToZonedTime(scheduleTime, timezone);
    const briefDate = requestedBriefDate || format(zonedDate, "yyyy-MM-dd");

    // Queue the job using Supabase queue
    const job = await queue.add(
      "generate_daily_brief",
      userId,
      {
        briefDate,
        timezone,
        options: {
          forceRegenerate,
        },
      },
      {
        priority: forceImmediate ? 1 : 10,
        scheduledFor: scheduleTime,
        dedupKey: forceRegenerate
          ? `brief-${userId}-${briefDate}-${Date.now()}`
          : `brief-${userId}-${briefDate}`,
      },
    );

    console.log(
      `📝 API: Queued brief for user ${userId}, job ${job.queue_job_id}`,
    );

    return res.json({
      success: true,
      jobId: job.queue_job_id,
      scheduledFor: scheduleTime.toISOString(),
      briefDate,
    });
  } catch (error: any) {
    console.error("Error queueing brief:", error);
    return res.status(500).json({
      error: "Failed to queue brief generation",
      message: error.message,
    });
  }
});

// Queue phases endpoint
app.post("/queue/phases", async (req, res) => {
  try {
    const { userId, projectId, options } = req.body;

    if (!userId || !projectId) {
      return res.status(400).json({
        error: "userId and projectId are required",
      });
    }

    // Check for existing jobs
    const { data: existingJobs } = await supabase
      .from("queue_jobs")
      .select("*")
      .eq("user_id", userId)
      .eq("job_type", "generate_phases")
      .eq("metadata->projectId", projectId)
      .in("status", ["pending", "processing"]);

    if (existingJobs && existingJobs.length > 0) {
      return res.status(409).json({
        error: "Phases generation already in progress for this project",
      });
    }

    // Queue the job
    const job = await queue.add(
      "generate_phases",
      userId,
      {
        projectId,
        options,
      },
      {
        priority: 5,
      },
    );

    return res.json({
      success: true,
      jobId: job.queue_job_id,
    });
  } catch (error: any) {
    console.error("Error queueing phases generation:", error);
    return res.status(500).json({
      error: "Failed to queue phases generation",
      message: error.message,
    });
  }
});

// Queue onboarding analysis endpoint
app.post("/queue/onboarding", async (req, res) => {
  try {
    const { userId, userContext, options } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Check for existing jobs unless forcing regenerate
    if (!options?.forceRegenerate) {
      const { data: existingJobs } = await supabase
        .from("queue_jobs")
        .select("*")
        .eq("user_id", userId)
        .eq("job_type", "onboarding_analysis")
        .in("status", ["pending", "processing"]);

      if (existingJobs && existingJobs.length > 0) {
        return res.status(409).json({
          error: "Onboarding analysis already in progress",
        });
      }
    }

    // Queue the job
    const job = await queue.add(
      "onboarding_analysis",
      userId,
      {
        userContext,
        options,
      },
      {
        priority: 1, // High priority for onboarding
      },
    );

    return res.json({
      success: true,
      jobId: job.queue_job_id,
    });
  } catch (error: any) {
    console.error("Error queueing onboarding analysis:", error);
    return res.status(500).json({
      error: "Failed to queue onboarding analysis",
      message: error.message,
    });
  }
});

// Get job status endpoint
app.get("/jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    return res.json(job);
  } catch (error: any) {
    console.error("Error fetching job:", error);
    return res.status(500).json({
      error: "Failed to fetch job",
      message: error.message,
    });
  }
});

// Get user jobs endpoint
app.get("/users/:userId/jobs", async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, status, limit } = req.query;

    const jobs = await queue.getUserJobs(userId, {
      jobType: type as any,
      status: status as any,
      limit: limit ? parseInt(limit as string) : 10,
    });

    res.json({
      jobs,
    });
  } catch (error: any) {
    console.error("Error fetching user jobs:", error);
    res.status(500).json({
      error: "Failed to fetch user jobs",
      message: error.message,
    });
  }
});

// Queue stats endpoint
app.get("/queue/stats", async (_req, res) => {
  try {
    const stats = await queue.getStats();
    res.json({ stats });
  } catch (error: any) {
    console.error("Error fetching queue stats:", error);
    res.status(500).json({
      error: "Failed to fetch queue stats",
      message: error.message,
    });
  }
});

// Start the server
async function start() {
  try {
    // Start the worker
    await startWorker();

    // Start the scheduler
    startScheduler();

    // Start the API server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 API server running on port ${PORT}`);
      console.log(`📊 Queue dashboard: http://localhost:${PORT}/queue/stats`);
      console.log(`❤️ Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  queue.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  queue.stop();
  process.exit(0);
});

// Start the application
start();
