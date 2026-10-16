// scripts/testing/sveltekit-sync.test.mjs
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { syncWithRetry } from './sveltekit-sync.mjs';

const cwd = resolve('apps/web');
const success = { status: 0, stdout: '', stderr: '' };
const failure = (path, extra = {}) => ({
	status: 1,
	stdout: '',
	stderr: `\x1b[31m> ENOENT: no such file or directory, stat '${resolve(cwd, path)}'\x1b[39m`,
	...extra
});

async function runResults(results) {
	let attempts = 0;
	const warnings = [];
	const delays = [];
	const result = await syncWithRetry(() => results[attempts++], {
		cwd,
		warn: (warning) => warnings.push(warning),
		wait: async (delay) => delays.push(delay)
	});
	return { result, attempts, warnings, delays };
}

test('recovers when a concurrent sync removes a generated layout proxy', async () => {
	const { result, attempts, warnings } = await runResults([
		failure('.svelte-kit/types/src/routes/proxy+layout.server.ts'),
		success
	]);
	assert.equal(result, success);
	assert.equal(attempts, 2);
	assert.equal(warnings.length, 1);
});

test('preserves the failure after bounded retries if generated files keep disappearing', async () => {
	const missing = failure('.svelte-kit/types/route_meta_data.json');
	const { result, attempts, delays } = await runResults([missing, missing, missing]);
	assert.equal(result, missing);
	assert.equal(attempts, 3);
	assert.deepEqual(delays, [250, 500]);
});

test('stops retrying as soon as a real configuration error appears', async () => {
	const configError = { status: 2, stderr: 'Invalid Svelte config' };
	const { result, attempts } = await runResults([
		failure('.svelte-kit/types/src/routes/proxy+layout.server.ts'),
		configError
	]);
	assert.equal(result, configError);
	assert.equal(attempts, 2);
});

test('does not retry missing source files, unrelated failures, or interrupted commands', async () => {
	for (const result of [
		success,
		failure('src/routes/+layout.server.ts'),
		failure('.svelte-kit/types-other/file.ts'),
		failure('.svelte-kit/types/../tsconfig.json'),
		{ status: 2, stderr: 'Invalid Svelte config' },
		failure('.svelte-kit/types/file.ts', { status: null, signal: 'SIGTERM' }),
		failure('.svelte-kit/types/file.ts', { status: null, error: new Error('spawn failed') })
	]) {
		const actual = await runResults([result]);
		assert.equal(actual.result, result);
		assert.equal(actual.attempts, 1);
		assert.deepEqual(actual.warnings, []);
	}
});
