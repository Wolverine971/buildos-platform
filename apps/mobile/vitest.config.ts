// apps/mobile/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { localWorkerLimits } from '../../vitest.workers';

// Pure TypeScript only (config, storage, API wiring). Screens are checked by tsc and Expo.
export default defineConfig({
	resolve: {
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
	},
	test: {
		...localWorkerLimits(),
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts']
	}
});
