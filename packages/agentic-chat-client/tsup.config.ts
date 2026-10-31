// packages/agentic-chat-client/tsup.config.ts
import { defineConfig } from 'tsup';

// One entry per module so the web's re-export shims (and the phone) can import a module by
// path; the barrel is for new code. Add a module here and to package.json "exports" together.
export default defineConfig({
	entry: [
		'src/index.ts',
		'src/worker-realtime-inbox.ts',
		'src/worker-realtime-coordinator.ts',
		'src/worker-realtime-preview.ts',
		'src/worker-realtime-channel.ts',
		'src/worker-realtime-runtime.ts',
		'src/worker-turn-adoption.ts',
		'src/agent-chat-worker-status.ts',
		'src/agent-chat-workflow.ts',
		'src/agent-chat-thinking-state.ts',
		'src/agent-chat.types.ts',
		'src/agent-chat-worker-ui-adapter.ts',
		'src/agent-chat-workflow.fixture.ts'
	],
	format: ['cjs', 'esm'],
	dts: true,
	splitting: false,
	sourcemap: false,
	clean: true
});
