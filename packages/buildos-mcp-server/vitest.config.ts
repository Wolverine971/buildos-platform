// packages/buildos-mcp-server/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		// The SDK entrypoint (index.ts) is exercised end-to-end manually; unit
		// tests cover the SDK-free core (config + HTTP client).
		include: ['src/**/*.test.ts']
	}
});
