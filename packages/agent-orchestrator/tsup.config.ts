// packages/agent-orchestrator/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/testing/harness/index.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	clean: true,
	splitting: false,
	sourcemap: false
});
