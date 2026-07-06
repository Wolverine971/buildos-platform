// packages/twilio-service/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		coverage: coverageConfig(['src/**/*.ts'])
	}
});
