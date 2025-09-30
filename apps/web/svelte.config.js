// apps/web/svelte.config.js

import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Better environment detection

export default {
	extensions: ['.svelte', '.svx', '.md'],

	preprocess: [
		vitePreprocess({
			postcss: true
		}),
		mdsvex({
			extensions: ['.svx', '.md']
		})
	],

	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x'
		}),

		alias: {
			$components: 'src/lib/components',
			$ui: 'src/lib/ui',
			$utils: 'src/lib/utils'
		},

		prerender: {
			handleHttpError: ({ path, message }) => {
				if (path.startsWith('/api/')) {
					return;
				}
				// Only fail builds in production
				if (process.env.VERCEL) {
					throw new Error(message);
				}
				console.warn(`Prerender error on ${path}: ${message}`);
			},
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
		},

		csrf: {
			checkOrigin: true
		}
	}
};
