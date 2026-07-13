// apps/web/playwright.config.agentic.ts
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './src/lib/tests/agentic-e2e/browser',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 300_000,
	expect: { timeout: 30_000 },
	use: {
		baseURL: (process.env.AGENTIC_E2E_BASE_URL || 'http://localhost:5173').replace(/\/$/, ''),
		// API login carries the dedicated test password; do not persist request traces.
		trace: 'off',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
