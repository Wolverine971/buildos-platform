// packages/buildos-mcp-server/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { localWorkerLimits } from '../../vitest.workers';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
	test: {
		...localWorkerLimits(),
		globals: true,
		environment: 'node',
		// The SDK entrypoint (index.ts) is exercised end-to-end manually; unit
		// tests cover the SDK-free core (config + HTTP client).
		include: ['src/**/*.test.ts'],
		coverage: coverageConfig(['src/**/*.ts'])
	}
});
