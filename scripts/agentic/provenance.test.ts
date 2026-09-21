// scripts/agentic/provenance.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	readSourceProvenance,
	readDeploymentProvenance,
	assertSourceProvenance
} from '../../packages/agentic-chat-runtime/src/provenance.mts';

test('fingerprints staged, unstaged, untracked and deleted executable files; ignores reports and secrets', () => {
	const root = mkdtempSync(join(tmpdir(), 'agentic-provenance-'));
	const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
	try {
		git('init');
		git('config', 'user.email', 'fixture@example.test');
		git('config', 'user.name', 'Fixture');
		mkdirSync(join(root, 'apps'));
		mkdirSync(join(root, 'output'));
		writeFileSync(join(root, '.gitignore'), 'output/\n.env\n');
		writeFileSync(join(root, 'apps', 'source.ts'), 'original');
		git('add', '.');
		git('commit', '-m', 'fixture');
		const clean = readSourceProvenance(root);
		// A Railway source archive of this commit must match the Git checkout.
		assert.deepEqual(readDeploymentProvenance({ RAILWAY_GIT_COMMIT_SHA: clean.gitSha }), clean);
		writeFileSync(join(root, 'output', 'scorecard.json'), '{}');
		writeFileSync(join(root, '.env'), 'secret');
		assert.deepEqual(readSourceProvenance(root), clean);
		writeFileSync(join(root, 'apps', 'source.ts'), 'edited');
		const edited = readSourceProvenance(root);
		assert.notEqual(edited.dirtyTreeSha256, clean.dirtyTreeSha256);
		git('add', 'apps');
		assert.deepEqual(readSourceProvenance(root), edited);
		writeFileSync(join(root, 'apps', 'new.ts'), 'new');
		const added = readSourceProvenance(root);
		assert.notEqual(added.dirtyTreeSha256, edited.dirtyTreeSha256);
		rmSync(join(root, 'apps', 'source.ts'));
		assert.notEqual(readSourceProvenance(root).dirtyTreeSha256, added.dirtyTreeSha256);
		assert.throws(() => assertSourceProvenance(clean, added, 'Old worker'), /mismatch/);
		assert.throws(() => assertSourceProvenance(clean, null, 'Missing worker'), /mismatch/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('deployment provenance accepts only an exact deployed SHA', () => {
	const sha = 'a'.repeat(40);
	assert.equal(readDeploymentProvenance({ SOURCE_REVISION: sha })?.gitSha, sha);
	assert.equal(
		readDeploymentProvenance({ RAILWAY_GIT_COMMIT_SHA: ' ', SOURCE_REVISION: sha })?.gitSha,
		sha
	);
	assert.equal(readDeploymentProvenance({ SOURCE_REVISION: 'main' }), null);
	assert.equal(readDeploymentProvenance({ npm_package_version: '1.0.0' }), null);
});
