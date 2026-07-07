// apps/web/vite.config.ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ mode }) => {
	const isDev = mode === 'development';
	const isProd = mode === 'production';
	const isAnalyze = process.env.ANALYZE === 'true';
	// Keep dep pre-bundles stable in local dev unless explicitly forced.
	const forceOptimizeDeps = process.env.VITE_FORCE_OPTIMIZE_DEPS === 'true';
	const hmrPortEnv = process.env.VITE_HMR_PORT?.trim();
	const parsedHmrPort = hmrPortEnv ? Number.parseInt(hmrPortEnv, 10) : 24678;
	const hmrPort =
		hmrPortEnv?.toLowerCase() === 'auto' || !Number.isFinite(parsedHmrPort)
			? undefined
			: parsedHmrPort;

	// Extra dev-server hostnames (comma-separated). Use when tunneling through
	// ngrok/cloudflared with a specific subdomain that isn't covered by the
	// wildcard entries below (ngrok-free.app, ngrok.io).
	const extraAllowedHosts = (process.env.VITE_DEV_ALLOWED_HOSTS ?? '')
		.split(',')
		.map((h) => h.trim())
		.filter(Boolean);

	// CodeMirror extensions rely on instanceof checks across packages; keep the
	// lazy-loaded editor on one resolved dependency graph in dev.
	const codemirrorPackages = [
		'@codemirror/autocomplete',
		'@codemirror/commands',
		'@codemirror/lang-css',
		'@codemirror/lang-html',
		'@codemirror/lang-javascript',
		'@codemirror/lang-markdown',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view'
	];

	return {
		plugins: [
			sveltekit(),
			// Gzip compression for production (fallback for older browsers)
			isProd &&
				viteCompression({
					verbose: true,
					disable: false,
					threshold: 1024, // Compress files larger than 1KB
					algorithm: 'gzip',
					ext: '.gz',
					deleteOriginFile: false
				}),
			// Brotli compression for production (better compression, ~15-25% smaller than gzip)
			isProd &&
				viteCompression({
					verbose: true,
					disable: false,
					threshold: 1024, // Compress files larger than 1KB
					algorithm: 'brotliCompress',
					ext: '.br',
					deleteOriginFile: false
				}),
			// Bundle analyzer
			isAnalyze &&
				visualizer({
					open: true,
					gzipSize: true,
					brotliSize: true,
					filename: 'build/bundle-analysis.html'
				})
		].filter(Boolean),

		// Development server optimizations
		server: {
			fs: { strict: true },
			hmr: {
				...(hmrPort && hmrPort > 0 ? { port: hmrPort } : {}),
				overlay: true
			},
			watch: {
				ignored: [
					'**/node_modules/**',
					'**/.git/**',
					'**/dist/**',
					'**/.svelte-kit/**',
					'**/coverage/**',
					'**/scripts/**',
					'**/*.log'
				]
			},

			allowedHosts: [
				'localhost',
				'.ngrok-free.app', // All ngrok-free.app subdomains
				'.ngrok.io', // Paid ngrok
				...extraAllowedHosts // VITE_DEV_ALLOWED_HOSTS (comma-separated)
			]
		},

		preview: { port: 4173 },

		resolve: {
			alias: [
				{
					find: /^lucide-svelte$/,
					replacement: fileURLToPath(
						new URL('./src/lib/icons/lucide.ts', import.meta.url)
					)
				}
			],
			dedupe: codemirrorPackages
		},

		// Enhanced dependency optimization
		optimizeDeps: {
			include: [
				...codemirrorPackages,
				'date-fns',
				'marked',
				'sanitize-html',
				'mode-watcher',
				'tailwind-merge',
				'rrule'
			],
			exclude: [
				'@xenova/transformers',
				'@babel/parser',
				'@babel/traverse',
				'@babel/types',
				'sharp' // Binary dependency
			],
			// Don't force re-optimization - causes "Outdated Optimize Dep" errors
			force: forceOptimizeDeps
		},

		// Environment variable handling
		define: {
			__APP_VERSION__: JSON.stringify(process.env.npm_package_version),
			__BUILD_TIME__: JSON.stringify(new Date().toISOString()),
			__DEV__: isDev,
			__PROD__: isProd
		},

		// Production build optimizations
		build: {
			// Modern browser target
			target: 'es2020',
			cssTarget: 'chrome80',

			// Use esbuild for faster minification
			minify: isProd ? 'esbuild' : false,

			// Source maps only in dev
			sourcemap: isDev,

			// Chunk size warnings
			chunkSizeWarningLimit: 1000,

			// Report compressed sizes
			reportCompressedSize: isProd,

			// CSS code splitting
			cssCodeSplit: true,

			// Rollup options for better chunking
			rollupOptions: {
				output: {
					// Manual chunks for better caching (only for client-side chunks)
					manualChunks: (id) => {
						// Skip SSR externals and node_modules that might be external
						if (id.includes('node_modules')) {
							// UI libraries
							if (
								id.includes('@tiptap/core') ||
								id.includes('@tiptap/starter-kit') ||
								id.includes('@tiptap/extension')
							) {
								return 'ui-vendor';
							}
							// Utilities
							if (
								id.includes('date-fns') ||
								id.includes('tailwind-merge') ||
								id.includes('sanitize-html') ||
								id.includes('marked')
							) {
								return 'utils';
							}
							// Heavy vendors (these are less likely to be external)
							if (id.includes('openai')) {
								return 'ai-vendor';
							}
							if (id.includes('googleapis') || id.includes('google-auth-library')) {
								return 'google-vendor';
							}
							if (id.includes('stripe')) {
								return 'stripe-vendor';
							}
						}
					}
				}
			}
		},

		// Worker options
		worker: {
			format: 'es',
			plugins: () => []
		},

		// SSR options
		ssr: {
			// Let SvelteKit handle SSR externals automatically
			noExternal: []
		}
	};
});
