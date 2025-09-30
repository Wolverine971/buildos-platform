// apps/worker/tests/setup.ts
import { beforeEach, vi } from "vitest";
import { config } from "dotenv";

// Load environment variables for testing
config({ path: ".env.test" });

// Mock console methods to reduce noise during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// Global test setup
beforeEach(() => {
  vi.clearAllMocks();
});
