// apps/web/scripts/apply-build-optimizations.js

// #!/usr/bin/env node

// scripts/apply-build-optimizations.js
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('🚀 Applying build optimizations...\n');

// 1. Update package.json with optimized scripts
console.log('📦 Updating package.json scripts...');
const packagePath = resolve('package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

// Add new optimized scripts
const newScripts = {
	...pkg.scripts,
	// Cross-platform build commands
	'build:analyze': 'cross-env ANALYZE=true vite build',
	'build:prod': 'cross-env NODE_ENV=production vite build',

	// Enhanced dev commands
	'dev:host': 'vite dev --host',
	'dev:https': 'vite dev --https',

	// Dependency management
	'deps:check': 'pnpm outdated',
	'deps:update': 'pnpm update --interactive',
	'deps:audit': 'pnpm audit --fix',

	// Performance monitoring
	size: 'size-limit',
	'size:why': 'size-limit --why'
};

pkg.scripts = newScripts;

// Add size-limit configuration
pkg['size-limit'] = [
	{
		path: 'build/**/*.js',
		limit: '150 KB',
		webpack: false
	}
];

// Save updated package.json
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ package.json updated\n');

// 2. Create optimized vite config
console.log('⚡ Creating optimized Vite configuration...');
const viteConfigOptimized = `// vite.config.optimized.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import mdsvexConfig from './mdsvex.config.js';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ mode }) => {
\tconst isDev = mode === 'development';
\tconst isProd = mode === 'production';
\tconst isAnalyze = process.env.ANALYZE === 'true';

\treturn {
\t\tplugins: [
\t\t\tmdsvex(mdsvexConfig),
\t\t\tsveltekit({
\t\t\t\ttypescript: {
\t\t\t\t\ttypecheck: !isDev
\t\t\t\t}
\t\t\t}),
\t\t\t// Compression plugin for production
\t\t\tisProd && viteCompression({
\t\t\t\tverbose: true,
\t\t\t\tdisable: false,
\t\t\t\tthreshold: 10240,
\t\t\t\talgorithm: 'gzip',
\t\t\t\text: '.gz'
\t\t\t}),
\t\t\t// Bundle analyzer
\t\t\tisAnalyze && visualizer({
\t\t\t\topen: true,
\t\t\t\tgzipSize: true,
\t\t\t\tbrotliSize: true,
\t\t\t\tfilename: 'build/bundle-analysis.html'
\t\t\t})
\t\t].filter(Boolean),

\t\t// Development server optimizations
\t\tserver: {
\t\t\tfs: { strict: true },
\t\t\thmr: {
\t\t\t\tport: 24678,
\t\t\t\toverlay: true
\t\t\t},
\t\t\twatch: {
\t\t\t\tignored: [
\t\t\t\t\t'**/node_modules/**',
\t\t\t\t\t'**/.git/**',
\t\t\t\t\t'**/dist/**',
\t\t\t\t\t'**/.svelte-kit/**',
\t\t\t\t\t'**/coverage/**',
\t\t\t\t\t'**/scripts/**',
\t\t\t\t\t'**/*.log'
\t\t\t\t]
\t\t\t}
\t\t},

\t\tpreview: { port: 4173 },

\t\t// Enhanced dependency optimization
\t\toptimizeDeps: {
\t\t\tinclude: [
\t\t\t\t'date-fns',
\t\t\t\t'marked',
\t\t\t\t'sanitize-html',
\t\t\t\t'lucide-svelte',
\t\t\t\t'mode-watcher',
\t\t\t\t'tailwind-merge'
\t\t\t],
\t\t\texclude: [
\t\t\t\t'@xenova/transformers',
\t\t\t\t'@babel/parser',
\t\t\t\t'@babel/traverse',
\t\t\t\t'@babel/types',
\t\t\t\t'sharp' // Binary dependency
\t\t\t],
\t\t\t// Force optimization in dev for consistency
\t\t\tforce: isDev
\t\t},

\t\t// Environment variable handling
\t\tdefine: {
\t\t\t__APP_VERSION__: JSON.stringify(process.env.npm_package_version),
\t\t\t__BUILD_TIME__: JSON.stringify(new Date().toISOString())
\t\t},

\t\t// Production build optimizations
\t\tbuild: {
\t\t\t// Modern browser target
\t\t\ttarget: 'es2020',
\t\t\tcssTarget: 'chrome80',
\t\t\t
\t\t\t// Use esbuild for faster minification
\t\t\tminify: isProd ? 'esbuild' : false,
\t\t\t
\t\t\t// Source maps only in dev
\t\t\tsourcemap: isDev,
\t\t\t
\t\t\t// Chunk size warnings
\t\t\tchunkSizeWarningLimit: 1000,
\t\t\t
\t\t\t// Report compressed sizes
\t\t\treportCompressedSize: isProd,
\t\t\t
\t\t\t// CSS code splitting
\t\t\tcssCodeSplit: true,
\t\t\t
\t\t\t// Rollup options for better chunking
\t\t\trollupOptions: {
\t\t\t\toutput: {
\t\t\t\t\t// Manual chunks for better caching
\t\t\t\t\tmanualChunks: {
\t\t\t\t\t\t// Core framework
\t\t\t\t\t\t'framework': [
\t\t\t\t\t\t\t'svelte',
\t\t\t\t\t\t\t'@sveltejs/kit'
\t\t\t\t\t\t],
\t\t\t\t\t\t// UI libraries
\t\t\t\t\t\t'ui-vendor': [
\t\t\t\t\t\t\t'lucide-svelte',
\t\t\t\t\t\t\t'@tiptap/core',
\t\t\t\t\t\t\t'@tiptap/starter-kit',
\t\t\t\t\t\t\t'@tiptap/extension-link',
\t\t\t\t\t\t\t'@tiptap/extension-image'
\t\t\t\t\t\t],
\t\t\t\t\t\t// Data layer
\t\t\t\t\t\t'data-layer': [
\t\t\t\t\t\t\t'@supabase/supabase-js',
\t\t\t\t\t\t\t'@supabase/ssr'
\t\t\t\t\t\t],
\t\t\t\t\t\t// Utilities
\t\t\t\t\t\t'utils': [
\t\t\t\t\t\t\t'date-fns',
\t\t\t\t\t\t\t'date-fns-tz',
\t\t\t\t\t\t\t'tailwind-merge',
\t\t\t\t\t\t\t'sanitize-html',
\t\t\t\t\t\t\t'marked'
\t\t\t\t\t\t],
\t\t\t\t\t\t// Heavy vendors
\t\t\t\t\t\t'ai-vendor': ['openai'],
\t\t\t\t\t\t'google-vendor': [
\t\t\t\t\t\t\t'googleapis',
\t\t\t\t\t\t\t'google-auth-library'
\t\t\t\t\t\t],
\t\t\t\t\t\t'stripe-vendor': ['stripe']
\t\t\t\t\t},
\t\t\t\t\t
\t\t\t\t\t// Asset naming for better caching
\t\t\t\t\tassetFileNames: (assetInfo) => {
\t\t\t\t\t\tif (assetInfo.name.endsWith('.css')) {
\t\t\t\t\t\t\treturn 'assets/css/[name]-[hash][extname]';
\t\t\t\t\t\t}
\t\t\t\t\t\treturn 'assets/[name]-[hash][extname]';
\t\t\t\t\t},
\t\t\t\t\tchunkFileNames: 'chunks/[name]-[hash].js',
\t\t\t\t\tentryFileNames: 'entries/[name]-[hash].js'
\t\t\t\t}
\t\t\t}
\t\t},

\t\t// Worker options
\t\tworker: {
\t\t\tformat: 'es',
\t\t\tplugins: []
\t\t},

\t\t// SSR options
\t\tssr: {
\t\t\tnoExternal: isDev ? [] : ['@supabase/ssr']
\t\t}
\t};
});
`;

writeFileSync('vite.config.optimized.ts', viteConfigOptimized);
console.log('✅ Created vite.config.optimized.ts\n');

// 3. Create build metrics script
console.log('📊 Creating build metrics script...');
const buildMetricsScript = `// scripts/build-metrics.js
import { statSync, readdirSync } from 'fs';
import { join } from 'path';
import { table } from 'table';

function getDirectorySize(dir) {
\tlet size = 0;
\ttry {
\t\tconst files = readdirSync(dir, { withFileTypes: true });
\t\tfor (const file of files) {
\t\t\tconst path = join(dir, file.name);
\t\t\tif (file.isDirectory()) {
\t\t\t\tsize += getDirectorySize(path);
\t\t\t} else {
\t\t\t\tsize += statSync(path).size;
\t\t\t}
\t\t}
\t} catch (e) {
\t\t// Directory doesn't exist
\t}
\treturn size;
}

function formatBytes(bytes) {
\tconst sizes = ['B', 'KB', 'MB', 'GB'];
\tif (bytes === 0) return '0 B';
\tconst i = Math.floor(Math.log(bytes) / Math.log(1024));
\treturn (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

console.log('\\n📊 Build Metrics Report\\n');

// Measure build directory sizes
const metrics = [
\t['Directory', 'Size', 'Files'],
\t['build/', formatBytes(getDirectorySize('build')), readdirSync('build', { recursive: true }).length],
\t['.svelte-kit/', formatBytes(getDirectorySize('.svelte-kit')), 'N/A'],
\t['node_modules/', formatBytes(getDirectorySize('node_modules')), 'N/A']
];

console.log(table(metrics));

// Analyze chunks
console.log('\\n📦 Chunk Analysis:\\n');
try {
\tconst chunks = readdirSync('build/chunks');
\tconst chunkSizes = chunks
\t\t.map(chunk => ({
\t\t\tname: chunk,
\t\t\tsize: statSync(join('build/chunks', chunk)).size
\t\t}))
\t\t.sort((a, b) => b.size - a.size)
\t\t.slice(0, 10);

\tconst chunkTable = [
\t\t['Chunk', 'Size'],
\t\t...chunkSizes.map(c => [c.name, formatBytes(c.size)])
\t];
\tconsole.log(table(chunkTable));
} catch (e) {
\tconsole.log('No chunks directory found. Run build first.');
}
`;

writeFileSync('scripts/build-metrics.js', buildMetricsScript);
console.log('✅ Created build-metrics.js\n');

// 4. Create .gitignore additions
console.log('📝 Updating .gitignore...');
const gitignoreAdditions = `
# Build artifacts
build-logs.log
build-analysis.html
.tsbuildinfo
*.gz
*.br

# Performance
.size-limit.json
lighthouse-report.html
`;

try {
	const currentGitignore = readFileSync('.gitignore', 'utf8');
	if (!currentGitignore.includes('build-logs.log')) {
		writeFileSync('.gitignore', currentGitignore + gitignoreAdditions);
		console.log('✅ Updated .gitignore\n');
	}
} catch (e) {
	console.log('⚠️  Could not update .gitignore\n');
}

console.log(`
✨ Build optimizations applied!

Next steps:
1. Install new dependencies:
   pnpm add -D cross-env size-limit @size-limit/preset-app rollup-plugin-visualizer vite-plugin-compression

2. Test the optimized config:
   mv vite.config.ts vite.config.original.ts
   mv vite.config.optimized.ts vite.config.ts
   pnpm run build:analyze

3. Run build metrics:
   pnpm run build && node scripts/build-metrics.js

4. Compare build times:
   time pnpm run build

Happy building! 🚀
`);
