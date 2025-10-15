// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import mdsvexConfig from './mdsvex.config.js';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ mode }) => {
	const isDev = mode === 'development';
	const isProd = mode === 'production';
	const isAnalyze = process.env.ANALYZE === 'true';

	return {
		plugins: [
			mdsvex(mdsvexConfig),
			sveltekit({
				typescript: {
					typecheck: !isDev
				}
			}),
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
				port: 24678,
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
				'6c4ed622c3b6.ngrok-free.app', // Your specific ngrok subdomain
				'.ngrok-free.app', // Or allow all ngrok-free.app subdomains
				'.ngrok.io' // If using paid ngrok
			]
		},

		preview: { port: 4173 },

		// Enhanced dependency optimization
		optimizeDeps: {
			include: [
				'date-fns',
				'marked',
				'sanitize-html',
				'lucide-svelte',
				'mode-watcher',
				'tailwind-merge'
			],
			exclude: [
				'@xenova/transformers',
				'@babel/parser',
				'@babel/traverse',
				'@babel/types',
				'sharp' // Binary dependency
			],
			// Force optimization in dev for consistency
			force: isDev
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
								id.includes('lucide-svelte') ||
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
