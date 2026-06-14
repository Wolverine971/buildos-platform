// packages/buildos-mcp-server/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	target: 'node20',
	clean: true,
	sourcemap: true,
	// The CLI entry keeps its `#!/usr/bin/env node` shebang from src/index.ts.
	bundle: true
});
