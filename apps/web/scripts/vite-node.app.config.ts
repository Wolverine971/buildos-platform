// apps/web/scripts/vite-node.app.config.ts
import type { ConfigEnv, UserConfig } from 'vite';
import appConfig from '../vite.config';

// Scripts that need the full SvelteKit graph ($lib aliases, mdsvex, import.meta.glob) run through
// the app config, but not through its client dependency optimizer. vite-node resolves Svelte
// runtime imports into the optimizer's output directory, and on a cold cache (every CI checkout)
// that directory is still being written, so the run dies with ERR_FILE_NOT_FOUND_IN_OPTIMIZED_DEP_DIR.
export default async (env: ConfigEnv): Promise<UserConfig> => {
	const config = await appConfig(env);
	return {
		...config,
		optimizeDeps: { ...config.optimizeDeps, noDiscovery: true, include: [] }
	};
};
