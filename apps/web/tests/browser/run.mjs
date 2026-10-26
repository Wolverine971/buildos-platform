// apps/web/tests/browser/run.mjs
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';
const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '../..');
const repo = resolve(app, '../..');
const scratch = await mkdtemp(join(tmpdir(), 'buildos-browser-'));
const isolatedApp = join(scratch, 'apps/web');
// Do not inherit provider credentials, feature overrides, NODE_OPTIONS or .env files.
const env = Object.fromEntries(
	['PATH', 'HOME', 'TMPDIR', 'CI', 'PLAYWRIGHT_BROWSERS_PATH'].flatMap((key) =>
		process.env[key] ? [[key, process.env[key]]] : []
	)
);
Object.assign(env, {
	NODE_ENV: 'production',
	VERCEL: '1',
	NODE_OPTIONS: `--max-old-space-size=6144 --import=${join(here, 'network-guard.mjs')}`,
	BUILDOS_BROWSER_APP_DIR: isolatedApp,
	BUILDOS_BROWSER_FIXTURE: '1'
});
function run(command, args, cwd) {
	return new Promise((res, rej) => {
		const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
		const terminate = () => child.kill('SIGTERM');
		process.once('SIGTERM', terminate);
		process.once('SIGINT', terminate);
		child.once('error', rej);
		child.once('exit', (code) => {
			process.off('SIGTERM', terminate);
			process.off('SIGINT', terminate);
			code === 0 ? res() : rej(new Error(`${command} exited ${code}`));
		});
	});
}
// Compile production route files for the journeys; the normal CI build still
// compiles every route. Non-route helpers stay available for relative imports.
const smokeRoutes = [
	'',
	'auth/login',
	'api/auth/login',
	'api/auth/logout',
	'api/auth/session',
	'today',
	'api/today',
	'api/today/changes',
	'projects',
	'projects/[id]',
	'api/onto/projects',
	'api/onto/projects/[id]',
	'api/onto/projects/[id]/full',
	'api/onto/projects/[id]/members',
	'api/onto/projects/[id]/tasks',
	'api/onto/tasks/[id]',
	'api/onto/tasks/[id]/documents',
	'api/onto/tasks/[id]/relationships',
	'invites',
	'api/onto/invites/pending',
	'api/onto/invites/[inviteId]/accept',
	'api/inbox/count',
	'api/chat/sessions',
	'api/chat/sessions/[id]',
	'api/chat/sessions/[id]/messages',
	'api/chat/sessions/[id]/share',
	'api/notifications',
	'api/notifications/unread-count',
	'api/daily-briefs/ensure-today',
	'api/agent/v2/prewarm',
	'api/agent/v2/turns',
	'api/agent/v2/turns/[turnRunId]/reconcile',
	'api/agent/v2/turns/[turnRunId]/cancel'
];

try {
	await mkdir(isolatedApp, { recursive: true });
	const ignored = new Set([
		'node_modules',
		'.svelte-kit',
		'.vercel',
		'build',
		'dist',
		'coverage',
		'test-results',
		'playwright-report',
		'.turbo',
		'docs',
		'scripts',
		'tests'
	]);
	await cp(app, isolatedApp, {
		recursive: true,
		filter: (source) => {
			const parts = relative(app, source).split('/');
			if (
				parts[0] === 'src' &&
				parts[1] === 'routes' &&
				/^\+(page|layout|error|server)\./.test(parts.at(-1) ?? '')
			) {
				return smokeRoutes.includes(parts.slice(2, -1).join('/'));
			}
			return (
				!ignored.has(parts[0]) &&
				!parts.some((part) => part.startsWith('.env') || part === '.tsbuildinfo')
			);
		}
	});
	for (const name of ['node_modules', 'packages', 'scripts'])
		await symlink(join(repo, name), join(scratch, name));
	await symlink(join(app, 'node_modules'), join(isolatedApp, 'node_modules'));
	await cp(join(repo, 'package.json'), join(scratch, 'package.json'));
	await cp(join(repo, 'pnpm-workspace.yaml'), join(scratch, 'pnpm-workspace.yaml'));
	// This is the real application source/config, with deployment packaging and marketing
	// prerendering disabled. No auth bypass, fixture route, or mock is shipped to production.
	await cp(join(isolatedApp, 'svelte.config.js'), join(isolatedApp, 'svelte.config.base.js'));
	await writeFile(
		join(isolatedApp, 'svelte.config.js'),
		`import base from './svelte.config.base.js';\nexport default { ...base, kit: { ...base.kit, adapter: undefined, prerender: { entries: [], crawl: false } } };\n`
	);
	const example = parse(await readFile(join(app, '.env.example')));
	// Keep declared static-env names available while removing every example provider value.
	const fixtureEnv = Object.fromEntries(Object.keys(example).map((key) => [key, '']));
	Object.assign(fixtureEnv, {
		PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
		PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
		PRIVATE_SUPABASE_SERVICE_KEY: 'fixture-service-key',
		PUBLIC_APP_URL: 'http://127.0.0.1:4173',
		PUBLIC_SITE_URL: 'http://127.0.0.1:4173',
		ENABLE_STRIPE: 'false',
		PRIVATE_ENABLE_STRIPE: 'false',
		PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE: 'false'
	});
	await writeFile(
		join(isolatedApp, '.env'),
		Object.entries(fixtureEnv)
			.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
			.join('\n')
	);
	await run(
		process.execPath,
		[join(app, 'node_modules/@sveltejs/kit/svelte-kit.js'), 'sync'],
		isolatedApp
	);
	await run(process.execPath, [join(app, 'node_modules/vite/bin/vite.js'), 'build'], isolatedApp);
	console.log(`Isolated browser build ready: ${isolatedApp}`);
	await run(
		process.execPath,
		[
			join(app, 'node_modules/@playwright/test/cli.js'),
			'test',
			'--config',
			'playwright.config.smoke.ts',
			...process.argv.slice(2)
		],
		app
	);
} finally {
	if (process.env.BUILDOS_BROWSER_KEEP_BUILD === '1')
		console.log(`Kept isolated build: ${isolatedApp}`);
	else await rm(scratch, { recursive: true, force: true });
}
