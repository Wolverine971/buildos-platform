// apps/web/src/lib/tests/agentic-e2e/harness/no-legacy-stream-route.test.ts
//
// The harness drives exactly one transport: the production worker path in
// `worker-client.ts`. The legacy web SSE engine is being deleted, so a reference
// to its route anywhere in this Vitest lane is either a resurrected client or a
// stale comment that will mislead the next reader.
//
// The Playwright lane under `browser/` is deliberately excluded: it mocks the
// route the *app* still calls, and moves with the app, not with this harness.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const E2E_ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXCLUDED_DIRECTORIES = new Set(['browser', 'node_modules']);
// Assembled, not written literally, so this guard never matches itself.
const LEGACY_STREAM_ROUTE = ['', 'api', 'agent', 'v2', 'stream'].join('/');

function collectHarnessFiles(directory: string, found: string[] = []): string[] {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
			collectHarnessFiles(join(directory, entry.name), found);
			continue;
		}
		if (/\.(ts|md|json)$/.test(entry.name)) found.push(join(directory, entry.name));
	}
	return found;
}

describe('agentic e2e harness transport', () => {
	it('never references the legacy web stream route', () => {
		const files = collectHarnessFiles(E2E_ROOT);
		// Guard the guard: a broken root would make this test vacuously pass.
		expect(files.length).toBeGreaterThan(30);

		const offenders = files
			.filter((file) => readFileSync(file, 'utf8').includes(LEGACY_STREAM_ROUTE))
			.map((file) => relative(E2E_ROOT, file));

		expect(offenders, `${LEGACY_STREAM_ROUTE} must not appear in the harness`).toEqual([]);
	});

	it('exposes no module that can drive a turn outside the worker client', () => {
		const drivers = collectHarnessFiles(E2E_ROOT).filter((file) =>
			/export\s+async\s+function\s+runTurn\b/.test(readFileSync(file, 'utf8'))
		);
		expect(drivers.map((file) => relative(E2E_ROOT, file))).toEqual([]);
	});
});
