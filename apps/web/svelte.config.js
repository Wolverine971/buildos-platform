// apps/web/svelte.config.js

import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import mdsvexConfig from './mdsvex.config.js';

// Better environment detection

export default {
	extensions: ['.svelte', '.svx', '.md'],

	preprocess: [
		vitePreprocess({
			postcss: true
		}),
		mdsvex(mdsvexConfig)
	],

	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			// Defaults for every function. Routes that need more can override
			// with `export const config = { maxDuration, memory }` at the top
			// of their +server.ts / +page.server.ts / +layout.server.ts.
			// See apps/web/docs/technical/performance/VERCEL_OPTIMIZATIONS_2026-04-18.md
			memory: 512,
			maxDuration: 10
		}),

		alias: {
			$components: 'src/lib/components',
			$ui: 'src/lib/ui',
			$utils: 'src/lib/utils'
		},

		prerender: {
			handleHttpError: ({ path, message }) => {
				// Skip errors for API routes and auth routes (they're not prerenderable)
				if (path.startsWith('/api/') || path.startsWith('/auth/')) {
					return;
				}
				// Only fail builds in production
				if (process.env.VERCEL) {
					throw new Error(message);
				}
				console.warn(`Prerender error on ${path}: ${message}`);
			},
			crawl: true,
			entries: [
				'*',
				'/beta',
				'/blogs',
				'/contact',
				'/docs',
				'/feedback',
				'/help',
				'/investors',
				'/pricing',
				'/privacy',
				'/terms'
			]
		},

		env: {
			publicPrefix: 'PUBLIC_'
		}
	}
};
