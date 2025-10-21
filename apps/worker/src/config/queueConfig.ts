// apps/worker/src/config/queueConfig.ts
// Queue configuration management with environment variable support
// This addresses Moderate Issue #6 in QUEUE_FIXES_DESIGN.md

import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export interface QueueConfiguration {
  // Core queue settings
  pollInterval: number; // How often to check for new jobs (ms)
  batchSize: number; // Max jobs to process concurrently
  stalledTimeout: number; // When to consider jobs stalled (ms)

  // Retry settings
  maxRetries: number; // Default max retry attempts
  retryBackoffBase: number; // Base delay for exponential backoff (ms)

  // Progress tracking
  enableProgressTracking: boolean;
  progressUpdateRetries: number;

  // Health and monitoring
  statsUpdateInterval: number; // How often to log queue stats (ms)
  enableHealthChecks: boolean;

  // Performance tuning
  workerTimeout: number; // Max time for a single job (ms)
  enableConcurrentProcessing: boolean;
}

/**
 * Parse environment variable as integer with fallback
 */
function parseEnvInt(envVar: string, defaultValue: number): number {
  const value = process.env[envVar];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(
      `⚠️ Invalid integer value for ${envVar}: "${value}", using default: ${defaultValue}`,
    );
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse environment variable as boolean with fallback
 */
function parseEnvBool(envVar: string, defaultValue: boolean): boolean {
  const value = process.env[envVar];
  if (!value) return defaultValue;

  const normalizedValue = value.toLowerCase();
  if (normalizedValue === "true" || normalizedValue === "1") return true;
  if (normalizedValue === "false" || normalizedValue === "0") return false;

  console.warn(
    `⚠️ Invalid boolean value for ${envVar}: "${value}", using default: ${defaultValue}`,
  );
  return defaultValue;
}

/**
 * Validate configuration values and apply constraints
 */
function validateConfig(config: QueueConfiguration): QueueConfiguration {
  const validated = { ...config };

  // Ensure minimum values
  validated.pollInterval = Math.max(1000, validated.pollInterval); // Min 1 second
  validated.batchSize = Math.max(1, Math.min(20, validated.batchSize)); // 1-20 jobs
  validated.stalledTimeout = Math.max(30000, validated.stalledTimeout); // Min 30 seconds
  validated.maxRetries = Math.max(0, Math.min(10, validated.maxRetries)); // 0-10 retries
  validated.retryBackoffBase = Math.max(100, validated.retryBackoffBase); // Min 100ms
  validated.statsUpdateInterval = Math.max(
    10000,
    validated.statsUpdateInterval,
  ); // Min 10 seconds
  validated.workerTimeout = Math.max(10000, validated.workerTimeout); // Min 10 seconds

  return validated;
}

/**
 * Load queue configuration from environment variables
 */
function loadQueueConfig(): QueueConfiguration {
  const config: QueueConfiguration = {
    // Core settings
    pollInterval: parseEnvInt("QUEUE_POLL_INTERVAL", 5000),
    batchSize: parseEnvInt("QUEUE_BATCH_SIZE", 5),
    stalledTimeout: parseEnvInt("QUEUE_STALLED_TIMEOUT", 300000),

    // Retry settings
    maxRetries: parseEnvInt("QUEUE_MAX_RETRIES", 3),
    retryBackoffBase: parseEnvInt("QUEUE_RETRY_BACKOFF_BASE", 1000),

    // Progress tracking
    enableProgressTracking: parseEnvBool(
      "QUEUE_ENABLE_PROGRESS_TRACKING",
      true,
    ),
    progressUpdateRetries: parseEnvInt("QUEUE_PROGRESS_UPDATE_RETRIES", 3),

    // Health and monitoring
    statsUpdateInterval: parseEnvInt("QUEUE_STATS_UPDATE_INTERVAL", 60000),
    enableHealthChecks: parseEnvBool("QUEUE_ENABLE_HEALTH_CHECKS", true),

    // Performance tuning
    workerTimeout: parseEnvInt("QUEUE_WORKER_TIMEOUT", 600000), // 10 minutes default
    enableConcurrentProcessing: parseEnvBool(
      "QUEUE_ENABLE_CONCURRENT_PROCESSING",
      true,
    ),
  };

  return validateConfig(config);
}

// Export the configuration
export const queueConfig = loadQueueConfig();

// Development configuration profile
export const developmentConfig: Partial<QueueConfiguration> = {
  pollInterval: 2000, // Faster polling in development
  batchSize: 2, // Smaller batches for easier debugging
  stalledTimeout: 120000, // Shorter timeout for faster feedback
  statsUpdateInterval: 30000, // More frequent stats
  enableProgressTracking: true,
  enableHealthChecks: true,
};

// Production configuration profile
export const productionConfig: Partial<QueueConfiguration> = {
  pollInterval: 5000, // Standard polling
  batchSize: 10, // Larger batches for better throughput
  stalledTimeout: 600000, // Longer timeout for complex jobs
  statsUpdateInterval: 300000, // Less frequent stats (5 minutes)
  enableProgressTracking: true,
  enableHealthChecks: true,
};

/**
 * Get configuration based on environment
 */
export function getEnvironmentConfig(): QueueConfiguration {
  const baseConfig = loadQueueConfig();
  const env = process.env.NODE_ENV || "development";

  let profileConfig: Partial<QueueConfiguration> = {};

  switch (env.toLowerCase()) {
    case "production":
      profileConfig = productionConfig;
      console.log("🏭 Using production queue configuration profile");
      break;
    case "development":
    case "dev":
      profileConfig = developmentConfig;
      console.log("🔧 Using development queue configuration profile");
      break;
    default:
      console.log("⚙️ Using default queue configuration");
      break;
  }

  // Merge base config with profile config
  const mergedConfig = { ...baseConfig, ...profileConfig };

  // Log the final configuration (without sensitive data)
  console.log("📋 Queue Configuration:");
  console.log(`   - Poll interval: ${mergedConfig.pollInterval}ms`);
  console.log(`   - Batch size: ${mergedConfig.batchSize}`);
  console.log(`   - Stalled timeout: ${mergedConfig.stalledTimeout}ms`);
  console.log(`   - Max retries: ${mergedConfig.maxRetries}`);
  console.log(`   - Worker timeout: ${mergedConfig.workerTimeout}ms`);
  console.log(
    `   - Concurrent processing: ${mergedConfig.enableConcurrentProcessing ? "enabled" : "disabled"}`,
  );

  return validateConfig(mergedConfig);
}

/**
 * Validate that required environment variables are set
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required environment variables
  const requiredVars = [
    "PUBLIC_SUPABASE_URL",
    "PRIVATE_SUPABASE_SERVICE_KEY",
    "PRIVATE_OPENROUTER_API_KEY", // Required for LLM analysis in briefs
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate PUBLIC_APP_URL (used for email/SMS tracking links)
  const appUrl = process.env.PUBLIC_APP_URL || "https://build-os.com";
  try {
    new URL(appUrl);
  } catch {
    errors.push(
      `PUBLIC_APP_URL is invalid: "${appUrl}". Must be a valid URL (defaults to https://build-os.com)`,
    );
  }

  // Conditional validation: if webhook email is enabled, webhook secret is required
  if (process.env.USE_WEBHOOK_EMAIL === "true") {
    if (!process.env.BUILDOS_WEBHOOK_URL) {
      errors.push(
        "BUILDOS_WEBHOOK_URL is required when USE_WEBHOOK_EMAIL=true",
      );
    }
    if (!process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET) {
      errors.push(
        "PRIVATE_BUILDOS_WEBHOOK_SECRET is required when USE_WEBHOOK_EMAIL=true",
      );
    }
  }

  // Conditional validation: Twilio credentials must be all-or-nothing
  const twilioVars = [
    "PRIVATE_TWILIO_ACCOUNT_SID",
    "PRIVATE_TWILIO_AUTH_TOKEN",
    "PRIVATE_TWILIO_MESSAGING_SERVICE_SID",
  ];
  const twilioConfigured = twilioVars.filter((v) => process.env[v]).length;
  if (twilioConfigured > 0 && twilioConfigured < 3) {
    errors.push(
      `Partial Twilio configuration: ${twilioConfigured}/3 credentials set. All three are required (ACCOUNT_SID, AUTH_TOKEN, MESSAGING_SERVICE_SID)`,
    );
  }

  // Conditional validation: VAPID keys for push notifications (warn if both not set)
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if ((vapidPublic && !vapidPrivate) || (!vapidPublic && vapidPrivate)) {
    errors.push(
      "Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together for push notifications",
    );
  }

  // Check for common configuration mistakes
  const pollInterval = parseEnvInt("QUEUE_POLL_INTERVAL", 5000);
  const batchSize = parseEnvInt("QUEUE_BATCH_SIZE", 5);

  if (pollInterval < 1000) {
    errors.push(
      "QUEUE_POLL_INTERVAL should be at least 1000ms to avoid overwhelming the database",
    );
  }

  if (batchSize > 20) {
    errors.push(
      "QUEUE_BATCH_SIZE should be 20 or less to prevent resource exhaustion",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
