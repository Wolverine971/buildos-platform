// apps/worker/tests/postgresIpcPreflight.test.ts
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPostgresTestIpcAccess } from '../../../scripts/testing/postgres-ipc-preflight';

// The shared setup imports the preflight before this file's mocks are installed.
vi.hoisted(() => vi.resetModules());
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('node:os', () => ({ platform: vi.fn() }));

const testPath = '/repo/apps/worker/tests/libriLifecycle.postgres.test.ts';

describe('disposable PostgreSQL IPC preflight', () => {
	beforeEach(() => {
		vi.mocked(platform).mockReturnValue('darwin');
		vi.mocked(spawnSync).mockReset();
		vi.stubEnv('LIBRI_TEST_DATABASE_URL', '');
	});

	afterEach(() => vi.unstubAllEnvs());

	it('rejects sandboxed PostgreSQL setup before initdb can allocate shared memory', () => {
		vi.mocked(spawnSync).mockReturnValue({
			pid: 1,
			output: [],
			stdout: '',
			stderr: 'ipcs: sysctlbyname: Operation not permitted',
			status: 1,
			signal: null
		});

		expect(() => assertPostgresTestIpcAccess(testPath)).toThrow(
			'Stopped before initdb to avoid leaking shared-memory slots'
		);
		expect(spawnSync).toHaveBeenCalledExactlyOnceWith('/usr/bin/ipcs', ['-m'], {
			encoding: 'utf8',
			timeout: 5_000
		});
	});

	it('allows PostgreSQL tests when IPC inspection succeeds', () => {
		vi.mocked(spawnSync).mockReturnValue({
			pid: 1,
			output: [],
			stdout: 'Shared Memory:',
			stderr: '',
			status: 0,
			signal: null
		});
		expect(() => assertPostgresTestIpcAccess(testPath)).not.toThrow();
	});

	it('reports a failed IPC probe without starting PostgreSQL', () => {
		vi.mocked(spawnSync).mockReturnValue({
			pid: 0,
			output: [],
			stdout: '',
			stderr: '',
			status: null,
			signal: null,
			error: new Error('spawn ETIMEDOUT')
		});
		expect(() => assertPostgresTestIpcAccess(testPath)).toThrow('spawn ETIMEDOUT');
	});

	it.each([undefined, '/repo/apps/worker/tests/agenticChatBootstrap.test.ts'])(
		'leaves ordinary unit tests independent of PostgreSQL: %s',
		(path) => {
			assertPostgresTestIpcAccess(path);
			expect(spawnSync).not.toHaveBeenCalled();
		}
	);

	it('does not require the macOS IPC command on other platforms', () => {
		vi.mocked(platform).mockReturnValue('linux');
		assertPostgresTestIpcAccess(testPath);
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it('allows the admission suite to use its existing local database', () => {
		vi.stubEnv('LIBRI_TEST_DATABASE_URL', 'postgres://localhost/buildos_libri_test');
		assertPostgresTestIpcAccess(
			'/repo/apps/worker/tests/libriAdmissionDispatcher.postgres.test.ts'
		);
		expect(spawnSync).not.toHaveBeenCalled();
	});
});
