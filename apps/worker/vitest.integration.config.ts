// apps/worker/vitest.integration.config.ts
import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
	...baseConfig,
	test: {
		...baseConfig.test,
		// This runner owns a disposable local PostgreSQL cluster and intentionally
		// excludes older integration suites that depend on external credentials.
		include: [
			'tests/integration/deepResearchMigration.test.ts',
			'tests/integration/agentRunStrandedSweep.test.ts'
		],
		exclude: ['**/node_modules/**', '**/dist/**']
	}
});
