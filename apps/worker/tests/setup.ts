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

// Worker modules call dotenv at import, which would load apps/worker/.env and
// hand unit tests real paid/messaging credentials. dotenv never overwrites a key
// that already exists, so pre-setting each to '' keeps the real value out. Live
// suites opt back in with their own switches (or WORKER_TEST_LIVE_SECRETS=true).
const LIVE_SECRET_OPT_INS = [
	'WORKER_TEST_LIVE_SECRETS',
	'AGENTIC_PHASE_A_WORKFLOW',
	'OPENROUTER_TOOL_GRAPH_MODEL'
];
const TEST_BLANKED_SECRETS = [
	'PRIVATE_OPENROUTER_API_KEY',
	'OPENROUTER_API_KEY',
	'PRIVATE_OPENAI_API_KEY',
	'OPENAI_API_KEY',
	'PRIVATE_MOONSHOT_API_KEY',
	'PRIVATE_TAVILY_API_KEY',
	'PRIVATE_TWILIO_ACCOUNT_SID',
	'PRIVATE_TWILIO_AUTH_TOKEN',
	'PRIVATE_TWILIO_MESSAGING_SERVICE_SID',
	'PRIVATE_TWILIO_VERIFY_SERVICE_SID',
	'GMAIL_USER',
	'GMAIL_APP_PASSWORD',
	'GMAIL_ALIAS'
];
if (!LIVE_SECRET_OPT_INS.some((name) => process.env[name]?.trim())) {
	for (const name of TEST_BLANKED_SECRETS) process.env[name] = '';
}

// Mock console methods to reduce noise during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Global test setup
beforeEach(() => {
	vi.clearAllMocks();
});
