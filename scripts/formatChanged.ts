// scripts/formatChanged.ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { getChangedFiles, getRepoRoot } from './lib/changed-files';

/**
 * Runs `prettier --write` over only the files that changed on the local git
 * branch, instead of the whole repo. Prettier is invoked with
 * `--ignore-unknown` so files without a parser are skipped, and the root
 * `.prettierignore` is still honored. Files are passed in batches to stay
 * clear of the OS argument-length limit on large changesets.
 */
const BATCH_SIZE = 200;

function main() {
	const cwd = process.cwd();
	const repoRoot = getRepoRoot(cwd) ?? cwd;
	const changedFiles = getChangedFiles({ cwd });

	if (changedFiles.length === 0) {
		console.log('format:changed — no changed files to format.');
		return;
	}

	// Pass paths relative to the repo root so prettier resolves config/ignore
	// consistently regardless of the directory it's invoked from.
	const relativePaths = changedFiles.map((file) => path.relative(repoRoot, file));

	console.log(`format:changed — formatting ${relativePaths.length} changed file(s)...`);

	for (let i = 0; i < relativePaths.length; i += BATCH_SIZE) {
		const batch = relativePaths.slice(i, i + BATCH_SIZE);
		const result = spawnSync(
			'pnpm',
			['exec', 'prettier', '--write', '--ignore-unknown', ...batch],
			{
				cwd: repoRoot,
				stdio: 'inherit',
				shell: process.platform === 'win32'
			}
		);

		if (result.error) {
			console.error(result.error.message);
			process.exit(1);
		}
		if (result.status !== 0) {
			process.exit(result.status ?? 1);
		}
	}
}

main();
