import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// Maintenance scripts need server-only modules without booting the full SvelteKit plugin graph.
// This keeps the migration runner independent from client entrypoint analysis while preserving
// the same runtime environment lookup used by the deployed service.
export default defineConfig(({ mode }) => {
	for (const [name, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
		process.env[name] ??= value;
	}

	return {
		resolve: {
			alias: [
				{
					find: '$env/dynamic/private',
					replacement: fileURLToPath(
						new URL('./vite-node-private-env.ts', import.meta.url)
					)
				}
			]
		}
	};
});
