// scripts/testing/sveltekit-sync.mjs
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

// verify:static runs typechecks before lint because lint's agent-skill guardrail
// also initializes SvelteKit. Other local checks/dev servers can still overlap,
// so tolerate only transient ENOENTs inside SvelteKit's generated type directory.
function isGeneratedTypeRace(result, cwd) {
	if (result.error || result.signal || result.status === 0) return false;
	// Match the CLI's structured filesystem diagnostic, not application prose.
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '');
	const missingPath = output.match(
		/ENOENT: no such file or directory, (?:stat|lstat|scandir|open|unlink) '([^'\r\n]+)'/
	)?.[1];
	if (!missingPath) return false;
	const pathFromTypes = relative(resolve(cwd, '.svelte-kit/types'), resolve(cwd, missingPath));
	return (
		!isAbsolute(pathFromTypes) &&
		pathFromTypes !== '..' &&
		!pathFromTypes.startsWith(`..${sep}`)
	);
}

export async function syncWithRetry(
	run,
	{ cwd = process.cwd(), warn = console.warn, wait = setTimeout } = {}
) {
	for (let attempt = 1; ; attempt += 1) {
		const result = run();
		if (attempt === 3 || !isGeneratedTypeRace(result, cwd)) return result;
		// Another sync/dev process can delete a proxy between SvelteKit's readdir
		// and stat calls. Regenerate it; never remove a running dev server's cache.
		warn(`SvelteKit generated types changed during sync; retrying (${attempt}/2).`);
		await wait(250 * attempt);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const require = createRequire(resolve('package.json'));
	const packagePath = require.resolve('@sveltejs/kit/package.json');
	const kit = require(packagePath);
	const cli = resolve(dirname(packagePath), kit.bin['svelte-kit']);
	const result = await syncWithRetry(() =>
		spawnSync(process.execPath, [cli, 'sync', ...process.argv.slice(2)], {
			encoding: 'utf8',
			maxBuffer: 16 * 1024 * 1024,
			stdio: ['inherit', 'pipe', 'pipe']
		})
	);
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (result.error) console.error(result.error);
	process.exitCode = result.status ?? 1;
}
