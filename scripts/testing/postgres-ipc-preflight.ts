// scripts/testing/postgres-ipc-preflight.ts
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';

export function assertPostgresTestIpcAccess(testPath: string | undefined): void {
	if (platform() !== 'darwin' || !testPath?.endsWith('.postgres.test.ts')) return;

	// This suite can use an existing local server instead of starting initdb.
	if (
		testPath.endsWith('/libriAdmissionDispatcher.postgres.test.ts') &&
		process.env.LIBRI_TEST_DATABASE_URL?.trim()
	) {
		return;
	}

	// macOS sandboxes can let initdb allocate a System V segment but prevent
	// it from attaching or cleaning up. Each failed attempt can consume one
	// of the machine's 32 default slots. Check access without allocating IPC.
	const probe = spawnSync('/usr/bin/ipcs', ['-m'], {
		encoding: 'utf8',
		timeout: 5_000
	});
	if (probe.error || probe.status !== 0) {
		throw new Error(
			'Disposable PostgreSQL tests require access to macOS shared memory. ' +
				'Run this test command outside the agent sandbox with approved IPC access. ' +
				'Stopped before initdb to avoid leaking shared-memory slots.\n' +
				(probe.error?.message ?? probe.stderr?.trim() ?? 'ipcs failed')
		);
	}
}
