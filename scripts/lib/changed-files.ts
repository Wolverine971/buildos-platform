// scripts/lib/changed-files.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Returns the absolute paths of files that have changed on the local git
 * branch. "Changed" is the union of:
 *   - commits on this branch vs the merge-base with the default branch
 *   - staged + unstaged working-tree changes
 *   - untracked (but not git-ignored) files
 *
 * Deleted/renamed-away files are filtered out (only existing files returned).
 * If git is unavailable or the merge-base can't be resolved, that source is
 * skipped gracefully so the working-tree changes are still returned.
 */
export function getChangedFiles(options: { baseBranch?: string; cwd?: string } = {}): string[] {
	const cwd = options.cwd ?? process.cwd();
	const repoRoot = getRepoRoot(cwd);
	if (!repoRoot) {
		return [];
	}

	const relativePaths = new Set<string>();

	// 1. Commits on this branch vs the merge-base with the default branch.
	const baseRef = resolveMergeBase(repoRoot, options.baseBranch);
	if (baseRef) {
		for (const file of gitLines(repoRoot, ['diff', '--name-only', baseRef])) {
			relativePaths.add(file);
		}
	}

	// 2. Staged + unstaged changes vs HEAD.
	for (const file of gitLines(repoRoot, ['diff', '--name-only', 'HEAD'])) {
		relativePaths.add(file);
	}

	// 3. Untracked files (respecting .gitignore).
	for (const file of gitLines(repoRoot, ['ls-files', '--others', '--exclude-standard'])) {
		relativePaths.add(file);
	}

	const absolutePaths: string[] = [];
	for (const rel of relativePaths) {
		const abs = path.resolve(repoRoot, rel);
		// Skip files that were deleted or renamed away.
		if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
			absolutePaths.push(abs);
		}
	}

	return absolutePaths.sort();
}

export function getRepoRoot(cwd: string): string | null {
	try {
		return execFileSync('git', ['rev-parse', '--show-toplevel'], {
			cwd,
			encoding: 'utf8'
		}).trim();
	} catch {
		return null;
	}
}

function resolveMergeBase(repoRoot: string, explicitBase?: string): string | null {
	const candidates = explicitBase
		? [explicitBase]
		: ['main', 'master', 'origin/main', 'origin/master'];

	for (const branch of candidates) {
		// Don't diff a branch against itself (e.g. when checked out on main).
		if (isCurrentBranch(repoRoot, branch)) {
			continue;
		}
		try {
			const base = execFileSync('git', ['merge-base', 'HEAD', branch], {
				cwd: repoRoot,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore']
			}).trim();
			if (base) {
				return base;
			}
		} catch {
			// Branch doesn't exist or no common ancestor — try the next candidate.
		}
	}

	return null;
}

function isCurrentBranch(repoRoot: string, branch: string): boolean {
	try {
		const current = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
			cwd: repoRoot,
			encoding: 'utf8'
		}).trim();
		return current === branch || `origin/${current}` === branch;
	} catch {
		return false;
	}
}

function gitLines(repoRoot: string, args: string[]): string[] {
	try {
		const out = execFileSync('git', args, {
			cwd: repoRoot,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
		return out
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}
