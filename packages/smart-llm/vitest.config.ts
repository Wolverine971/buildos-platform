// packages/smart-llm/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { localWorkerLimits } from '../../vitest.workers';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
	test: {
		...localWorkerLimits(),
		globals: true,
		environment: 'node',
		coverage: coverageConfig(['src/**/*.ts'])
	}
});
