// apps/worker/tests/setup.ts
import { beforeAll, beforeEach, expect, vi } from 'vitest';
import { config } from 'dotenv';
import { assertPostgresTestIpcAccess } from '../../../scripts/testing/postgres-ipc-preflight';

// Load environment variables for testing
config({ path: '.env.test' });

beforeAll(() => assertPostgresTestIpcAccess(expect.getState().testPath));

function isHttpUrl(value: string | undefined): boolean {
	if (!value) return false;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

// Unit tests import worker modules that construct a Supabase client at module load.
// Keep those imports independent from real CI secrets and placeholder .env files.
if (!isHttpUrl(process.env.PUBLIC_SUPABASE_URL)) {
	process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
}
process.env.PRIVATE_SUPABASE_SERVICE_KEY ||= 'test-service-role-key';

// Mock console methods to reduce noise during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Global test setup
beforeEach(() => {
	vi.clearAllMocks();
});
