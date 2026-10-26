// apps/web/playwright.config.smoke.ts
import { defineConfig, devices } from '@playwright/test';

if (process.env.BUILDOS_BROWSER_FIXTURE !== '1' || !process.env.BUILDOS_BROWSER_APP_DIR) {
	throw new Error('Run pnpm test:browser:smoke to build and isolate the app first.');
}
export default defineConfig({
	testDir: './tests/browser',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 45_000,
	expect: { timeout: 10_000 },
	reporter: [['list'], ['html', { outputFolder: 'playwright-report/smoke', open: 'never' }]],
	outputDir: 'test-results/smoke',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		serviceWorkers: 'block',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'node tests/browser/server.mjs',
		url: 'http://127.0.0.1:4173/auth/login',
		reuseExistingServer: false,
		timeout: 60_000
	}
});
